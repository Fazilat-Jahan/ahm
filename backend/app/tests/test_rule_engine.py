"""The Python engine against the SAME shared files as the TypeScript one.

Nothing here is adjusted to make a test pass: the vectors, the golden
file and thresholds.json are read as they are. A mismatch means the two
engines disagree and must be reported, not papered over.
"""

import json
from pathlib import Path

import pytest

from app.services.rule_engine.config import (
    THRESHOLDS_PATH,
    get_status_for_value,
    indicator_configs,
    js_number,
    rules_version,
)
from app.services.rule_engine.engine import evaluate

ROOT = Path(__file__).resolve().parents[3]
VECTORS_FILE = ROOT / "shared" / "rule-test-vectors.json"
GOLDEN_FILE = ROOT / "shared" / "rule-engine-golden.json"

VECTORS = json.loads(VECTORS_FILE.read_text(encoding="utf-8"))
GOLDEN = json.loads(GOLDEN_FILE.read_text(encoding="utf-8"))


def test_same_rules_version_everywhere() -> None:
    assert rules_version() == VECTORS["rulesVersion"] == GOLDEN["rulesVersion"]


def test_loaded_a_non_trivial_number_of_vectors() -> None:
    assert len(VECTORS["vectors"]) > 50
    assert len(GOLDEN["results"]) == len(VECTORS["vectors"])


@pytest.mark.parametrize("vector", VECTORS["vectors"], ids=lambda v: v["name"])
def test_shared_vector(vector: dict) -> None:
    """Same assertions as frontend/tests/rules/engine.vectors.test.ts."""
    result = evaluate(vector["input"])
    expect = vector["expect"]

    if "overall" in expect:
        assert result["overall"] == expect["overall"]

    for indicator_id, status in expect.get("indicatorStatuses", {}).items():
        found = [i for i in result["indicators"] if i["id"] == indicator_id]
        assert found, f'expected indicator "{indicator_id}" to be present'
        assert found[0]["status"] == status, indicator_id

    assert sorted(f["id"] for f in result["flags"]) == sorted(expect["flagIds"])
    assert sorted(t["id"] for t in result["trends"]) == sorted(expect["trendIds"])

    if "escalationLevel" in expect:
        assert result["escalation"]["level"] == expect["escalationLevel"]

    # Every status shown carries a rule id and a value.
    for indicator in result["indicators"]:
        assert indicator["ruleId"]
        assert indicator["value"] is not None
    assert result["rulesVersion"] == rules_version()


@pytest.mark.parametrize(
    ("vector", "golden"),
    list(zip(VECTORS["vectors"], GOLDEN["results"], strict=True)),
    ids=lambda item: item["name"],
)
def test_full_output_matches_the_typescript_engine(vector: dict, golden: dict) -> None:
    """Stricter than the vectors: the complete result (messages, actions
    and their order, escalation text, explanation lines) must equal what
    the TypeScript engine produced for the same input."""
    assert vector["name"] == golden["name"]
    assert evaluate(vector["input"]) == golden["result"]


def test_engine_is_deterministic_and_does_not_change_its_input() -> None:
    for vector in VECTORS["vectors"][:20]:
        before = json.dumps(vector["input"], sort_keys=True)
        first = evaluate(vector["input"])
        second = evaluate(vector["input"])
        assert first == second
        assert json.dumps(vector["input"], sort_keys=True) == before


def test_thresholds_json_is_complete() -> None:
    assert THRESHOLDS_PATH.exists()
    ids = [config["id"] for config in indicator_configs()]
    assert len(ids) == len(set(ids)) >= 12
    for config in indicator_configs():
        assert config["bands"], config["id"]
        assert {"green", "yellow", "red", "critical"} == set(config["tips"])
        assert "source" in config and config["verified"] is False


def test_changing_a_threshold_changes_the_result() -> None:
    """Thresholds are config, not code."""
    heart_rate = next(c for c in indicator_configs() if c["id"] == "heart_rate")
    assert get_status_for_value(heart_rate, 100) == "green"
    edited = {**heart_rate, "bands": [{"status": "red", "min": 90}, *heart_rate["bands"]]}
    assert get_status_for_value(edited, 100) == "red"


def test_value_in_no_band_is_yellow_not_green() -> None:
    assert get_status_for_value({"bands": [{"status": "green", "min": 1, "max": 2}]}, 5) == "yellow"


def test_numbers_print_like_javascript() -> None:
    assert js_number(72) == "72"
    assert js_number(72.0) == "72"
    assert js_number(36.8) == "36.8"
    assert js_number(110.00000000000001) == "110.00000000000001"
