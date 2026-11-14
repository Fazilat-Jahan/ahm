"""CRUD and role access for logs, symptoms, reminders, follow-ups and
game state."""

import asyncio

import pytest
from sqlalchemy import text

from app.db.session import make_engine
from app.tests.conftest import API, log_body, new_id


def post_log(client, member, **fields):
    return client.post(f"{API}/logs", json=log_body(**fields), headers=member.headers)


# ---- logs ---------------------------------------------------------------


def test_log_create_read_update(client, crew) -> None:
    body = log_body(heart_rate=72, bp_systolic=118, bp_diastolic=76, sleep_hours=7.5)
    created = client.post(f"{API}/logs", json=body, headers=crew.alice.headers)
    assert created.status_code == 200, created.text
    data = created.json()
    # Every response is labelled with whose data it is.
    assert data["astronaut_id"] == crew.alice.id
    assert data["name"] == crew.alice.name
    assert data["crew_code"] == "AST-001"
    assert data["heart_rate"] == 72 and data["sleep_hours"] == 7.5
    assert data["spo2"] is None  # skipped measurements stay empty
    assert data["version"] == 1

    # Same id again = update, not a second row (idempotent).
    body["heart_rate"] = 80
    updated = client.post(f"{API}/logs", json=body, headers=crew.alice.headers)
    assert updated.status_code == 200
    assert updated.json()["heart_rate"] == 80
    assert updated.json()["version"] == 2

    listed = client.get(f"{API}/logs", headers=crew.alice.headers).json()
    assert len(listed) == 1 and listed[0]["id"] == body["id"]


def test_one_log_per_astronaut_per_date(client, crew) -> None:
    assert post_log(client, crew.alice, log_date="2026-11-14").status_code == 200
    second = post_log(client, crew.alice, log_date="2026-11-14")
    assert second.status_code == 409
    assert "already exists" in second.json()["detail"]
    # Another astronaut can of course log the same date.
    assert post_log(client, crew.bob, log_date="2026-11-14").status_code == 200


def test_log_range_and_today(client, crew) -> None:
    for day in ("2026-11-10", "2026-11-12", "2026-11-14"):
        assert post_log(client, crew.alice, log_date=day, heart_rate=70).status_code == 200

    ranged = client.get(
        f"{API}/logs", params={"from": "2026-11-11", "to": "2026-11-13"},
        headers=crew.alice.headers,
    ).json()
    assert [row["log_date"] for row in ranged] == ["2026-11-12"]

    today = client.get(
        f"{API}/logs/today", params={"on": "2026-11-14"}, headers=crew.alice.headers
    )
    assert today.status_code == 200 and today.json()["log_date"] == "2026-11-14"
    none = client.get(
        f"{API}/logs/today", params={"on": "2026-11-13"}, headers=crew.alice.headers
    )
    assert none.status_code == 404


@pytest.mark.parametrize(
    ("field", "low", "high"),
    [
        ("heart_rate", 19, 251),
        ("bp_systolic", 49, 261),
        ("bp_diastolic", 29, 161),
        ("glucose_mgdl", 19.9, 600.1),
        ("temperature_c", 29.9, 43.1),
        ("spo2", 49, 101),
        ("sleep_hours", -0.1, 24.1),
        ("sleep_quality", 0, 6),
        ("mood", 0, 6),
        ("stress", 0, 6),
        ("team_relations", 0, 6),
        ("weight_kg", 19.9, 250.1),
        ("exercise_resistance_min", -1, 601),
        ("exercise_cardio_min", -1, 601),
        ("water_ml", -1, 10001),
        ("calories", -1, 10001),
    ],
)
def test_impossible_values_are_rejected(client, crew, field, low, high) -> None:
    for value in (low, high):
        response = post_log(client, crew.alice, **{field: value})
        assert response.status_code == 422, (field, value)
    assert client.get(f"{API}/logs", headers=crew.alice.headers).json() == []


