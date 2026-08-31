"""Access token verification.

Every one of these is an authentication bypass if it regresses, so they assert
rejection explicitly rather than only testing the happy path.
"""

from __future__ import annotations

import time
from typing import Any
from uuid import uuid4

import httpx
import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import ec

from app.core.errors import AuthenticationError
from app.core.security import SupabaseTokenVerifier
from tests.conftest import TEST_ISSUER, make_settings


@pytest.fixture
def verifier(jwks_client: httpx.AsyncClient) -> SupabaseTokenVerifier:
    return SupabaseTokenVerifier(make_settings(), jwks_client)


async def test_accepts_a_valid_asymmetric_token(
    verifier: SupabaseTokenVerifier, make_token: Any
) -> None:
    user_id = uuid4()
    claims = await verifier.verify(make_token(subject=str(user_id)))

    assert claims.sub == user_id
    assert claims.email == "clinician@example.test"


async def test_rejects_an_expired_token(
    verifier: SupabaseTokenVerifier, make_token: Any
) -> None:
    with pytest.raises(AuthenticationError, match="expired"):
        await verifier.verify(make_token(expires_in=-60))


async def test_rejects_a_token_from_another_issuer(
    verifier: SupabaseTokenVerifier, make_token: Any
) -> None:
    # A token minted by a different Supabase project must not be accepted,
    # even though it is correctly signed by *someone*.
    with pytest.raises(AuthenticationError):
        await verifier.verify(
            make_token(issuer="https://attacker-project.supabase.co/auth/v1")
        )


async def test_rejects_a_token_for_another_audience(
    verifier: SupabaseTokenVerifier, make_token: Any
) -> None:
    with pytest.raises(AuthenticationError):
        await verifier.verify(make_token(audience="some-other-service"))


async def test_rejects_an_unknown_signing_key(
    verifier: SupabaseTokenVerifier, make_token: Any
) -> None:
    with pytest.raises(AuthenticationError, match="not recognised"):
        await verifier.verify(make_token(kid="a-key-we-have-never-seen"))


async def test_rejects_a_token_signed_by_a_different_key(
    verifier: SupabaseTokenVerifier, make_token: Any
) -> None:
    # Correct kid, correct claims, wrong private key: the signature check is
    # the only thing standing between this and a full account takeover.
    impostor_key = ec.generate_private_key(ec.SECP256R1())

    with pytest.raises(AuthenticationError, match="Invalid access token"):
        await verifier.verify(make_token(key=impostor_key))


async def test_rejects_a_tampered_payload(
    verifier: SupabaseTokenVerifier, make_token: Any
) -> None:
    token = make_token()
    header, _payload, signature = token.split(".")
    forged = jwt.utils.base64url_encode(b'{"sub":"11111111-1111-1111-1111-111111111111"}')

    with pytest.raises(AuthenticationError):
        await verifier.verify(f"{header}.{forged.decode()}.{signature}")


async def test_rejects_an_unsigned_token(
    verifier: SupabaseTokenVerifier,
) -> None:
    # The classic `alg: none` downgrade.
    unsigned = jwt.encode(
        {
            "sub": str(uuid4()),
            "iss": TEST_ISSUER,
            "aud": "authenticated",
            "exp": int(time.time()) + 3600,
        },
        key="",
        algorithm="none",
    )

    with pytest.raises(AuthenticationError, match="Unsupported token signing"):
        await verifier.verify(unsigned)


async def test_rejects_a_symmetric_token_when_no_secret_is_configured(
    jwks_client: httpx.AsyncClient, make_token: Any
) -> None:
    """An HS256 token must not be verifiable using a *public* key.

    This is the algorithm-confusion attack: if the implementation passed the
    JWKS public key as an HMAC secret, an attacker who knows the public key
    could mint valid tokens. With no secret configured we fall back to asking
    the Auth server, which in this test has no such route and so fails.
    """
    verifier = SupabaseTokenVerifier(make_settings(), jwks_client)

    # Stands in for the JWKS public key an attacker can simply download.
    public_key_material = "x" * 40

    with pytest.raises(AuthenticationError):
        await verifier.verify(make_token(algorithm="HS256", key=public_key_material))


