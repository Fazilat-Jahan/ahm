"""Step 7: guidance builder. Port of frontend/lib/rules/guidance.ts.

Texts are the same strings as the TypeScript engine. No drug names or
doses anywhere; the medical kit is mentioned only as generic text.
"""

from typing import Any

from app.services.rule_engine.config import get_indicator_config, js_number

INDICATOR_CATEGORY = {
    "heart_rate": "medical",
    "bp_systolic": "medical",
    "bp_diastolic": "medical",
    "glucose_mgdl": "nutrition",
    "temperature_c": "medical",
    "spo2": "medical",
    "sleep_hours": "rest",
    "mood": "mental",
    "exercise_minutes": "exercise",
    "water_ml": "hydration",
    "radiation_dose_pct": "medical",
    "team_relations": "mental",
}

RULE_CATEGORY = {
    "CMB-CHEST-01": "medical",
    "CMB-CO2-01": "environment",
    "CMB-INF-01": "medical",
    "CMB-CV-01": "medical",
    "CMB-HYP-01": "medical",
    "CMB-VIS-01": "medical",
    "CMB-DEHY-01": "hydration",
    "CMB-GLU-01": "nutrition",
    "CMB-HYPO-01": "nutrition",
    "CMB-SAM-01": "rest",
    "CMB-MENT-01": "mental",
    "CMB-SAFETY-01": "mental",
    "CMB-BACK-01": "exercise",
    "CMB-HYPOX-01": "medical",
    "CMB-DCS-01": "medical",
    "CMB-IMM-01": "medical",
    "TRD-SLP-01": "rest",
    "TRD-SLP-02": "rest",
    "TRD-MOOD-01": "mental",
    "TRD-BP-01": "medical",
    "TRD-HR-01": "medical",
    "TRD-EXR-01": "exercise",
    "TRD-WGT-01": "nutrition",
    "TRD-RAD-01": "medical",
    "TRD-MISS-01": "measure",
    "TRD-TEAM-01": "mental",
}

STATUS_PRIORITY = {"critical": 1, "red": 2, "yellow": 3, "green": 4}

MAX_ACTIONS = 4
MAX_ACTION_LENGTH = 140

ESCALATION_TEXT = {
    "none": "No escalation needed today.",
    "self_care": "Self-care: follow today's actions above and re-measure anything borderline.",
    "contact_surgeon": "Contact the flight surgeon. Share your last 3 values and today's symptoms. See the onboard medical kit (check your mission formulary) for general supportive care.",
    "emergency": "Emergency: stop activity, secure yourself, alert the crew, and contact the flight surgeon now. See the onboard medical kit (check your mission formulary) for general supportive care.",
}

ESCALATION_LEVEL = {
    "critical": "emergency",
    "red": "contact_surgeon",
    "yellow": "self_care",
    "green": "none",
}


def _clamp(text: str) -> str:
    if len(text) > MAX_ACTION_LENGTH:
        return f"{text[: MAX_ACTION_LENGTH - 1]}…"
    return text


def _explanation(indicators, flags, trends, overall: str) -> list[str]:
    lines = [f"Overall status: {overall}."]
    for indicator in indicators:
        if indicator["status"] == "green":
            continue
        lines.append(
            f"{indicator['ruleId']}: {indicator['id']}={js_number(indicator['value'])} -> {indicator['status']}."
        )
    for flag in flags:
        lines.append(f"{flag['id']}: {flag['message']}")
    for trend in trends:
        lines.append(f"{trend['id']}: {trend['message']}")
    return lines


def _actions_from_indicators(indicators) -> list[dict[str, Any]]:
    actions = []
    for indicator in indicators:
        status = indicator["status"]
        if status == "green":
            continue
        config = get_indicator_config(indicator["id"])
        tips = (config or {}).get("tips", {}).get(status) or []
        if not tips:
            continue
        actions.append(
            {
                "id": f"{indicator['ruleId']}-tip",
                "priority": STATUS_PRIORITY[status],
                "text": _clamp(tips[0]),
                "category": INDICATOR_CATEGORY.get(indicator["id"], "measure"),
            }
        )
        if status in ("yellow", "red"):
            label = config["label"] if config else indicator["id"]
            actions.append(
                {
                    "id": f"{indicator['ruleId']}-remeasure",
                    "priority": STATUS_PRIORITY[status],
                    "text": _clamp(f"Re-check {label} after resting 10-15 minutes."),
                    "category": "measure",
                }
            )
    return actions


def _actions_from_rules(items, default_category: str) -> list[dict[str, Any]]:
    return [
        {
            "id": f"{item['id']}-action",
            "priority": STATUS_PRIORITY[item["status"]],
            "text": _clamp(item["message"]),
            "category": RULE_CATEGORY.get(item["id"], default_category),
        }
        for item in items
    ]


def _pick_top_actions(candidates: list[dict[str, Any]]) -> list[dict[str, Any]]:
    seen: set[str] = set()
    unique = []
    for action in candidates:
        if action["id"] in seen:
            continue
        seen.add(action["id"])
        unique.append(action)
    # sorted() is stable, like Array.prototype.sort in the TS engine.
    return sorted(unique, key=lambda action: action["priority"])[:MAX_ACTIONS]


def build_guidance(adjusted: dict[str, list], overall: str) -> dict[str, Any]:
    candidates = (
        _actions_from_rules(adjusted["flags"], "medical")
        + _actions_from_indicators(adjusted["indicators"])
        + _actions_from_rules(adjusted["trends"], "measure")
    )
    level = ESCALATION_LEVEL[overall]
    return {
        "actions": _pick_top_actions(candidates),
        "escalation": {"level": level, "text": ESCALATION_TEXT[level]},
        "explanation": _explanation(
            adjusted["indicators"], adjusted["flags"], adjusted["trends"], overall
        ),
    }