@pytest.mark.parametrize(
    ("field", "low", "high"),
    [
        ("heart_rate", 20, 250),
        ("bp_systolic", 50, 260),
        ("bp_diastolic", 30, 160),
        ("glucose_mgdl", 20, 600),
        ("temperature_c", 30, 43),
        ("spo2", 50, 100),
        ("sleep_hours", 0, 24),
        ("weight_kg", 20, 250),
        ("water_ml", 0, 10000),
    ],
)
def test_boundary_values_are_accepted(client, crew, field, low, high) -> None:
    assert post_log(client, crew.alice, log_date="2026-11-13", **{field: low}).status_code == 200
    assert post_log(client, crew.alice, log_date="2026-11-14", **{field: high}).status_code == 200


def test_negative_radiation_rejected(client, crew) -> None:
    assert post_log(client, crew.alice, radiation_msv=-0.1).status_code == 422
    assert post_log(client, crew.alice, radiation_msv=0.4).status_code == 200


# ---- role access (the same rules for every data endpoint) -----------------


def test_astronaut_cannot_read_another_astronauts_data(client, crew) -> None:
    assert post_log(client, crew.bob, heart_rate=70).status_code == 200
    params = {"astronaut_id": crew.bob.id}
    for path in ("/logs", "/symptoms", "/reminders", "/followups", "/gamification"):
        response = client.get(f"{API}{path}", params=params, headers=crew.alice.headers)
        assert response.status_code == 403, path
    today = client.get(
        f"{API}/logs/today", params={**params, "on": "2026-11-14"},
        headers=crew.alice.headers,
    )
    assert today.status_code == 403
    # ...and their own list does not leak Bob's log.
    assert client.get(f"{API}/logs", headers=crew.alice.headers).json() == []


def test_commander_and_surgeon_can_read_everyone(client, crew) -> None:
    assert post_log(client, crew.bob, heart_rate=70).status_code == 200
    params = {"astronaut_id": crew.bob.id}
    for member in (crew.commander, crew.surgeon, crew.admin):
        logs = client.get(f"{API}/logs", params=params, headers=member.headers)
        assert logs.status_code == 200, member.role
        assert [row["crew_code"] for row in logs.json()] == ["AST-002"]
        for path in ("/symptoms", "/reminders", "/followups", "/gamification"):
            response = client.get(f"{API}{path}", params=params, headers=member.headers)
            assert response.status_code == 200, (member.role, path)

    # The crew list now shows Bob's last check-in date.
    crew_list = client.get(f"{API}/astronauts", headers=crew.surgeon.headers).json()
    bob = next(row for row in crew_list if row["crew_code"] == "AST-002")
    assert bob["last_checkin_date"] == "2026-11-14"
    assert bob["latest_overall_status"] is None  # no evaluation stored yet


