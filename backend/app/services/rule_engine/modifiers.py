"""Step 5: mission-phase / environment modifiers.
Port of frontend/lib/rules/modifiers.ts."""

from typing import Any

from app.services.rule_engine.config import adaptation


def is_within_adaptation_window(mission: dict[str, Any], days: int) -> bool:
    """The first `days` mission days, or the first `days` days after the
    astronaut moved between microgravity and partial gravity."""
    if mission["missionDay"] <= days:
        return True
    since_change = mission.get("daysSinceGravityChange")
    return since_change is not None and 1 <= since_change <= days


def _is_softenable(caused_by: list[str] | None) -> bool:
    if not caused_by:
        return False
    soften = adaptation()["softenSymptoms"]
    return all(symptom in soften for symptom in caused_by)


def apply_modifiers(adjusted: dict[str, list], mission: dict[str, Any]) -> dict[str, list]:
    """Inside the adaptation window, drop a result only if its status is
    exactly yellow AND it was caused solely by the early-adaptation
    symptoms. Red and critical are never touched."""
    if not is_within_adaptation_window(mission, adaptation()["softenDays"]):
        return adjusted

    def keep(item: dict[str, Any]) -> bool:
        return not (
            item["status"] == "yellow" and _is_softenable(item.get("causedBySymptoms"))
        )

    return {
        "indicators": [i for i in adjusted["indicators"] if keep(i)],
        "flags": [f for f in adjusted["flags"] if keep(f)],
        "trends": adjusted["trends"],
    }
