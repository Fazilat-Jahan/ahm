"""Loads thresholds.json: the server-side mirror of
frontend/config/thresholds.ts (bands, labels, units, tips) plus the
mission-phase constants from frontend/config/environments.ts.

The file is generated, never edited by hand: see
frontend/tests/rules/serverParity.test.ts, which also fails if it goes
stale. No number in this package duplicates a value from that file.
"""

import json
from functools import lru_cache
from pathlib import Path
from typing import Any

THRESHOLDS_PATH = Path(__file__).with_name("thresholds.json")

STATUS_RANK = {"green": 0, "yellow": 1, "red": 2, "critical": 3}


@lru_cache(maxsize=1)
def load_config() -> dict[str, Any]:
    with THRESHOLDS_PATH.open(encoding="utf-8") as handle:
        return json.load(handle)


def rules_version() -> str:
    return load_config()["rulesVersion"]


def indicator_configs() -> list[dict[str, Any]]:
    return load_config()["indicators"]


def get_indicator_config(indicator_id: str) -> dict[str, Any] | None:
    for config in indicator_configs():
        if config["id"] == indicator_id:
            return config
    return None


def adaptation() -> dict[str, Any]:
    return load_config()["adaptation"]


def worst(a: str, b: str) -> str:
    return a if STATUS_RANK[a] >= STATUS_RANK[b] else b


def milder(a: str, b: str) -> str:
    """The lower-severity of two statuses. Used where the SPEC states an
    ambiguous "A/B" result with no stated differentiator: never invent
    extra severity (same choice as the TypeScript engine)."""
    return a if STATUS_RANK[a] <= STATUS_RANK[b] else b


def get_status_for_value(config: dict[str, Any], value: float) -> str:
    """Bands one raw value. Bands are checked top to bottom, bounds are
    inclusive, a missing bound is open-ended. A value in no band (a gap in
    the table) is yellow, never silently green."""
    for band in config["bands"]:
        min_ok = band.get("min") is None or value >= band["min"]
        max_ok = band.get("max") is None or value <= band["max"]
        if min_ok and max_ok:
            return band["status"]
    return "yellow"


def js_number(value: float | int) -> str:
    """A number as JavaScript's template strings print it, so messages are
    identical in both engines: 72.0 -> "72", 36.8 -> "36.8"."""
    if isinstance(value, bool):
        return str(value).lower()
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    return repr(value)
