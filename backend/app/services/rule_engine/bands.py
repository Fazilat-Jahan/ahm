"""Step 1: per-indicator banding. Port of frontend/lib/rules/bands.ts."""

import math
from typing import Any

from app.services.rule_engine.config import (
    get_status_for_value,
    indicator_configs,
    js_number,
)

RULE_PREFIX = {
    "heart_rate": "HR",
    "bp_systolic": "BP-SYS",
    "bp_diastolic": "BP-DIA",
    "glucose_mgdl": "GLU",
    "temperature_c": "TEMP",
    "spo2": "SPO2",
    "sleep_hours": "SLP",
    "mood": "MOOD",
    "exercise_minutes": "EXR",
    "water_ml": "HYD",
    "radiation_dose_pct": "RAD",
    "team_relations": "TEAM",
}


def exercise_total(log: dict[str, Any]) -> float | None:
    resistance = log.get("exercise_resistance_min")
    cardio = log.get("exercise_cardio_min")
    if resistance is None and cardio is None:
        return None
    return (resistance or 0) + (cardio or 0)


def derive_bandable_values(
    log: dict[str, Any], mission: dict[str, Any]
) -> dict[str, float | None]:
    """Maps today's raw log (+ mission context, for radiation) onto the
    indicator ids. Exercise and radiation are computed; everything else is
    a direct field. None = not entered (measurements can be skipped)."""
    radiation_budget = mission.get("radiationDailyBudgetMsv")
    radiation = log.get("radiation_msv")
    radiation_pct = (
        None
        if radiation is None or not radiation_budget
        else (radiation / radiation_budget) * 100
    )
    return {
        "heart_rate": log.get("heart_rate"),
        "bp_systolic": log.get("bp_systolic"),
        "bp_diastolic": log.get("bp_diastolic"),
        "glucose_mgdl": log.get("glucose_mgdl"),
        "temperature_c": log.get("temperature_c"),
        "spo2": log.get("spo2"),
        "sleep_hours": log.get("sleep_hours"),
        "mood": log.get("mood"),
        "exercise_minutes": exercise_total(log),
        "water_ml": log.get("water_ml"),
        "radiation_dose_pct": radiation_pct,
        "team_relations": log.get("team_relations"),
    }


def evaluate_bands(log: dict[str, Any], mission: dict[str, Any]) -> list[dict[str, Any]]:
    values = derive_bandable_values(log, mission)
    results: list[dict[str, Any]] = []
    for config in indicator_configs():
        value = values.get(config["id"])
        if value is None or (isinstance(value, float) and math.isnan(value)):
            continue
        status = get_status_for_value(config, value)
        prefix = RULE_PREFIX.get(config["id"], config["id"].upper())
        results.append(
            {
                "id": config["id"],
                "value": value,
                "status": status,
                "ruleId": f"{prefix}-01",
                "message": f"{config['label']} {js_number(value)}{config['unit']} is {status}.",
            }
        )
    return results


def get_indicator_status(indicators: list[dict[str, Any]], indicator_id: str) -> str | None:
    for indicator in indicators:
        if indicator["id"] == indicator_id:
            return indicator["status"]
    return None
