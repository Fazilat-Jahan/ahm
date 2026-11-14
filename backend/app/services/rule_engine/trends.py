"""Step 4: trend rules (SPEC 4.4). Port of frontend/lib/rules/trends.ts,
rule for rule and in the same order.

`history` is most-recent-first: history[0] is the previous logged day.
The window sizes and limits here (6 h, 135, +15 bpm, 30 min, 3 %) are the
trend-rule conditions written in the SPEC 4.4 catalogue.
"""

from collections.abc import Callable
from datetime import date
from typing import Any

from app.services.rule_engine.bands import exercise_total
from app.services.rule_engine.config import milder

Ctx = dict[str, Any]
Trend = dict[str, Any]


def day_diff(from_iso: str, to_iso: str) -> int:
    return (date.fromisoformat(to_iso) - date.fromisoformat(from_iso)).days


def _history_log(history: list[dict[str, Any]], index: int) -> dict[str, Any] | None:
    if index < len(history):
        return history[index].get("log") or {}
    return None


def _history_value(history: list[dict[str, Any]], index: int, field: str) -> Any:
    log = _history_log(history, index)
    return None if log is None else log.get(field)


def _average(values: list[Any]) -> float | None:
    if any(value is None for value in values):
        return None
    return sum(values) / len(values)


def median(values: list[float]) -> float | None:
    if not values:
        return None
    ordered = sorted(values)
    mid = len(ordered) // 2
    if len(ordered) % 2 == 0:
        return (ordered[mid - 1] + ordered[mid]) / 2
    return ordered[mid]


def compute_baseline(values: list[Any], min_days: int = 14) -> float | None:
    """Median of the values if there are at least `min_days` of them
    (personal baselines need 14 logs), else None."""
    defined = [value for value in values if value is not None]
    if len(defined) < min_days:
        return None
    return median(defined)


def _trend(rule_id: str, status: str, message: str, window_days: int) -> Trend:
    return {"id": rule_id, "status": status, "message": message, "windowDays": window_days}


def trend_sleep_debt(ctx: Ctx) -> Trend | None:
    history = ctx["history"]
    days = [
        ctx["log"].get("sleep_hours"),
        _history_value(history, 0, "sleep_hours"),
        _history_value(history, 1, "sleep_hours"),
    ]
    if any(day is None for day in days):
        return None
    if not all(day < 6 for day in days):
        return None
    return _trend(
        "TRD-SLP-01", "yellow", "Sleep debt building: under 6 hours for 3 days in a row.", 3
    )


def trend_chronic_sleep_loss(ctx: Ctx) -> Trend | None:
    history = ctx["history"]
    if len(history) < 6:
        return None
    days = [ctx["log"].get("sleep_hours")] + [
        (day.get("log") or {}).get("sleep_hours") for day in history[:6]
    ]
    defined = [day for day in days if day is not None]
    if len(defined) < 7:
        return None
    if sum(1 for day in defined if day < 6) < 5:
        return None
    return _trend(
        "TRD-SLP-02", "red", "Chronic sleep loss: under 6 hours on 5+ of the last 7 days.", 7
    )


def trend_mood(ctx: Ctx) -> Trend | None:
    history = ctx["history"]
    today = ctx["log"].get("mood")
    last4 = [
        _history_value(history, 2, "mood"),
        _history_value(history, 1, "mood"),
        _history_value(history, 0, "mood"),
        today,
    ]
    strictly_decreasing = (
        all(mood is not None for mood in last4)
        and last4[0] > last4[1] > last4[2] > last4[3]
    )
    last5_average = _average(
        [today] + [_history_value(history, index, "mood") for index in range(4)]
    )
    low_average = last5_average is not None and last5_average <= 2.5
    if not strictly_decreasing and not low_average:
        return None
    return _trend(
        "TRD-MOOD-01",
        milder("yellow", "red"),
        "Mood has been dropping for 4 days in a row."
        if strictly_decreasing
        else "5-day average mood is low.",
        4 if strictly_decreasing else 5,
    )


def trend_bp(ctx: Ctx) -> Trend | None:
    history = ctx["history"]
    average = _average(
        [ctx["log"].get("bp_systolic")]
        + [_history_value(history, index, "bp_systolic") for index in range(4)]
    )
    if average is None or average < 135:
        return None
    return _trend(
        "TRD-BP-01",
        "yellow",
        "5-day average systolic blood pressure is elevated. Review sodium/exercise and your measurement schedule.",
        5,
    )


