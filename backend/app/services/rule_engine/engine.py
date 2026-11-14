"""Rule engine entry point (SPEC 4.1 / Appendix B). Python port of
frontend/lib/rules/engine.ts.

Pure and deterministic: no database, no network, no clock, no randomness,
no LLM. Input and output are plain dicts with exactly the same keys as the
TypeScript engine's `EvalInput` / `EvaluationResult`, so the two can be
compared field for field (shared/rule-test-vectors.json and
shared/rule-engine-golden.json).
"""

from typing import Any

from app.services.rule_engine.bands import evaluate_bands
from app.services.rule_engine.combos import evaluate_combos
from app.services.rule_engine.config import rules_version, worst
from app.services.rule_engine.guidance import build_guidance
from app.services.rule_engine.modifiers import apply_modifiers
from app.services.rule_engine.trends import evaluate_trends


def evaluate(payload: dict[str, Any]) -> dict[str, Any]:
    log = payload["log"]
    symptoms = payload.get("symptoms") or []
    history = payload.get("history") or []
    mission = payload["mission"]

    indicators = evaluate_bands(log, mission)  # 1. per-indicator banding
    flags = evaluate_combos(  # 2 + 3. symptom and combination rules
        {
            "log": log,
            "symptoms": symptoms,
            "history": history,
            "mission": mission,
            "indicators": indicators,
            "crewSignals": payload.get("crewSignals"),
        }
    )
    trends = evaluate_trends({"log": log, "history": history, "mission": mission})  # 4
    adjusted = apply_modifiers(  # 5. modifiers
        {"indicators": indicators, "flags": flags, "trends": trends}, mission
    )

    overall = "green"  # 6. overall = worst status
    for item in adjusted["indicators"] + adjusted["flags"] + adjusted["trends"]:
        overall = worst(overall, item["status"])

    guidance = build_guidance(adjusted, overall)  # 7. guidance
    return {
        "overall": overall,
        "indicators": adjusted["indicators"],
        "flags": adjusted["flags"],
        "trends": adjusted["trends"],
        "actions": guidance["actions"],
        "escalation": guidance["escalation"],
        "explanation": guidance["explanation"],
        "rulesVersion": rules_version(),
    }
