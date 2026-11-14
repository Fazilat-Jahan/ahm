import asyncio

from sqlalchemy import text

from app.core.security import create_access_token, hash_pin, verify_pin
from app.db.session import make_engine
from app.tests.conftest import API, PIN, login, new_id, register


def test_fresh_database_has_no_astronauts(client, db_url) -> None:
    async def count() -> int:
        engine = make_engine(db_url)
        async with engine.connect() as connection:
            result = await connection.execute(text("SELECT COUNT(*) FROM astronauts"))
            value = result.scalar_one()
        await engine.dispose()
        return value

    assert asyncio.run(count()) == 0
    assert login(client, "AST-001").status_code == 401


def test_pin_hash_roundtrip() -> None:
    stored = hash_pin("1234")
    assert "1234" not in stored
    assert stored != hash_pin("1234")  # random salt
    assert verify_pin("1234", stored)
    assert not verify_pin("4321", stored)
    assert not verify_pin("1234", None)
    assert not verify_pin("1234", "garbage")


def test_first_run_registration_then_admin_only(client) -> None:
    first = register(client, "adm-001", "admin")
    assert first.status_code == 201
    assert first.json()["crew_code"] == "ADM-001"  # normalised to upper case
    assert "pin" not in first.json() and "pin_hash" not in first.json()

    # A second registration with no token is refused.
    assert register(client, "AST-001").status_code == 401

    admin = {"Authorization": f"Bearer {login(client, 'ADM-001').json()['access_token']}"}
    assert register(client, "AST-001", headers=admin).status_code == 201

    # A plain astronaut cannot register others.
    astronaut = {"Authorization": f"Bearer {login(client, 'AST-001').json()['access_token']}"}
    assert register(client, "AST-002", headers=astronaut).status_code == 403


def test_duplicate_crew_code_rejected(client, crew) -> None:
    again = register(client, "ast-001", headers=crew.admin.headers)
    assert again.status_code == 409
    assert "already registered" in again.json()["detail"]


def test_registration_validation(client, crew) -> None:
    bad = [
        {"pin": "12"},
        {"pin": "abcd"},
        {"crew_code": "A"},
        {"crew_code": "AST 009"},
        {"name": "   "},
        {"environment": "venus"},
        {"role": "king"},
        {"mission_start": "2026-06-01", "mission_end": "2026-05-01"},
    ]
    for override in bad:
        body = {"crew_code": "AST-009", **override}
        crew_code = body.pop("crew_code")
        response = register(client, crew_code, headers=crew.admin.headers, **body)
        assert response.status_code == 422, override


def test_login_and_me(client, crew) -> None:
    response = login(client, "ast-001")  # case-insensitive crew ID
    assert response.status_code == 200
    body = response.json()
    assert body["role"] == "astronaut" and body["crew_code"] == "AST-001"
    assert body["astronaut_id"] == crew.alice.id

    me = client.get(f"{API}/astronauts/me", headers=crew.alice.headers)
    assert me.status_code == 200
    assert me.json()["crew_code"] == "AST-001"
    assert me.json()["name"] == crew.alice.name


def test_wrong_pin_and_unknown_crew_code_look_the_same(client, crew) -> None:
    wrong_pin = login(client, "AST-001", "9999")
    unknown = login(client, "AST-999", PIN)
    assert wrong_pin.status_code == unknown.status_code == 401
    assert wrong_pin.json() == unknown.json()


def test_requests_without_a_valid_token_are_refused(client, crew) -> None:
    for path in ("/astronauts", "/astronauts/me", "/logs", "/reminders", "/gamification"):
        assert client.get(f"{API}{path}").status_code == 401, path
        bad = client.get(f"{API}{path}", headers={"Authorization": "Bearer nope"})
        assert bad.status_code == 401, path


def test_token_for_a_deleted_astronaut_is_refused(client, crew) -> None:
    import uuid

    ghost = create_access_token(uuid.uuid4(), "admin", "ADM-999")
    response = client.get(f"{API}/astronauts", headers={"Authorization": f"Bearer {ghost}"})
    assert response.status_code == 401


def test_astronaut_list_is_scoped_by_role(client, crew) -> None:
    own = client.get(f"{API}/astronauts", headers=crew.alice.headers).json()
    assert [row["crew_code"] for row in own] == ["AST-001"]

    for member in (crew.commander, crew.surgeon, crew.admin):
        everyone = client.get(f"{API}/astronauts", headers=member.headers).json()
        assert len(everyone) == 5, member.role
        assert all(
            row["last_checkin_date"] is None and row["latest_overall_status"] is None
            for row in everyone
        )


def test_astronaut_cannot_open_another_profile(client, crew) -> None:
    url = f"{API}/astronauts/{crew.bob.id}"
    assert client.get(url, headers=crew.alice.headers).status_code == 403
    assert client.get(url, headers=crew.commander.headers).status_code == 200
    assert client.get(url, headers=crew.surgeon.headers).json()["crew_code"] == "AST-002"
    missing = client.get(f"{API}/astronauts/{new_id()}", headers=crew.surgeon.headers)
    assert missing.status_code == 404


def test_update_own_profile_and_environment(client, crew) -> None:
    url = f"{API}/astronauts/{crew.alice.id}"
    response = client.put(
        url,
        json={"environment": "mars_base", "gravity_changed_on": "2026-11-14"},
        headers=crew.alice.headers,
    )
    assert response.status_code == 200
    body = response.json()
    assert body["environment"] == "mars_base"
    assert body["gravity_changed_on"] == "2026-11-14"
    assert body["version"] == 2

    # New PIN works, old one does not.
    assert client.put(url, json={"pin": "567890"}, headers=crew.alice.headers).status_code == 200
    assert login(client, "AST-001", PIN).status_code == 401
    assert login(client, "AST-001", "567890").status_code == 200


def test_profile_write_rules(client, crew) -> None:
    bob = f"{API}/astronauts/{crew.bob.id}"
    change = {"environment": "rover"}
    # Nobody but an admin can change another astronaut's profile.
    for member in (crew.alice, crew.commander, crew.surgeon):
        assert client.put(bob, json=change, headers=member.headers).status_code == 403, member.role
    assert client.put(bob, json=change, headers=crew.admin.headers).status_code == 200

    # An astronaut cannot promote themselves.
    own = f"{API}/astronauts/{crew.alice.id}"
    assert client.put(own, json={"role": "admin"}, headers=crew.alice.headers).status_code == 403
    assert client.put(own, json={"crew_code": "ADM-777"}, headers=crew.alice.headers).status_code == 403
    assert client.get(own, headers=crew.alice.headers).json()["role"] == "astronaut"

    # Bad dates and a duplicate crew ID are rejected.
    bad_dates = client.put(own, json={"mission_end": "2020-01-01"}, headers=crew.alice.headers)
    assert bad_dates.status_code == 422
    duplicate = client.put(bob, json={"crew_code": "AST-001"}, headers=crew.admin.headers)
    assert duplicate.status_code == 409