def test_commander_and_surgeon_cannot_write_anyone_elses_data(client, crew) -> None:
    bob_log = log_body(heart_rate=70)
    assert client.post(f"{API}/logs", json=bob_log, headers=crew.bob.headers).status_code == 200
    reminder = {
        "id": new_id(), "kind": "custom", "local_time": "08:00", "message": "Stretch",
    }
    assert client.post(f"{API}/reminders", json=reminder, headers=crew.bob.headers).status_code == 201

    for member in (crew.commander, crew.surgeon, crew.admin, crew.alice):
        headers = member.headers
        target = {"astronaut_id": crew.bob.id}
        attempts = [
            client.post(f"{API}/logs", json={**log_body("2026-11-13"), **target}, headers=headers),
            # overwrite Bob's existing log by reusing its id
            client.post(f"{API}/logs", json={**bob_log, "heart_rate": 200}, headers=headers),
            client.post(
                f"{API}/symptoms",
                json={"log_id": bob_log["id"], "symptoms": []},
                headers=headers,
            ),
            client.post(
                f"{API}/reminders",
                json={**reminder, "id": new_id(), **target},
                headers=headers,
            ),
            client.put(
                f"{API}/reminders/{reminder['id']}", json={"enabled": False}, headers=headers
            ),
            client.delete(f"{API}/reminders/{reminder['id']}", headers=headers),
            client.post(
                f"{API}/followups",
                json={
                    "id": new_id(), "action_id": "a1", "followup_date": "2026-11-14",
                    "response": "yes", **target,
                },
                headers=headers,
            ),
            client.put(
                f"{API}/gamification",
                json={"points": 999, "level": 5, "current_streak": 9, "best_streak": 9, **target},
                headers=headers,
            ),
        ]
        for index, response in enumerate(attempts):
            assert response.status_code == 403, (member.role, index, response.text)

    # Bob's data is exactly as he left it.
    log = client.get(f"{API}/logs", headers=crew.bob.headers).json()
    assert len(log) == 1 and log[0]["heart_rate"] == 70
    reminders = client.get(f"{API}/reminders", headers=crew.bob.headers).json()
    assert len(reminders) == 1 and reminders[0]["enabled"] is True
    assert client.get(f"{API}/gamification", headers=crew.bob.headers).json()["points"] == 0


def test_reading_another_astronaut_is_audited(client, crew, db_url) -> None:
    client.get(f"{API}/logs", params={"astronaut_id": crew.bob.id}, headers=crew.surgeon.headers)
    client.get(f"{API}/logs", headers=crew.surgeon.headers)  # own data: not audited

    async def rows() -> list[tuple]:
        engine = make_engine(db_url)
        async with engine.connect() as connection:
            result = await connection.execute(
                text("SELECT actor, action, entity FROM audit_log")
            )
            data = [tuple(row) for row in result]
        await engine.dispose()
        return data

    assert asyncio.run(rows()) == [("SRG-001 (surgeon)", "read", "daily_log")]


# ---- symptoms -----------------------------------------------------------


def test_symptoms_bulk_upsert(client, crew) -> None:
    log = log_body()
    client.post(f"{API}/logs", json=log, headers=crew.alice.headers)
    headache = {"id": new_id(), "symptom": "headache", "severity": 2}
    dizzy = {"id": new_id(), "symptom": "dizziness", "severity": 1}

    saved = client.post(
        f"{API}/symptoms",
        json={"log_id": log["id"], "symptoms": [headache, dizzy]},
        headers=crew.alice.headers,
    )
    assert saved.status_code == 200
    assert {row["symptom"] for row in saved.json()} == {"headache", "dizziness"}
    assert all(row["crew_code"] == "AST-001" for row in saved.json())

    # Sending the list again with a change replaces it: no duplicates.
    headache["severity"] = 3
    replaced = client.post(
        f"{API}/symptoms",
        json={"log_id": log["id"], "symptoms": [headache]},
        headers=crew.alice.headers,
    ).json()
    assert [(row["symptom"], row["severity"]) for row in replaced] == [("headache", 3)]

    # "None today".
    cleared = client.post(
        f"{API}/symptoms", json={"log_id": log["id"], "symptoms": []},
        headers=crew.alice.headers,
    )
    assert cleared.json() == []
    listed = client.get(
        f"{API}/symptoms", params={"log_id": log["id"]}, headers=crew.alice.headers
    )
    assert listed.json() == []


def test_symptom_validation(client, crew) -> None:
    log = log_body()
    client.post(f"{API}/logs", json=log, headers=crew.alice.headers)
    for symptom in (
        {"id": new_id(), "symptom": "not_a_symptom", "severity": 1},
        {"id": new_id(), "symptom": "headache", "severity": 0},
        {"id": new_id(), "symptom": "headache", "severity": 4},
    ):
        response = client.post(
            f"{API}/symptoms", json={"log_id": log["id"], "symptoms": [symptom]},
            headers=crew.alice.headers,
        )
        assert response.status_code == 422, symptom
    missing = client.post(
        f"{API}/symptoms", json={"log_id": new_id(), "symptoms": []},
        headers=crew.alice.headers,
    )
    assert missing.status_code == 404


