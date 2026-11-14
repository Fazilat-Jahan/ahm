"""Async engine/session. One code path for both databases, chosen only by
DATABASE_URL (SPEC 7.2):

- ``sqlite+aiosqlite:///./ahm.db``     local / habitat, no internet needed
- ``postgresql+asyncpg://...``         Neon
"""

from collections.abc import AsyncIterator
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from sqlalchemy import event
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app.core.config import settings


def normalize_database_url(url: str) -> str:
    """Neon hands out URLs ending in ``?sslmode=require``. asyncpg does not
    know ``sslmode``; it wants ``ssl``. Rewrite that one parameter so the
    Neon string can be pasted into DATABASE_URL unchanged. ``channel_binding``
    (also in Neon's strings) is not an asyncpg option and is dropped."""
    if not url.startswith("postgresql+asyncpg"):
        return url
    parts = urlsplit(url)
    query = []
    for key, value in parse_qsl(parts.query, keep_blank_values=True):
        if key == "sslmode":
            query.append(("ssl", value))
        elif key == "channel_binding":
            continue
        else:
            query.append((key, value))
    return urlunsplit(parts._replace(query=urlencode(query)))


def make_engine(url: str | None = None, **kwargs) -> AsyncEngine:
    database_url = normalize_database_url(url or settings.database_url)
    engine = create_async_engine(database_url, **kwargs)
    if database_url.startswith("sqlite"):
        # SQLite ignores foreign keys unless asked, per connection.
        @event.listens_for(engine.sync_engine, "connect")
        def _enable_foreign_keys(dbapi_connection, _record) -> None:
            cursor = dbapi_connection.cursor()
            cursor.execute("PRAGMA foreign_keys=ON")
            cursor.close()

    return engine


engine = make_engine()
SessionLocal = async_sessionmaker(engine, expire_on_commit=False)


async def get_session() -> AsyncIterator[AsyncSession]:
    async with SessionLocal() as session:
        yield session
