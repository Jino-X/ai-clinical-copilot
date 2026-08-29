from typing import Annotated

from fastapi import Depends, Request

from app.core.config import Settings, get_settings
from app.db.pool import Database


def get_database(request: Request) -> Database:
    """The pool is created once in the lifespan and stored on app state."""
    database: Database = request.app.state.database
    return database


SettingsDep = Annotated[Settings, Depends(get_settings)]
DatabaseDep = Annotated[Database, Depends(get_database)]