# ---- reminders ------------------------------------------------------------


def test_reminder_crud(client, crew) -> None:
    headers = crew.alice.headers
    assert client.get(f"{API}/reminders", headers=headers).json() == []

    body = {"id": new_id(), "kind": "checkin", "local_time": "07:30", "message": "Daily check-in"}
    created = client.post(f"{API}/reminders", json=body, headers=headers)
    assert created.status_code == 201
    assert created.json()["days_of_week"] == [1, 2, 3, 4, 5, 6, 7]
    assert created.json()["enabled"] is True
    assert created.json()["crew_code"] == "AST-001"

    updated = client.put(
        f"{API}/reminders/{body['id']}",
        json={"enabled": False, "local_time": "08:15", "days_of_week": [7, 1]},
        headers=headers,
    )
    assert updated.status_code == 200
    assert updated.json()["enabled"] is False
    assert updated.json()["local_time"] == "08:15"
    assert updated.json()["days_of_week"] == [1, 7]
    assert updated.json()["version"] == 2

    assert client.delete(f"{API}/reminders/{body['id']}", headers=headers).status_code == 204
    assert client.get(f"{API}/reminders", headers=headers).json() == []
    assert client.delete(f"{API}/reminders/{body['id']}", headers=headers).status_code == 404


def test_reminder_validation(client, crew) -> None:
    base = {"kind": "custom", "local_time": "08:00", "message": "Stretch"}
    for override in (
        {"local_time": "25:00"},
        {"local_time": "8am"},
        {"message": ""},
        {"days_of_week": []},
        {"days_of_week": [0]},
        {"days_of_week": [8]},
    ):
        response = client.post(
            f"{API}/reminders", json={"id": new_id(), **base, **override},
            headers=crew.alice.headers,
        )
        assert response.status_code == 422, override


# ---- follow-ups and game state ---------------------------------------------


def test_followup_upsert(client, crew) -> None:
    body = {
        "id": new_id(), "action_id": "ACT-REST", "followup_date": "2026-11-14",
        "response": "partly",
    }
    created = client.post(f"{API}/followups", json=body, headers=crew.alice.headers)
    assert created.status_code == 200 and created.json()["response"] == "partly"

    body["response"] = "yes"
    updated = client.post(f"{API}/followups", json=body, headers=crew.alice.headers)
    assert updated.json()["response"] == "yes" and updated.json()["version"] == 2

    listed = client.get(f"{API}/followups", headers=crew.alice.headers).json()
    assert len(listed) == 1 and listed[0]["crew_code"] == "AST-001"

    bad = client.post(
        f"{API}/followups", json={**body, "id": new_id(), "response": "maybe"},
        headers=crew.alice.headers,
    )
    assert bad.status_code == 422


def test_game_state_is_empty_until_stored_and_separate_per_astronaut(client, crew) -> None:
    empty = client.get(f"{API}/gamification", headers=crew.alice.headers).json()
    assert empty["points"] == 0 and empty["level"] == 1 and empty["badges"] == []
    assert empty["updated_at"] is None  # nothing stored, nothing invented

    snapshot = {
        "points": 190, "level": 2, "current_streak": 7, "best_streak": 7,
        "badges": ["first_orbit"],
    }
    stored = client.put(f"{API}/gamification", json=snapshot, headers=crew.alice.headers)
    assert stored.status_code == 200
    assert stored.json()["points"] == 190 and stored.json()["updated_at"] is not None
    assert stored.json()["crew_code"] == "AST-001"

    assert client.get(f"{API}/gamification", headers=crew.bob.headers).json()["points"] == 0
    bad = client.put(
        f"{API}/gamification", json={**snapshot, "points": -5}, headers=crew.alice.headers
    )
    assert bad.status_code == 422
