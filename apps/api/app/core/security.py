from __future__ import annotations

import asyncio
import time
from typing import Any
from uuid import UUID

import httpx
import jwt
from jwt import PyJWK, PyJWKSet
from pydantic import BaseModel, Field

from app.core.config import Settings
from app.core.errors import AuthenticationError
from app.core.logging import get_logger

logger = get_logger(__name__)

# Supabase signs access tokens with an asymmetric key (the default for new
# projects) or a shared secret (legacy). Anything else is not something we
# should be accepting.
ASYMMETRIC_ALGORITHMS = frozenset({"RS256", "RS384", "RS512", "ES256", "ES384", "EdDSA"})
SYMMETRIC_ALGORITHMS = frozenset({"HS256", "HS384", "HS512"})


class TokenClaims(BaseModel):
    """The subset of Supabase access token claims this application relies on.

    `sub` is the only claim that establishes identity. Note what is *not* here:
    no organization and no application role. Those are never taken from a
    token, because a token is client-held. They are resolved from
    `organization_members` on every request (PRD §18).
    """

    sub: UUID
    email: str | None = None
    # The Postgres role, always "authenticated" for a signed-in user. This is
    # not an application role.
    role: str | None = None
    session_id: str | None = None
    is_anonymous: bool = False
    expires_at: int | None = Field(default=None, alias="exp")

    model_config = {"populate_by_name": True}


class _JwksCache:
    """Caches the project's public keys.

    A JWT with an unknown `kid` triggers at most one refresh per
    `min_refresh_interval`, so a stream of tokens bearing bogus key ids cannot
    be used to hammer the Auth server through us.
    """

    def __init__(self, ttl_seconds: int, min_refresh_interval: float = 30.0) -> None:
        self._ttl = ttl_seconds
        self._min_refresh_interval = min_refresh_interval
        self._keys: dict[str, PyJWK] = {}
        self._fetched_at: float = 0.0
        self._last_attempt_at: float = 0.0
        self._lock = asyncio.Lock()

    @property
    def is_stale(self) -> bool:
        return (time.monotonic() - self._fetched_at) > self._ttl

    def get(self, kid: str) -> PyJWK | None:
        return self._keys.get(kid)

    def may_refresh(self) -> bool:
        return (time.monotonic() - self._last_attempt_at) > self._min_refresh_interval

    async def refresh(self, client: httpx.AsyncClient, jwks_url: str) -> None:
        # Single-flight: a burst of concurrent requests triggers one fetch.
        async with self._lock:
            if not self.is_stale and not self.may_refresh():
                return
            self._last_attempt_at = time.monotonic()
            try:
                response = await client.get(jwks_url, timeout=5.0)
                response.raise_for_status()
                jwk_set = PyJWKSet.from_dict(response.json())
            except Exception as exc:
                # Keep serving the previous keys rather than rejecting every
                # request because the discovery endpoint blipped.
                logger.warning("jwks_fetch_failed", error_type=type(exc).__name__)
                return

            self._keys = {key.key_id: key for key in jwk_set.keys if key.key_id}
            self._fetched_at = time.monotonic()
            logger.info("jwks_refreshed", key_count=len(self._keys))


class SupabaseTokenVerifier:
    """Verifies Supabase access tokens.

    Asymmetric tokens are verified locally against the project's JWKS, which
    keeps the Auth server out of the request path. Projects still using a
    shared secret either verify locally with that secret, or — per Supabase's
    guidance, since a shared secret cannot be revoked without redeploying —
    are validated by asking the Auth server.
    """

    def __init__(self, settings: Settings, client: httpx.AsyncClient) -> None:
        self._settings = settings
        self._client = client
        self._jwks = _JwksCache(settings.jwks_cache_seconds)

    async def verify(self, token: str) -> TokenClaims:
        if self._settings.supabase_url is None:
            raise AuthenticationError("Authentication is not configured")

        try:
            header = jwt.get_unverified_header(token)
        except jwt.PyJWTError:
            raise AuthenticationError("Malformed access token") from None

        algorithm = header.get("alg")

        if algorithm in ASYMMETRIC_ALGORITHMS:
            return await self._verify_asymmetric(token, header, algorithm)

        if algorithm in SYMMETRIC_ALGORITHMS:
            if self._settings.supabase_jwt_secret is not None:
                return self._verify_symmetric(token, algorithm)
            return await self._verify_via_auth_server(token)

        raise AuthenticationError("Unsupported token signing algorithm")

    async def _verify_asymmetric(
        self, token: str, header: dict[str, Any], algorithm: str
    ) -> TokenClaims:
        kid = header.get("kid")
        if not kid:
            raise AuthenticationError("Access token has no key id")

        key = self._jwks.get(kid)
        if key is None or self._jwks.is_stale:
            # Unknown kid usually means the project rotated its signing key.
            await self._jwks.refresh(self._client, self._settings.jwks_url)
            key = self._jwks.get(kid)

        if key is None:
            raise AuthenticationError("Access token signing key is not recognised")

        return self._decode(token, key.key, [algorithm])

    def _verify_symmetric(self, token: str, algorithm: str) -> TokenClaims:
        secret = self._settings.supabase_jwt_secret
        if secret is None:
            raise AuthenticationError("Authentication is not configured")
        return self._decode(token, secret.get_secret_value(), [algorithm])

    def _decode(self, token: str, key: Any, algorithms: list[str]) -> TokenClaims:
        try:
            payload = jwt.decode(
                token,
                key=key,
                algorithms=algorithms,
                audience=self._settings.supabase_jwt_audience,
                issuer=self._settings.jwt_issuer,
                options={
                    "require": ["exp", "sub", "aud"],
                    "verify_exp": True,
                    "verify_aud": True,
                    "verify_iss": True,
                    "verify_signature": True,
                },
            )
        except jwt.ExpiredSignatureError:
            raise AuthenticationError("Access token has expired") from None
        except jwt.PyJWTError:
            # The specific reason is deliberately not echoed back to the caller.
            raise AuthenticationError("Invalid access token") from None

        return self._to_claims(payload)

    async def _verify_via_auth_server(self, token: str) -> TokenClaims:
        """Ask Supabase Auth to validate the token.

        Required for shared-secret projects when we hold no secret. Costs a
        network round trip per request, which is one of several reasons to
        prefer asymmetric signing keys.
        """
        if self._settings.supabase_anon_key is None:
            raise AuthenticationError("Authentication is not configured")

        try:
            response = await self._client.get(
                f"{self._settings.jwt_issuer}/user",
                headers={
                    "Authorization": f"Bearer {token}",
                    "apikey": self._settings.supabase_anon_key.get_secret_value(),
                },
                timeout=5.0,
            )
        except httpx.HTTPError as exc:
            logger.warning("auth_server_unreachable", error_type=type(exc).__name__)
            raise AuthenticationError("Could not validate access token") from None

        if response.status_code != 200:
            raise AuthenticationError("Invalid access token")

        user = response.json()
        return TokenClaims(
            sub=user["id"],
            email=user.get("email"),
            role=user.get("role"),
            is_anonymous=user.get("is_anonymous", False),
        )

    @staticmethod
    def _to_claims(payload: dict[str, Any]) -> TokenClaims:
        try:
            claims = TokenClaims.model_validate(payload)
        except Exception:
            raise AuthenticationError("Access token claims are malformed") from None

        # An anonymous Supabase user is a real signed-in principal but has no
        # verified identity, so it must never reach patient data.
        if claims.is_anonymous:
            raise AuthenticationError("Anonymous sessions are not permitted")

        return claims