async def test_accepts_a_symmetric_token_when_the_legacy_secret_is_configured(
    jwks_client: httpx.AsyncClient, make_token: Any
) -> None:
    secret = "legacy-shared-jwt-secret-value-of-sufficient-length"  # noqa: S105
    verifier = SupabaseTokenVerifier(
        make_settings(supabase_jwt_secret=secret), jwks_client
    )
    user_id = uuid4()

    claims = await verifier.verify(
        make_token(subject=str(user_id), algorithm="HS256", key=secret)
    )

    assert claims.sub == user_id


async def test_rejects_a_symmetric_token_signed_with_the_wrong_secret(
    jwks_client: httpx.AsyncClient, make_token: Any
) -> None:
    verifier = SupabaseTokenVerifier(
        make_settings(  # noqa: S106
            supabase_jwt_secret="the-real-secret-of-sufficient-length-000"
        ),
        jwks_client,
    )

    with pytest.raises(AuthenticationError):
        await verifier.verify(
            make_token(
                algorithm="HS256", key="a-guessed-secret-of-sufficient-length-0000000"
            )
        )


async def test_rejects_anonymous_sessions(
    verifier: SupabaseTokenVerifier, make_token: Any
) -> None:
    # Supabase anonymous sign-in produces a real, valid token with no verified
    # identity behind it. It must never reach patient data.
    with pytest.raises(AuthenticationError, match="Anonymous"):
        await verifier.verify(make_token(is_anonymous=True))


async def test_rejects_a_malformed_token(verifier: SupabaseTokenVerifier) -> None:
    with pytest.raises(AuthenticationError, match="Malformed"):
        await verifier.verify("this-is-not-a-jwt")


async def test_rejects_a_token_with_no_subject(
    verifier: SupabaseTokenVerifier, signing_key: ec.EllipticCurvePrivateKey
) -> None:
    from tests.conftest import TEST_KID

    token = jwt.encode(
        {
            "iss": TEST_ISSUER,
            "aud": "authenticated",
            "exp": int(time.time()) + 3600,
        },
        signing_key,
        algorithm="ES256",
        headers={"kid": TEST_KID},
    )

    with pytest.raises(AuthenticationError):
        await verifier.verify(token)


async def test_fails_closed_when_supabase_is_not_configured(
    jwks_client: httpx.AsyncClient, make_token: Any
) -> None:
    verifier = SupabaseTokenVerifier(make_settings(supabase_url=None), jwks_client)

    with pytest.raises(AuthenticationError, match="not configured"):
        await verifier.verify(make_token())


async def test_jwks_is_fetched_once_across_concurrent_requests(
    jwks: dict[str, Any], make_token: Any
) -> None:
    """A burst of first-time requests must not stampede the JWKS endpoint."""
    import asyncio

    fetches = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal fetches
        fetches += 1
        return httpx.Response(200, json=jwks)

    client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    verifier = SupabaseTokenVerifier(make_settings(), client)

    await asyncio.gather(*(verifier.verify(make_token()) for _ in range(10)))

    assert fetches == 1


async def test_serves_cached_keys_when_the_jwks_endpoint_fails(
    jwks: dict[str, Any], make_token: Any
) -> None:
    """A discovery-endpoint outage must not log every user out."""
    healthy = True

    def handler(request: httpx.Request) -> httpx.Response:
        if healthy:
            return httpx.Response(200, json=jwks)
        return httpx.Response(500, json={"msg": "down"})

    client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    verifier = SupabaseTokenVerifier(make_settings(), client)

    await verifier.verify(make_token())  # warms the cache
    healthy = False

    claims = await verifier.verify(make_token())
    assert claims.sub is not None