def trend_hr(ctx: Ctx) -> Trend | None:
    # The 14-day baseline window excludes the 3 "recent" days compared
    # against it (today + history[0..1]); otherwise an already-elevated
    # run would raise its own baseline and the rule could never fire.
    history = ctx["history"]
    if len(history) < 16:
        return None
    baseline = compute_baseline(
        [(day.get("log") or {}).get("heart_rate") for day in history[2:16]]
    )
    if baseline is None:
        return None
    recent = [
        ctx["log"].get("heart_rate"),
        _history_value(history, 0, "heart_rate"),
        _history_value(history, 1, "heart_rate"),
    ]
    if any(value is None for value in recent):
        return None
    if not all(value >= baseline + 15 for value in recent):
        return None
    return _trend(
        "TRD-HR-01",
        "yellow",
        "Resting heart rate has been 15+ bpm above your 14-day baseline for 3 days.",
        3,
    )


def trend_exercise(ctx: Ctx) -> Trend | None:
    history = ctx["history"]
    totals = [exercise_total(ctx["log"])]
    for index in range(2):
        log = _history_log(history, index)
        totals.append(None if log is None else exercise_total(log))
    if any(total is None for total in totals):
        return None
    if not all(total < 30 for total in totals):
        return None
    return _trend(
        "TRD-EXR-01",
        "yellow",
        "Bone and muscle protection at risk: under 30 minutes of exercise for 3 days in a row.",
        3,
    )


def trend_weight(ctx: Ctx) -> Trend | None:
    weight = ctx["log"].get("weight_kg")
    if weight is None:
        return None
    # The oldest weight inside the last 14 logged days.
    baseline = None
    for day in reversed(ctx["history"][:14]):
        value = (day.get("log") or {}).get("weight_kg")
        if value is not None:
            baseline = value
            break
    if not baseline:
        return None
    loss = (baseline - weight) / baseline
    if loss <= 0.03:
        return None
    return _trend(
        "TRD-WGT-01",
        milder("yellow", "red"),
        "Weight loss over 3% in the last 14 days. Nutrition check recommended.",
        14,
    )


def trend_radiation(ctx: Ctx) -> Trend | None:
    mission = ctx["mission"]
    budget = mission.get("radiationMissionBudgetMsv")
    total_days = mission.get("missionTotalDays")
    if not budget or not total_days:
        return None
    readings = [ctx["log"].get("radiation_msv")] + [
        (day.get("log") or {}).get("radiation_msv") for day in ctx["history"]
    ]
    readings = [reading for reading in readings if reading is not None]
    if not readings:
        return None
    average_daily = sum(readings) / len(readings)
    cumulative = mission.get("radiationCumulativeMsv") or 0
    remaining_days = max(total_days - mission["missionDay"], 0)
    projected = cumulative + average_daily * remaining_days
    if projected <= budget:
        return None
    return _trend(
        "TRD-RAD-01",
        milder("yellow", "red"),
        "Cumulative radiation is projected to exceed the mission budget.",
        mission["missionDay"],
    )


def trend_missed_checkin(ctx: Ctx) -> Trend | None:
    history = ctx["history"]
    if not history:
        return None
    gap = day_diff(history[0]["date"], ctx["log"]["date"]) - 1
    if gap >= 4:
        return _trend(
            "TRD-MISS-01",
            "red",
            f"No check-in for {gap} days — flagged on the surgeon view.",
            gap,
        )
    if gap >= 2:
        return _trend(
            "TRD-MISS-01",
            "yellow",
            f"Missed check-ins: {gap} days with no log before this one.",
            gap,
        )
    return None


def trend_team(ctx: Ctx) -> Trend | None:
    history = ctx["history"]
    today = ctx["log"].get("team_relations")
    recent = [
        today,
        _history_value(history, 0, "team_relations"),
        _history_value(history, 1, "team_relations"),
    ]
    sustained_low = all(value is not None and value <= 2 for value in recent)
    average5 = _average(
        [today] + [_history_value(history, index, "team_relations") for index in range(4)]
    )
    low_average = average5 is not None and average5 <= 2.5
    if not sustained_low and not low_average:
        return None
    return _trend(
        "TRD-TEAM-01",
        "yellow",
        "Team tension building. Talk to a crewmate/commander and mention it to the surgeon/psychologist.",
        3 if sustained_low else 5,
    )


TREND_RULES: list[Callable[[Ctx], Trend | None]] = [
    trend_sleep_debt,
    trend_chronic_sleep_loss,
    trend_mood,
    trend_bp,
    trend_hr,
    trend_exercise,
    trend_weight,
    trend_radiation,
    trend_missed_checkin,
    trend_team,
]


def evaluate_trends(ctx: Ctx) -> list[Trend]:
    trends = []
    for rule in TREND_RULES:
        trend = rule(ctx)
        if trend is not None:
            trends.append(trend)
    return trends
