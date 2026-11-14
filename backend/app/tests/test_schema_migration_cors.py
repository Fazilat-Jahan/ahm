"""Migrations, parity with the frontend, and CORS."""

import re
import sqlite3
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy.dialects import postgresql
from sqlalchemy.schema import CreateTable

from app.core.constants import ENVIRONMENTS, ROLES, SYMPTOM_IDS
from app.db.models import Base
from app.db.session import normalize_database_url
from app.schemas.log import DailyLogIn
from app.tests.conftest import API

BACKEND = Path(__file__).resolve().parents[2]
FRONTEND = BACKEND.parent / "frontend"


def _alembic_config(url: str) -> Config:
    config = Config(str(BACKEND / "alembic.ini"))
    config.set_main_option("script_location", str(BACKEND / "alembic"))
    config.cmd_opts = type("Opts", (), {"x": [f"url={url}"]})()
    return config


def test_migrations_build_the_model_schema_on_sqlite_with_no_rows(tmp_path) -> None:
    db_file = tmp_path / "migrated.db"
    config = _alembic_config(f"sqlite+aiosqlite:///{db_file.as_posix()}")
    command.upgrade(config, "head")

    connection = sqlite3.connect(db_file)
    tables = {
        row[0]
        for row in connection.execute("SELECT name FROM sqlite_master WHERE type='table'")
    }
    assert tables - {"alembic_version"} == set(Base.metadata.tables)

    for table in Base.metadata.sorted_tables:
        columns = {row[1] for row in connection.execute(f"PRAGMA table_info({table.name})")}
        assert columns == {column.name for column in table.columns}, table.name
        # No seed data: every table is empty after migrating.
        count = connection.execute(f"SELECT COUNT(*) FROM {table.name}").fetchone()[0]
        assert count == 0, table.name
    connection.close()

    command.downgrade(config, "base")
    connection = sqlite3.connect(db_file)
    left = {
        row[0]
        for row in connection.execute("SELECT name FROM sqlite_master WHERE type='table'")
    }
    connection.close()
    assert left == {"alembic_version"}


def test_migration_files_contain_no_data_statements() -> None:
    for path in (BACKEND / "alembic" / "versions").glob("*.py"):
        source = path.read_text(encoding="utf-8")
        for forbidden in ("bulk_insert", "op.execute", "INSERT INTO", ".insert("):
            assert forbidden not in source, f"{path.name} contains {forbidden}"


def test_models_compile_for_postgresql() -> None:
    """No PostgreSQL server here, so this checks the DDL the same models
    produce for PostgreSQL: native UUID, JSON, timestamptz, bigserial."""
    ddl = "\n".join(
        str(CreateTable(table).compile(dialect=postgresql.dialect()))
        for table in Base.metadata.sorted_tables
    )
    assert "id UUID NOT NULL" in ddl
    assert "result_json JSON NOT NULL" in ddl
    assert "TIMESTAMP WITH TIME ZONE" in ddl
    assert "BIGSERIAL" in ddl
    assert "UNIQUE (astronaut_id, log_date)" in ddl


def test_neon_url_is_made_asyncpg_compatible() -> None:
    url = "postgresql+asyncpg://u:p@host.neon.tech/db?sslmode=require&channel_binding=require"
    assert normalize_database_url(url) == "postgresql+asyncpg://u:p@host.neon.tech/db?ssl=require"
    sqlite_url = "sqlite+aiosqlite:///./ahm.db"
    assert normalize_database_url(sqlite_url) == sqlite_url


# ---- parity with the frontend ------------------------------------------------


def _frontend(path: str) -> str:
    file = FRONTEND / path
    if not file.exists():
        pytest.skip(f"{path} not found (backend checked out without the frontend)")
    return file.read_text(encoding="utf-8")


def test_symptom_ids_match_the_frontend() -> None:
    source = _frontend("config/symptoms.ts")
    block = source.split("export const SYMPTOM_IDS = [", 1)[1].split("] as const", 1)[0]
    assert tuple(re.findall(r'"([a-z_]+)"', block)) == SYMPTOM_IDS


def test_roles_and_environments_match_the_frontend() -> None:
    roles = _frontend("lib/db/schema.ts")
    block = roles.split("export const ASTRONAUT_ROLES = [", 1)[1].split("] as const", 1)[0]
    assert tuple(re.findall(r'"([a-z_]+)"', block)) == ROLES
    envs = _frontend("lib/rules/types.ts")
    block = envs.split("export const ENVIRONMENTS = [", 1)[1].split("] as const", 1)[0]
    assert tuple(re.findall(r'"([a-z_]+)"', block)) == ENVIRONMENTS


def test_measurement_ranges_match_the_frontend() -> None:
    """Same sanity bounds on both sides (CLAUDE.md: "Zod on the client,
    Pydantic on the server, with the same ranges")."""
    source = _frontend("config/measurements.ts")
    # Each field is declared as `id: "<name>", ... min: N, [max: N]`; cut
    # the file at every `id:` so a field's bounds are read from its own
    # declaration only.
    chunks = re.split(r'\bid: "', source)[1:]
    frontend: dict[str, tuple[float, float | None]] = {}
    for chunk in chunks:
        name = chunk.split('"', 1)[0]
        low = re.search(r"\bmin: (-?[\d.]+)", chunk)
        high = re.search(r"\bmax: (-?[\d.]+)", chunk)
        if low:
            frontend[name] = (float(low.group(1)), float(high.group(1)) if high else None)

    checked = 0
    for name, field in DailyLogIn.model_fields.items():
        if name not in frontend:
            continue
        bounds = {type(m).__name__: m for m in field.metadata}
        low = getattr(bounds.get("Ge"), "ge", None)
        high = getattr(bounds.get("Le"), "le", None)
        assert (low, high) == frontend[name], name
        checked += 1
    assert checked >= 13


# ---- CORS ---------------------------------------------------------------------


@pytest.mark.parametrize(
    "origin",
    [
        "http://localhost:3100",
        "http://127.0.0.1:3100",
        "http://192.168.1.10:3100",
        "http://10.0.0.7:3100",
        "http://172.16.4.2:3100",
        "https://192.168.1.10",
    ],
)
def test_cors_allows_lan_origins(client, origin) -> None:
    response = client.options(
        f"{API}/logs",
        headers={
            "Origin": origin,
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "authorization,content-type",
        },
    )
    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == origin


@pytest.mark.parametrize(
    "origin",
    [
        "https://example.com",
        "http://192.168.1.10.example.com",
        "http://172.32.0.1:3100",
        "http://8.8.8.8:3100",
    ],
)
def test_cors_refuses_other_origins(client, origin) -> None:
    response = client.options(
        f"{API}/logs",
        headers={"Origin": origin, "Access-Control-Request-Method": "POST"},
    )
    assert "access-control-allow-origin" not in response.headers
