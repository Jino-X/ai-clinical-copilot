from collections.abc import AsyncIterator

import httpx
import pytest
from asgi_lifespan import LifespanManager

from app.main import create_app


@pytest.fixture
async def client() -> AsyncIterator[httpx.AsyncClient]:
    app = create_app()
    async with LifespanManager(app):
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(
            transport=transport, base_url="http://test"
        ) as client:
            yield client


async def test_liveness_does_not_depend_on_the_database(
    client: httpx.AsyncClient,
) -> None:
    response = await client.get("/health/live")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


async def test_readiness_reports_unconfigured_dependencies_as_skipped(
    client: httpx.AsyncClient,
) -> None:
    response = await client.get("/health/ready")

    assert response.status_code == 200
    body = response.json()
    # No DATABASE_URL in the test environment, so this is "skipped", not an
    # error: a missing configuration is not the same as a broken dependency.
    assert body["checks"]["database"]["status"] == "skipped"
    assert body["status"] == "ok"


async def test_every_response_carries_a_request_id(
    client: httpx.AsyncClient,
) -> None:
    response = await client.get("/health/live")

    assert response.headers["x-request-id"]


async def test_security_headers_prevent_caching_of_api_responses(
    client: httpx.AsyncClient,
) -> None:
    response = await client.get("/health/live")

    assert response.headers["cache-control"] == (
        "no-store, no-cache, must-revalidate, private"
    )
    assert response.headers["x-content-type-options"] == "nosniff"


async def test_unknown_route_uses_the_shared_error_envelope(
    client: httpx.AsyncClient,
) -> None:
    response = await client.get("/does-not-exist")

    assert response.status_code == 404
    body = response.json()
    assert body["error"]["code"] == "http_error"
    assert "request_id" in body["error"]
