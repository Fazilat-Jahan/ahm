"""Sync: push, pull, idempotency, soft delete, conflicts, crew registry."""

import asyncio
import base64
import hashlib
import re
import uuid
from pathlib import Path

import pytest
from sqlalchemy import text

from app.core.security import CLIENT_PIN_ITERATIONS
from app.db.session import make_engine
from app.tests.conftest import API, login

KEY = "test-sync-key-0123456789"
HEADERS = {"X-Sync-Key": KEY}
DEVICE_A = str(uuid.uuid4())
DEVICE_B = str(uuid.uuid4())
T0 = "2026-11-14T08:00:00.000Z"
T1 = "2026-11-14T09:00:00.000Z"
T2 = "2026-11-14T10:00:00.000Z"


@pytest.fixture(autouse=True)
def sync_key(monkeypatch) -> None:
    monkeypatch.setattr("app.core.config.settings.sync_key", KEY)


def uid() -> str:
    return str(uuid.uuid4())


def client_pin(pin: str) -> tuple[str, str]:
    """The app's PIN hash format (frontend/lib/db/pin.ts)."""
    salt = b"0123456789abcdef"
    digest = hashlib.pbkdf2_hmac("sha256", pin.encode(), salt, CLIENT_PIN_ITERATIONS, dklen=32)
    return base64.b64encode(digest).decode(), base64.b64encode(salt).decode()


def astronaut(crew_code: str = "AST-001", **over) -> dict:
    pin_hash, pin_salt = client_pin("1234")
    return {
        "id": uid(),
        "name": f"Test {crew_code}",
        "crewCode": crew_code,
        "role": "astronaut",
        "environment": "station",
        "missionStart": "2026-06-01",
        "pinHash": pin_hash,
        "pinSalt": pin_salt,
        "isActive": True,
        "createdAt": T0,
        "updatedAt": T0,
        "version": 1,
        **over,
    }


def daily_log(astronaut_id: str, date: str = "2026-11-14", **over) -> dict:
    return {
        "id": uid(),
        "astronautId": astronaut_id,
        "date": date,
        "isBackdated": False,
        "heart_rate": 72,
        "selfHarmThoughts": False,
        "firstReadings": {"heart_rate": 104},
        "createdAt": T0,
        "updatedAt": T0,
        "version": 1,
        **over,
    }


def item(entity: str, record: dict, op: str = "upsert", **over) -> dict:
    return {
        "entity": entity,
        "id": record["id"],
        "op": op,
        "version": record.get("version", 1),
        "updatedAt": record.get("updatedAt") or record.get("createdAt"),
        "data": record if op == "upsert" else None,
        **over,
    }


def push(client, items: list[dict], device: str = DEVICE_A, headers=HEADERS):
    return client.post(
        f"{API}/sync/push", json={"deviceId": device, "items": items}, headers=headers
    )


def pull(client, since: str | None = None):
    params = {"since": since} if since else {}
    response = client.get(f"{API}/sync/pull", params=params, headers=HEADERS)
    assert response.status_code == 200, response.text
    return response.json()


def count(db_url: str, table: str, where: str = "1=1") -> int:
    async def run() -> int:
        engine = make_engine(db_url)
        async with engine.connect() as connection:
            result = await connection.execute(text(f"SELECT COUNT(*) FROM {table} WHERE {where}"))
            value = result.scalar_one()
        await engine.dispose()
        return value

    return asyncio.run(run())


# ---- access -------------------------------------------------------------------


def test_sync_is_off_without_a_configured_key(client, monkeypatch) -> None:
    monkeypatch.setattr("app.core.config.settings.sync_key", "")
    assert push(client, []).status_code == 503
    assert client.get(f"{API}/sync/pull", headers=HEADERS).status_code == 503


def test_sync_needs_the_right_key(client) -> None:
    assert push(client, [], headers={}).status_code == 401
    assert push(client, [], headers={"X-Sync-Key": "wrong"}).status_code == 401
    assert client.get(f"{API}/sync/pull").status_code == 401
    assert push(client, []).status_code == 200


def test_empty_server_pull_is_empty(client) -> None:
    body = pull(client)
    assert all(rows == [] for rows in body["changes"].values())
    assert set(body["changes"]) == {
        "astronaut", "daily_log", "symptom_entry", "evaluation", "advice_followup", "reminder",
    }
    assert body["serverTime"].endswith("Z")


# ---- push / pull ----------------------------------------------------------------


