"""Test fixtures. Every test gets its own empty SQLite file: no network,
no shared state, and no pre-created astronauts — tests build the crew they
need through the real API (first-run registration, then admin)."""

import asyncio
import uuid
from collections.abc import Iterator
from dataclasses import dataclass

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import async_sessionmaker
from sqlalchemy.pool import NullPool

from app.db.models import Base
from app.db.session import get_session, make_engine
from app.main import app

API = "/api/v1"
PIN = "1234"


@pytest.fixture(autouse=True)
def fast_pin_hashing(monkeypatch) -> None:
    """Real PIN hashing is deliberately slow (310,000 PBKDF2 rounds). The
    round count is stored inside each hash, so tests can use fewer rounds
    without changing any behaviour under test."""
    monkeypatch.setattr("app.core.security._PBKDF2_ITERATIONS", 1_000)


@pytest.fixture
def db_url(tmp_path) -> str:
    return f"sqlite+aiosqlite:///{(tmp_path / 'test.db').as_posix()}"


@pytest.fixture
def client(db_url: str) -> Iterator[TestClient]:
    engine = make_engine(db_url, poolclass=NullPool)

    async def create_schema() -> None:
        async with engine.begin() as connection:
            await connection.run_sync(Base.metadata.create_all)

    asyncio.run(create_schema())
    session_factory = async_sessionmaker(engine, expire_on_commit=False)

    async def override_session():
        async with session_factory() as session:
            yield session

    app.dependency_overrides[get_session] = override_session
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()
    asyncio.run(engine.dispose())


@dataclass
class Member:
    id: str
    crew_code: str
    name: str
    role: str
    headers: dict[str, str]


def register(
    client: TestClient,
    crew_code: str,
    role: str = "astronaut",
    headers: dict[str, str] | None = None,
    **extra,
):
    body = {
        "name": f"Test {crew_code}",
        "crew_code": crew_code,
        "role": role,
        "environment": "station",
        "mission_start": "2026-06-01",
        "pin": PIN,
        **extra,
    }
    return client.post(f"{API}/astronauts", json=body, headers=headers or {})


def login(client: TestClient, crew_code: str, pin: str = PIN):
    return client.post(f"{API}/auth/login", json={"crew_code": crew_code, "pin": pin})


def _member(client: TestClient, crew_code: str, role: str, admin_headers=None) -> Member:
    created = register(client, crew_code, role, admin_headers)
    assert created.status_code == 201, created.text
    token = login(client, crew_code).json()["access_token"]
    data = created.json()
    return Member(
        id=data["id"],
        crew_code=data["crew_code"],
        name=data["name"],
        role=role,
        headers={"Authorization": f"Bearer {token}"},
    )


@dataclass
class Crew:
    admin: Member
    alice: Member  # astronaut
    bob: Member  # astronaut
    commander: Member
    surgeon: Member


@pytest.fixture
def crew(client: TestClient) -> Crew:
    """First-run registration creates the admin; the admin registers the
    rest. All through the API, exactly as a real deployment would."""
    admin = _member(client, "ADM-001", "admin")
    return Crew(
        admin=admin,
        alice=_member(client, "AST-001", "astronaut", admin.headers),
        bob=_member(client, "AST-002", "astronaut", admin.headers),
        commander=_member(client, "CDR-001", "commander", admin.headers),
        surgeon=_member(client, "SRG-001", "surgeon", admin.headers),
    )


def new_id() -> str:
    return str(uuid.uuid4())


def log_body(log_date: str = "2026-11-14", **fields) -> dict:
    return {"id": new_id(), "log_date": log_date, **fields}
