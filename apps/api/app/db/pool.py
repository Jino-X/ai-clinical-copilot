from __future__ import annotations

import asyncpg

from app.core.config import Settings
from app.core.errors import ServiceUnavailableError
from app.core.logging import get_logger

logger = get_logger(__name__)


class Database:
    """Owns the asyncpg connection pool for the process lifetime.

    Repositories receive connections from here rather than opening their own,
    so pool sizing stays a single, tunable decision.
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
