import json
from pathlib import Path

from app.services.rule_engine.config import rules_version
from app.tests.conftest import API, log_body, new_id

ROOT = Path(__file__).resolve().parents[3]
VECTORS = json.loads((ROOT / "shared" / "rule-test-vectors.json").read_text(encoding="utf-8"))
GOLDEN = json.loads((ROOT / "shared" / "rule-engine-golden.json").read_text(encoding="utf-8"))

PAYLOAD = {
    "log": {"date": "2026-11-14", "heart_rate": 120, "spo2": 97},
    "symptoms": [{"symptom": "dizziness", "severity": 1}],
    "history": [],
    "mission": {"environment": "station", "missionDay": 30},
}


def test_evaluate_needs_a_token(client, crew) -> None:
    assert client.post(f"{API}/evaluate", json=PAYLOAD).status_code == 401


def test_every_shared_vector_through_the_api_matches_the_typescript_engine(client, crew) -> None:
    """The HTTP layer (validation, serialisation) must not change a result."""
    for vector, golden in zip(VECTORS["vectors"], GOLDEN["results"], strict=True):
        response = client.post(
            f"{API}/evaluate", json=vector["input"], headers=crew.alice.headers
        )
        assert response.status_code == 200, (vector["name"], response.text)
        body = response.json()
        assert body["result"] == golden["result"], vector["name"]
        assert body["rules_version"] == rules_version()
        assert body["stored"] is False and body["evaluation_id"] is None


def test_stateless_evaluation_stores_nothing(client, crew) -> None:
    response = client.post(f"{API}/evaluate", json=PAYLOAD, headers=crew.alice.headers)
    assert response.status_code == 200
    body = response.json()
    assert body["result"]["overall"] == "red"
    assert [f["id"] for f in body["result"]["flags"]] == ["CMB-CV-01"]
    assert body["crew_code"] == "AST-001"
    latest = client.get(f"{API}/evaluations/latest", headers=crew.alice.headers)
    assert latest.status_code == 404


def test_evaluation_is_stored_with_its_rules_version(client, crew) -> None:
    log = log_body(heart_rate=120, spo2=97)
    assert client.post(f"{API}/logs", json=log, headers=crew.alice.headers).status_code == 200
    evaluation_id = new_id()

    first = client.post(
        f"{API}/evaluate",
        json={**PAYLOAD, "log_id": log["id"], "evaluation_id": evaluation_id},
        headers=crew.alice.headers,
    )
    assert first.status_code == 200, first.text
    assert first.json()["stored"] is True
    assert first.json()["evaluation_id"] == evaluation_id

    latest = client.get(f"{API}/evaluations/latest", headers=crew.alice.headers).json()
    assert latest["id"] == evaluation_id
    assert latest["log_id"] == log["id"]
    assert latest["overall_status"] == "red"
    assert latest["rules_version"] == rules_version()
    assert latest["result"] == first.json()["result"]
    assert latest["result"]["rulesVersion"] == rules_version()
    assert latest["crew_code"] == "AST-001"

    # Sending the same evaluation again replaces it (no duplicate row).
    calmer = {**PAYLOAD, "log": {"date": "2026-11-14", "heart_rate": 70}, "symptoms": []}
    again = client.post(
        f"{API}/evaluate",
        json={**calmer, "log_id": log["id"], "evaluation_id": evaluation_id},
        headers=crew.alice.headers,
    )
    assert again.status_code == 200
    latest = client.get(f"{API}/evaluations/latest", headers=crew.alice.headers).json()
    assert latest["id"] == evaluation_id and latest["overall_status"] == "green"

    # The crew list now shows the real latest status.
    crew_list = client.get(f"{API}/astronauts", headers=crew.surgeon.headers).json()
    alice = next(row for row in crew_list if row["crew_code"] == "AST-001")
    assert alice["latest_overall_status"] == "green"
    bob = next(row for row in crew_list if row["crew_code"] == "AST-002")
    assert bob["latest_overall_status"] is None


def test_cannot_store_an_evaluation_on_someone_elses_log(client, crew) -> None:
    log = log_body(heart_rate=70)
    client.post(f"{API}/logs", json=log, headers=crew.bob.headers)
    for member in (crew.alice, crew.commander, crew.surgeon, crew.admin):
        response = client.post(
            f"{API}/evaluate", json={**PAYLOAD, "log_id": log["id"]}, headers=member.headers
        )
        assert response.status_code == 403, member.role
    assert client.get(f"{API}/evaluations/latest", headers=crew.bob.headers).status_code == 404
    missing = client.post(
        f"{API}/evaluate", json={**PAYLOAD, "log_id": new_id()}, headers=crew.alice.headers
    )
    assert missing.status_code == 404


def test_latest_evaluation_read_rules(client, crew) -> None:
    log = log_body(heart_rate=70)
    client.post(f"{API}/logs", json=log, headers=crew.bob.headers)
    client.post(
        f"{API}/evaluate",
        json={**PAYLOAD, "log": {"date": "2026-11-14", "heart_rate": 70}, "symptoms": [], "log_id": log["id"]},
        headers=crew.bob.headers,
    )
    params = {"astronaut_id": crew.bob.id}
    assert client.get(f"{API}/evaluations/latest", params=params, headers=crew.alice.headers).status_code == 403
    for member in (crew.commander, crew.surgeon):
        seen = client.get(f"{API}/evaluations/latest", params=params, headers=member.headers)
        assert seen.status_code == 200 and seen.json()["crew_code"] == "AST-002"


def test_evaluate_rejects_bad_input(client, crew) -> None:
    bad_payloads = [
        {**PAYLOAD, "log": {"date": "2026-11-14", "heart_rate": 300}},
        {**PAYLOAD, "log": {"date": "2026-11-14", "hart_rate": 70}},  # misspelt key
        {**PAYLOAD, "symptoms": [{"symptom": "not_a_symptom", "severity": 1}]},
        {**PAYLOAD, "symptoms": [{"symptom": "headache", "severity": 5}]},
        {**PAYLOAD, "mission": {"environment": "venus", "missionDay": 3}},
        {**PAYLOAD, "mission": {"environment": "station", "missionDay": 0}},
        {"log": {"date": "2026-11-14"}},  # no mission
    ]
    for payload in bad_payloads:
        response = client.post(f"{API}/evaluate", json=payload, headers=crew.alice.headers)
        assert response.status_code == 422, payload
