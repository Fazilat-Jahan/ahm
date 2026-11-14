"""Step 3: combination rules (SPEC 4.4). Port of
frontend/lib/rules/combos.ts, rule for rule and in the same order.

The numbers that appear here (37.8, 70, 95, 88) are the rule conditions
written in the SPEC 4.4 catalogue itself; indicator bands come only from
thresholds.json.
"""

from collections.abc import Callable
from typing import Any

from app.services.rule_engine.bands import get_indicator_status
from app.services.rule_engine.config import adaptation, milder, worst
from app.services.rule_engine.modifiers import is_within_adaptation_window
from app.services.rule_engine.symptoms import has_any, has_symptom

Ctx = dict[str, Any]
Flag = dict[str, Any]


def _flag(
    rule_id: str,
    status: str,
    message: str,
    hazard: str,
    caused_by: list[str] | None = None,
) -> Flag:
    flag: Flag = {"id": rule_id, "status": status, "message": message, "hazard": hazard}
    if caused_by is not None:
        flag["causedBySymptoms"] = caused_by
    return flag


def combo_chest(ctx: Ctx) -> Flag | None:
    symptoms = ctx["symptoms"]
    chest_pain = has_symptom(symptoms, "chest_pain")
    severe = has_symptom(symptoms, "chest_pain", 2)
    with_breath = chest_pain and has_symptom(symptoms, "shortness_of_breath")
    if not severe and not with_breath:
        return None
    return _flag(
        "CMB-CHEST-01",
        "critical",
        "Chest pain reported — possible cardiac emergency. Stop activity, sit/secure yourself, contact the flight surgeon now.",
        "gravity",
        ["chest_pain"],
    )


def combo_co2(ctx: Ctx) -> Flag | None:
    symptoms = ctx["symptoms"]
    if not has_symptom(symptoms, "headache"):
        return None
    if not has_any(symptoms, ["dizziness", "shortness_of_breath", "difficulty_concentrating"]):
        return None
    spo2_status = get_indicator_status(ctx["indicators"], "spo2")
    spo2_elevated = spo2_status in ("yellow", "red")
    others = bool((ctx.get("crewSignals") or {}).get("sameSymptomReportedByOthers"))
    if not spo2_elevated and not others:
        return None
    return _flag(
        "CMB-CO2-01",
        "red",
        "Possible high CO2 / air quality problem. Check the cabin CO2 monitor, move to a different module, alert the crew.",
        "closed_environment",
    )


def combo_infection(ctx: Ctx) -> Flag | None:
    temperature = ctx["log"].get("temperature_c")
    if temperature is None or temperature < 37.8:
        return None
    if not has_any(ctx["symptoms"], ["cough_sore_throat", "fever_chills", "rash_skin_irritation"]):
        return None
    return _flag(
        "CMB-INF-01",
        "red",
        "Possible infection. Isolate, hydrate, and contact the flight surgeon.",
        "radiation",
    )


def combo_cardiovascular(ctx: Ctx) -> Flag | None:
    if get_indicator_status(ctx["indicators"], "heart_rate") != "red":
        return None
    if not has_any(ctx["symptoms"], ["dizziness", "palpitations"]):
        return None
    return _flag(
        "CMB-CV-01",
        "red",
        "Elevated heart rate with dizziness/palpitations. Sit/rest, repeat the measurement after 10 minutes, contact the flight surgeon.",
        "gravity",
    )


def combo_hypertension(ctx: Ctx) -> Flag | None:
    bp_status = worst(
        get_indicator_status(ctx["indicators"], "bp_systolic") or "green",
        get_indicator_status(ctx["indicators"], "bp_diastolic") or "green",
    )
    if bp_status != "red":
        return None
    if not has_any(ctx["symptoms"], ["headache", "vision_changes"]):
        return None
    return _flag(
        "CMB-HYP-01",
        milder("critical", "red"),
        "High blood pressure with headache/vision changes. Contact the flight surgeon (possible severe hypertension).",
        "gravity",
    )


def combo_vision(ctx: Ctx) -> Flag | None:
    if not has_any(ctx["symptoms"], ["vision_changes", "eye_pain"]):
        return None
    history = ctx["history"]
    persisted = bool(history) and has_any(
        history[0].get("symptoms") or [], ["vision_changes", "eye_pain"]
    )
    if persisted:
        return _flag(
            "CMB-VIS-01",
            "red",
            "Vision change/eye pain persisting 2+ days — SANS watch. Report to the flight surgeon.",
            "gravity",
        )
    return _flag(
        "CMB-VIS-01",
        "yellow",
        "Vision change/eye pain reported. Log it and do a vision self-test (SANS watch).",
        "gravity",
        ["vision_changes"],
    )


def combo_dehydration(ctx: Ctx) -> Flag | None:
    hydration_status = get_indicator_status(ctx["indicators"], "water_ml")
    if hydration_status not in ("yellow", "red"):
        return None
    hr_elevated = (get_indicator_status(ctx["indicators"], "heart_rate") or "green") in (
        "yellow",
        "red",
        "critical",
    )
    if not has_any(ctx["symptoms"], ["dizziness", "fatigue"]) and not hr_elevated:
        return None
    return _flag(
        "CMB-DEHY-01",
        milder("yellow", "red"),
        "Low hydration with dizziness/fatigue. Drink water/electrolytes, reassess in 2 hours.",
        "closed_environment",
    )


def combo_glucose_high(ctx: Ctx) -> Flag | None:
    if get_indicator_status(ctx["indicators"], "glucose_mgdl") != "red":
        return None
    if not has_any(ctx["symptoms"], ["nausea_vomiting", "abdominal_pain"]):
        return None
    return _flag(
        "CMB-GLU-01",
        milder("red", "critical"),
        "High glucose with nausea/abdominal pain. Contact the flight surgeon.",
        "closed_environment",
    )


