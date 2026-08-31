from __future__ import annotations

import json
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from uuid import UUID

import asyncpg

from app.core.config import Settings
from app.core.errors import ServiceUnavailableError
from app.core.logging import get_logger

logger = get_logger(__name__)


class Database:
    """Owns the asyncpg connection pool for the process lifetime.

    Two ways to get a connection, and the difference matters:

    * :meth:`tenant` — runs as the `authenticated` role with the caller's JWT
      claims set, so **Row Level Security applies**. Use this for anything
      touching tenant data. A forgotten `WHERE organization_id = ...` then
      returns nothing instead of leaking another tenant's records.
    * :meth:`privileged` — runs as the connection's own role, bypassing RLS.
      Reserved for writes a user must not be able to perform themselves, such
      as appending to the audit log.

    Defaulting to the privileged connection would make RLS decorative for
    every backend read. Hence the asymmetry in naming.
    """

    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._pool: asyncpg.Pool | None = None

    @property
    def configured(self) -> bool:
        return self._settings.database_url is not None

    async def connect(self) -> None:
        """Best-effort connect at startup.

        A database outage must not stop the container from starting: the
        readiness probe reports the failure and the load balancer withholds
        traffic until it recovers.
        """
        database_url = self._settings.database_url
        if database_url is None:
            logger.warning("database_not_configured")
            return

        dsn = database_url.get_secret_value()
        try:
            self._pool = await asyncpg.create_pool(
                dsn=dsn,
                min_size=self._settings.database_pool_min_size,
                max_size=self._settings.database_pool_max_size,
                command_timeout=30,
            )
            logger.info("database_pool_created")
        except Exception as exc:
            # Never log the exception message: a DSN with credentials can
            # appear in asyncpg connection errors.
            logger.error("database_pool_failed", error_type=type(exc).__name__)

    async def disconnect(self) -> None:
        if self._pool is not None:
            await self._pool.close()
            self._pool = None
            logger.info("database_pool_closed")

    @property
    def pool(self) -> asyncpg.Pool:
        if self._pool is None:
            raise ServiceUnavailableError("Database is not available")
        return self._pool

    @asynccontextmanager
    async def tenant(self, user_id: UUID) -> AsyncIterator[asyncpg.Connection]:
        """A connection with RLS in force for the given user.

        Both settings are transaction-local (`set local`, and `set_config` with
        `is_local => true`), so they are discarded when the transaction ends
        and cannot leak onto the next borrower of a pooled connection.
        """
        async with self.pool.acquire() as connection, connection.transaction():
            # Claims first: SET ROLE drops the privilege needed to set the
            # GUC on some configurations.
            await connection.execute(
                "select set_config('request.jwt.claims', $1, true)",
                json.dumps({"sub": str(user_id), "role": "authenticated"}),
            )
            await connection.execute("set local role authenticated")
            yield connection

    @asynccontextmanager
    async def privileged(self) -> AsyncIterator[asyncpg.Connection]:
        """A connection that bypasses RLS. Justify every use at the call site."""
        async with self.pool.acquire() as connection, connection.transaction():
            yield connection

    async def healthy(self) -> tuple[bool, str | None]:
        if not self.configured:
            return False, "DATABASE_URL not set"
        if self._pool is None:
            return False, "pool not initialised"
        try:
            async with self._pool.acquire() as connection:
                await connection.execute("SELECT 1")
        except Exception as exc:
            return False, type(exc).__name__
        return True, None