def test_push_then_pull_roundtrip_is_lossless(client, db_url) -> None:
    alice = astronaut()
    log = daily_log(alice["id"])
    symptom = {
        "id": uid(), "logId": log["id"], "astronautId": alice["id"], "date": log["date"],
        "symptom": "headache", "severity": 2, "createdAt": T0, "updatedAt": T0, "version": 1,
    }
    evaluation = {
        "id": uid(), "logId": log["id"], "astronautId": alice["id"], "date": log["date"],
        "overallStatus": "green", "rulesVersion": "1.1.0",
        "result": {"overall": "green", "rulesVersion": "1.1.0"}, "createdAt": T0,
    }
    followup = {
        "id": uid(), "astronautId": alice["id"], "date": log["date"], "actionId": "HR-01-tip",
        "evaluationId": evaluation["id"], "response": "partly",
        "createdAt": T0, "updatedAt": T0, "version": 1,
    }
    reminder = {
        "id": uid(), "astronautId": alice["id"], "kind": "weekly", "label": "Weekly weight",
        "time": "09:00", "weekday": 0, "enabled": True,
        "createdAt": T0, "updatedAt": T0, "version": 1,
    }
    records = {
        "astronaut": alice, "daily_log": log, "symptom_entry": symptom,
        "evaluation": evaluation, "advice_followup": followup, "reminder": reminder,
    }
    response = push(client, [item(entity, record) for entity, record in records.items()])
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["conflicts"] == [] and body["rejected"] == []
    assert body["accepted"] == [record["id"] for record in records.values()]

    changes = pull(client)["changes"]
    for entity, record in records.items():
        assert len(changes[entity]) == 1, entity
        change = changes[entity][0]
        # Exactly what the device sent, including app-only fields.
        assert change["data"] == record, entity
        assert change["deleted"] is False

    # Typed columns were filled for server-side queries.
    assert count(db_url, "daily_logs", "heart_rate = 72 AND log_date = '2026-11-14'") == 1
    assert count(db_url, "reminders", "local_time = '09:00' AND message = 'Weekly weight'") == 1
    assert count(db_url, "evaluations", "overall_status = 'green' AND rules_version = '1.1.0'") == 1
    assert count(db_url, "sync_devices") == 1


def test_replaying_a_push_stores_everything_exactly_once(client, db_url) -> None:
    alice = astronaut()
    log = daily_log(alice["id"])
    items = [item("astronaut", alice), item("daily_log", log)]
    for _ in range(3):  # e.g. the response was lost and the device retried
        body = push(client, items).json()
        assert body["accepted"] == [alice["id"], log["id"]]
        assert body["conflicts"] == [] and body["rejected"] == []
    assert count(db_url, "astronauts") == 1
    assert count(db_url, "daily_logs") == 1
    assert count(db_url, "sync_conflicts") == 0
    assert len(pull(client)["changes"]["daily_log"]) == 1


def test_update_with_a_higher_version_replaces_the_record(client, db_url) -> None:
    alice = astronaut()
    log = daily_log(alice["id"])
    push(client, [item("astronaut", alice), item("daily_log", log)])
    edited = {**log, "heart_rate": 80, "version": 2, "updatedAt": T1}
    body = push(client, [item("daily_log", edited)]).json()
    assert body["accepted"] == [log["id"]]
    change = pull(client)["changes"]["daily_log"][0]
    assert change["version"] == 2 and change["data"]["heart_rate"] == 80
    assert count(db_url, "daily_logs") == 1
    assert count(db_url, "sync_conflicts") == 0


def test_pull_since_returns_only_later_changes(client) -> None:
    alice = astronaut()
    push(client, [item("astronaut", alice)])
    first = pull(client)
    assert len(first["changes"]["astronaut"]) == 1

    assert all(rows == [] for rows in pull(client, first["serverTime"])["changes"].values())

    log = daily_log(alice["id"])
    push(client, [item("daily_log", log)])
    later = pull(client, first["serverTime"])["changes"]
    assert [row["id"] for row in later["daily_log"]] == [log["id"]]
    assert later["astronaut"] == []


def test_pull_does_not_depend_on_device_clocks(client) -> None:
    """A record stamped far in the past by a device with a wrong clock is
    still delivered: the cursor is the server's time, not `updatedAt`."""
    alice = astronaut()
    push(client, [item("astronaut", alice)])
    cursor = pull(client)["serverTime"]
    old = daily_log(alice["id"], createdAt="2019-01-01T00:00:00.000Z", updatedAt="2019-01-01T00:00:00.000Z")
    push(client, [item("daily_log", old)])
    assert [row["id"] for row in pull(client, cursor)["changes"]["daily_log"]] == [old["id"]]


# ---- soft delete -----------------------------------------------------------------