def combo_glucose_low(ctx: Ctx) -> Flag | None:
    glucose = ctx["log"].get("glucose_mgdl")
    if glucose is None or glucose >= 70:
        return None
    if not has_any(ctx["symptoms"], ["dizziness", "fatigue"]):
        return None
    return _flag(
        "CMB-HYPO-01",
        "red",
        "Low glucose with dizziness/fatigue. Take a fast-acting carbohydrate, recheck in 15 minutes.",
        "closed_environment",
    )


def combo_space_adaptation(ctx: Ctx) -> Flag | None:
    # "in first 3 mission days or first 3 days after gravity change"
    if not is_within_adaptation_window(ctx["mission"], adaptation()["ruleDays"]):
        return None
    symptoms = ctx["symptoms"]
    if not has_symptom(symptoms, "nausea_vomiting") or not has_symptom(symptoms, "dizziness"):
        return None
    # Deliberately no causedBySymptoms: this rule is itself the dedicated
    # early-mission rule for these symptoms and must not be cancelled by
    # the softening modifier.
    return _flag(
        "CMB-SAM-01",
        "yellow",
        "Space adaptation syndrome likely. Move your head slowly, hydrate, rest.",
        "gravity",
    )


def combo_mental_health(ctx: Ctx) -> Flag | None:
    mood = ctx["log"].get("mood")
    if mood is None or mood > 2:
        return None
    if not has_any(ctx["symptoms"], ["low_mood", "anxiety", "insomnia"]):
        return None
    return _flag(
        "CMB-MENT-01",
        "red",
        "Low mood with low mood/anxiety/insomnia symptoms. Talk to a crewmate; schedule a private call with the counsellor.",
        "isolation",
    )


def combo_safety(ctx: Ctx) -> Flag | None:
    if not ctx["log"].get("selfHarmThoughts"):
        return None
    return _flag(
        "CMB-SAFETY-01",
        "critical",
        "You indicated thoughts of harming yourself. Reach out for immediate human support and contact the flight surgeon now.",
        "isolation",
    )


def combo_back_pain(ctx: Ctx) -> Flag | None:
    if not has_symptom(ctx["symptoms"], "back_pain", 2):
        return None
    previous_two = ctx["history"][:2]
    sustained = len(previous_two) == 2 and all(
        has_symptom(day.get("symptoms") or [], "back_pain", 2) for day in previous_two
    )
    if not sustained:
        return None
    return _flag(
        "CMB-BACK-01",
        milder("yellow", "red"),
        "Back pain (moderate+) for 3+ consecutive days. Adjust posture/exercise and report it.",
        "gravity",
    )


def combo_hypoxia(ctx: Ctx) -> Flag | None:
    spo2 = ctx["log"].get("spo2")
    if spo2 is None or spo2 >= 95:
        return None
    symptoms = ctx["symptoms"]
    trigger = has_any(
        symptoms,
        ["shortness_of_breath", "headache", "dizziness", "difficulty_concentrating"],
    ) or has_symptom(symptoms, "fatigue", 2)
    if not trigger:
        return None
    return _flag(
        "CMB-HYPOX-01",
        "critical" if spo2 < 88 else "red",
        "Possible low oxygen. Sit down, check cabin/suit O2 and CO2 readings per mission procedure, alert crew, contact the flight surgeon.",
        "closed_environment",
    )


def combo_decompression_sickness(ctx: Ctx) -> Flag | None:
    history = ctx["history"]
    eva_recently = bool(ctx["log"].get("eva_today")) or bool(
        history and (history[0].get("log") or {}).get("eva_today")
    )
    if not eva_recently:
        return None
    symptoms = ctx["symptoms"]
    critical_trigger = has_any(symptoms, ["shortness_of_breath", "tingling_numbness"])
    red_trigger = (
        critical_trigger
        or has_symptom(symptoms, "joint_pain")
        or has_symptom(symptoms, "muscle_aches", 2)
        or has_symptom(symptoms, "dizziness")
    )
    if not red_trigger:
        return None
    return _flag(
        "CMB-DCS-01",
        "critical" if critical_trigger else "red",
        "Possible decompression sickness after a spacewalk. Stop activity, alert crew, contact the flight surgeon now.",
        "closed_environment",
    )


def combo_immune(ctx: Ctx) -> Flag | None:
    symptoms = ctx["symptoms"]
    if not has_symptom(symptoms, "rash_skin_irritation"):
        return None
    temperature = ctx["log"].get("temperature_c")
    fever = (temperature is not None and temperature >= 37.8) or has_symptom(
        symptoms, "fever_chills"
    )
    if fever:
        return None  # CMB-INF-01 applies instead
    return _flag(
        "CMB-IMM-01",
        "yellow",
        "Skin/immune change (stress can reactivate dormant viruses). Log it, keep the area clean, report if spreading or lasting 2 days.",
        "radiation",
        ["rash_skin_irritation"],
    )


COMBO_RULES: list[Callable[[Ctx], Flag | None]] = [
    combo_chest,
    combo_co2,
    combo_infection,
    combo_cardiovascular,
    combo_hypertension,
    combo_vision,
    combo_dehydration,
    combo_glucose_high,
    combo_glucose_low,
    combo_space_adaptation,
    combo_mental_health,
    combo_safety,
    combo_back_pain,
    combo_hypoxia,
    combo_decompression_sickness,
    combo_immune,
]


def evaluate_combos(ctx: Ctx) -> list[Flag]:
    flags = []
    for rule in COMBO_RULES:
        flag = rule(ctx)
        if flag is not None:
            flags.append(flag)
    return flags
