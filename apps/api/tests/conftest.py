from __future__ import annotations

import time
from typing import Any
from uuid import uuid4

import httpx
import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import ec
from jwt.algorithms import ECAlgorithm

from app.core.config import Environment, Settings

TEST_SUPABASE_URL = "https://test-project.supabase.co"
TEST_ISSUER = f"{TEST_SUPABASE_URL}/auth/v1"
TEST_KID = "test-signing-key-1"


def make_settings(**overrides: Any) -> Settings:
    """Settings built in isolation.

    `_env_file=None` matters: without it a developer's real apps/api/.env
    would leak into the test run and the assertions would depend on their
    machine.
    """
    defaults: dict[str, Any] = {
        "environment": Environment.LOCAL,
        "supabase_url": TEST_SUPABASE_URL,
        "supabase_anon_key": "test-anon-key",
    }
    return Settings(_env_file=None, **(defaults | overrides))


@pytest.fixture(scope="session")
def signing_key() -> ec.EllipticCurvePrivateKey:
    """A real ES256 key pair, matching what Supabase issues by default."""
    return ec.generate_private_key(ec.SECP256R1())


@pytest.fixture(scope="session")
def jwks(signing_key: ec.EllipticCurvePrivateKey) -> dict[str, Any]:
    public_jwk = ECAlgorithm.to_jwk(signing_key.public_key(), as_dict=True)
    return {"keys": [{**public_jwk, "kid": TEST_KID, "use": "sig", "alg": "ES256"}]}


@pytest.fixture
def make_token(signing_key: ec.EllipticCurvePrivateKey):
    """Mints access tokens shaped like Supabase's."""

    def _make(
        *,
        subject: str | None = None,
        issuer: str = TEST_ISSUER,
        audience: str = "authenticated",
        expires_in: int = 3600,
        kid: str = TEST_KID,
        algorithm: str = "ES256",
        key: Any = None,
        **extra_claims: Any,
    ) -> str:
        now = int(time.time())
        payload: dict[str, Any] = {
            "sub": subject or str(uuid4()),
            "iss": issuer,
            "aud": audience,
            "iat": now,
            "exp": now + expires_in,
            "email": "clinician@example.test",
            "role": "authenticated",
            "session_id": str(uuid4()),
            **extra_claims,
        }
        return jwt.encode(
            payload,
            key if key is not None else signing_key,
            algorithm=algorithm,
            headers={"kid": kid},
        )

    return _make


@pytest.fixture
def jwks_client(jwks: dict[str, Any]) -> httpx.AsyncClient:
    """An HTTP client that serves the test JWKS and nothing else.

    Any other request fails loudly, so a test cannot accidentally depend on
    the network.
    """

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/auth/v1/.well-known/jwks.json":
            return httpx.Response(200, json=jwks)
        return httpx.Response(404, json={"msg": "unexpected request in test"})

    return httpx.AsyncClient(transport=httpx.MockTransport(handler))