def test_delete_is_soft_and_propagates(client, db_url) -> None:
    alice = astronaut()
    reminder = {
        "id": uid(), "astronautId": alice["id"], "kind": "custom", "label": "Stretch",
        "time": "10:00", "enabled": True, "createdAt": T0, "updatedAt": T0, "version": 1,
    }
    push(client, [item("astronaut", alice), item("reminder", reminder)])
    cursor = pull(client)["serverTime"]

    delete = {"entity": "reminder", "id": reminder["id"], "op": "delete", "updatedAt": T1}
    for _ in range(2):  # deleting twice is fine
        body = push(client, [delete]).json()
        assert body["accepted"] == [reminder["id"]] and body["rejected"] == []

    # The row and its content are still there, flagged deleted.
    assert count(db_url, "reminders") == 1
    assert count(db_url, "reminders", "deleted_at IS NOT NULL AND payload IS NOT NULL") == 1
    change = pull(client, cursor)["changes"]["reminder"][0]
    assert change["deleted"] is True and change["data"]["label"] == "Stretch"

    unknown = {"entity": "reminder", "id": uid(), "op": "delete"}
    assert push(client, [unknown]).json()["accepted"] == [unknown["id"]]


# ---- conflicts: nothing is ever lost -------------------------------------------------


def _two_devices_edit(client, newer_on: str):
    """Both devices hold log v1, both edit it offline to v2."""
    alice = astronaut()
    log = daily_log(alice["id"])
    push(client, [item("astronaut", alice), item("daily_log", log)], DEVICE_A)
    edit_a = {**log, "heart_rate": 90, "version": 2, "updatedAt": T2 if newer_on == "A" else T1}
    edit_b = {**log, "heart_rate": 60, "version": 2, "updatedAt": T1 if newer_on == "A" else T2}
    first = push(client, [item("daily_log", edit_a)], DEVICE_A).json()
    assert first["accepted"] == [log["id"]]
    second = push(client, [item("daily_log", edit_b)], DEVICE_B).json()
    return log, edit_a, edit_b, second


def test_version_conflict_server_copy_newer_keeps_both(client, db_url) -> None:
    log, edit_a, edit_b, second = _two_devices_edit(client, newer_on="A")
    assert second["accepted"] == []
    conflict = second["conflicts"][0]
    assert conflict["id"] == log["id"] and conflict["kind"] == "version"
    assert conflict["serverVersion"] == 2
    assert conflict["serverData"] == edit_a  # the device gets the winner

    # Live record is the newer one; the losing copy is kept verbatim.
    assert pull(client)["changes"]["daily_log"][0]["data"]["heart_rate"] == 90
    assert count(db_url, "daily_logs") == 1
    assert count(db_url, "sync_conflicts", "loser = 'client' AND kind = 'version'") == 1

    async def archived() -> str:
        engine = make_engine(db_url)
        async with engine.connect() as connection:
            row = (await connection.execute(text("SELECT losing_payload FROM sync_conflicts"))).scalar_one()
        await engine.dispose()
        return row

    assert '"heart_rate": 60' in asyncio.run(archived())


def test_version_conflict_device_copy_newer_wins_and_server_copy_is_kept(client, db_url) -> None:
    log, edit_a, edit_b, second = _two_devices_edit(client, newer_on="B")
    assert second["accepted"] == [log["id"]] and second["conflicts"] == []
    live = pull(client)["changes"]["daily_log"][0]
    assert live["data"]["heart_rate"] == 60
    assert live["version"] == 3  # above both copies, so every device takes it
    assert count(db_url, "sync_conflicts", "loser = 'server' AND kind = 'version'") == 1


def test_equal_timestamps_prefer_the_server(client, db_url) -> None:
    alice = astronaut()
    log = daily_log(alice["id"])
    push(client, [item("astronaut", alice), item("daily_log", log)], DEVICE_A)
    push(client, [item("daily_log", {**log, "heart_rate": 90, "version": 2, "updatedAt": T1})], DEVICE_A)
    tie = push(
        client, [item("daily_log", {**log, "heart_rate": 60, "version": 2, "updatedAt": T1})], DEVICE_B
    ).json()
    assert [c["kind"] for c in tie["conflicts"]] == ["version"]
    assert pull(client)["changes"]["daily_log"][0]["data"]["heart_rate"] == 90


def test_two_logs_for_one_date_keep_both(client, db_url) -> None:
    alice = astronaut()
    log_a = daily_log(alice["id"], heart_rate=70)
    log_b = daily_log(alice["id"], heart_rate=95, updatedAt=T2)
    symptom_b = {
        "id": uid(), "logId": log_b["id"], "astronautId": alice["id"], "date": log_b["date"],
        "symptom": "dizziness", "severity": 1, "createdAt": T2, "updatedAt": T2, "version": 1,
    }
    push(client, [item("astronaut", alice), item("daily_log", log_a)], DEVICE_A)
    body = push(client, [item("daily_log", log_b), item("symptom_entry", symptom_b)], DEVICE_B).json()

    assert body["accepted"] == [] and body["rejected"] == []
    kinds = {c["id"]: c["kind"] for c in body["conflicts"]}
    assert kinds == {log_b["id"]: "same_date", symptom_b["id"]: "parent_missing"}
    same_date = next(c for c in body["conflicts"] if c["kind"] == "same_date")
    assert same_date["serverData"] == log_a

    # One live log for the date; the other log AND its symptom are kept.
    assert count(db_url, "daily_logs") == 1
    assert count(db_url, "sync_conflicts") == 2
    assert count(db_url, "sync_conflicts", "kind = 'same_date'") == 1


# ---- validation -------------------------------------------------------------------


def test_bad_items_are_rejected_without_blocking_the_rest(client, db_url) -> None:
    alice = astronaut()
    good = daily_log(alice["id"], "2026-11-13")
    impossible = daily_log(alice["id"], "2026-11-14", heart_rate=400)
    stranger = daily_log(uid(), "2026-11-12")
    bad_symptom = {
        "id": uid(), "logId": good["id"], "astronautId": alice["id"], "date": good["date"],
        "symptom": "not_a_symptom", "severity": 1, "createdAt": T0, "updatedAt": T0, "version": 1,
    }
    body = push(
        client,
        [
            item("astronaut", alice),
            item("daily_log", impossible),
            item("daily_log", stranger),
            item("symptom_entry", bad_symptom),
            item("daily_log", good),
        ],
    ).json()
    assert body["accepted"] == [alice["id"], good["id"]]
    reasons = {r["id"]: r["reason"] for r in body["rejected"]}
    assert "heart_rate" in reasons[impossible["id"]]
    assert "astronaut" in reasons[stranger["id"]]
    assert "symptom" in reasons[bad_symptom["id"]].lower()
    assert count(db_url, "daily_logs") == 1


def test_same_crew_id_from_two_devices_is_rejected_not_merged(client, db_url) -> None:
    push(client, [item("astronaut", astronaut("AST-001"))], DEVICE_A)
    other = astronaut("ast-001", name="Someone Else")
    body = push(client, [item("astronaut", other)], DEVICE_B).json()
    assert body["accepted"] == []
    assert "crew ID" in body["rejected"][0]["reason"]
    assert count(db_url, "astronauts") == 1


def test_push_batch_limit(client) -> None:
    alice = astronaut()
    too_many = [item("astronaut", alice)] * 201
    assert push(client, too_many).status_code == 422


# ---- crew registry across devices ------------------------------------------------------


def test_second_device_sees_the_same_crew_and_can_use_the_same_pin(client) -> None:
    alice = astronaut("AST-001")
    commander = astronaut("CDR-001", role="commander")
    log = daily_log(alice["id"])
    push(client, [item("astronaut", alice), item("astronaut", commander), item("daily_log", log)], DEVICE_A)

    # Device B starts empty and pulls everything.
    changes = pull(client)["changes"]
    crew = {row["data"]["crewCode"]: row["data"] for row in changes["astronaut"]}
    assert set(crew) == {"AST-001", "CDR-001"}
    # The PIN hash travels, so the same PIN unlocks on the second device.
    assert crew["AST-001"]["pinHash"] == alice["pinHash"]
    assert crew["AST-001"]["pinSalt"] == alice["pinSalt"]
    assert [row["id"] for row in changes["daily_log"]] == [log["id"]]

    # A synced astronaut can also sign in to the API with that PIN.
    assert login(client, "AST-001", "1234").status_code == 200
    assert login(client, "AST-001", "9999").status_code == 401
    token = login(client, "CDR-001", "1234").json()["access_token"]
    crew_list = client.get(f"{API}/astronauts", headers={"Authorization": f"Bearer {token}"}).json()
    by_code = {row["crew_code"]: row for row in crew_list}
    assert by_code["AST-001"]["last_checkin_date"] == "2026-11-14"


def test_client_pin_iterations_match_the_frontend() -> None:
    source = Path(__file__).resolve().parents[3] / "frontend" / "lib" / "db" / "pin.ts"
    if not source.exists():
        pytest.skip("frontend not checked out")
    match = re.search(r"const ITERATIONS = ([\d_]+);", source.read_text(encoding="utf-8"))
    assert match and int(match.group(1).replace("_", "")) == CLIENT_PIN_ITERATIONS
