import { computeBaseline } from "./baseline";
import { milder } from "./status";
import type {
  DailyLogInput,
  HistoryDay,
  MissionContext,
  TrendAlert,
} from "./types";

function dayDiff(fromIso: string, toIso: string): number {
  const from = new Date(`${fromIso}T00:00:00Z`).getTime();
  const to = new Date(`${toIso}T00:00:00Z`).getTime();
  return Math.round((to - from) / (24 * 60 * 60 * 1000));
}

function exerciseTotal(log: DailyLogInput): number | undefined {
  if (
    log.exercise_resistance_min === undefined &&
    log.exercise_cardio_min === undefined
  )
    return undefined;
  return (log.exercise_resistance_min ?? 0) + (log.exercise_cardio_min ?? 0);
}

function average(values: (number | undefined)[]): number | undefined {
  if (values.some((v) => v === undefined)) return undefined;
  const nums = values as number[];
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

interface TrendContext {
  log: DailyLogInput;
  history: HistoryDay[]; // most-recent-first; history[0] = yesterday
  mission: MissionContext;
}

function trendSleepDebt({ log, history }: TrendContext): TrendAlert | null {
  const days = [
    log.sleep_hours,
    history[0]?.log.sleep_hours,
    history[1]?.log.sleep_hours,
  ];
  if (days.some((d) => d === undefined)) return null;
  if (!days.every((d) => (d as number) < 6)) return null;
  return {
    id: "TRD-SLP-01",
    status: "yellow",
    message: "Sleep debt building: under 6 hours for 3 days in a row.",
    windowDays: 3,
  };
}

function trendChronicSleepLoss({
  log,
  history,
}: TrendContext): TrendAlert | null {
  if (history.length < 6) return null;
  const days = [
    log.sleep_hours,
    ...history.slice(0, 6).map((h) => h.log.sleep_hours),
  ];
  const defined = days.filter((d) => d !== undefined) as number[];
  if (defined.length < 7) return null;
  const under6 = defined.filter((d) => d < 6).length;
  if (under6 < 5) return null;
  return {
    id: "TRD-SLP-02",
    status: "red",
    message: "Chronic sleep loss: under 6 hours on 5+ of the last 7 days.",
    windowDays: 7,
  };
}

function trendMood({ log, history }: TrendContext): TrendAlert | null {
  const last4 = [
    history[2]?.log.mood,
    history[1]?.log.mood,
    history[0]?.log.mood,
    log.mood,
  ];
  const strictlyDecreasing =
    last4.every((m) => m !== undefined) &&
    last4[0]! > last4[1]! &&
    last4[1]! > last4[2]! &&
    last4[2]! > last4[3]!;

  const last5Avg = average([
    log.mood,
    history[0]?.log.mood,
    history[1]?.log.mood,
    history[2]?.log.mood,
    history[3]?.log.mood,
  ]);
  const lowAverage = last5Avg !== undefined && last5Avg <= 2.5;

  if (!strictlyDecreasing && !lowAverage) return null;
  return {
    id: "TRD-MOOD-01",
    status: milder("yellow", "red"),
    message: strictlyDecreasing
      ? "Mood has been dropping for 4 days in a row."
      : "5-day average mood is low.",
    windowDays: strictlyDecreasing ? 4 : 5,
  };
}

function trendBp({ log, history }: TrendContext): TrendAlert | null {
  const avg = average([
    log.bp_systolic,
    history[0]?.log.bp_systolic,
    history[1]?.log.bp_systolic,
    history[2]?.log.bp_systolic,
    history[3]?.log.bp_systolic,
  ]);
  if (avg === undefined || avg < 135) return null;
  return {
    id: "TRD-BP-01",
    status: "yellow",
    message:
      "5-day average systolic blood pressure is elevated. Review sodium/exercise and your measurement schedule.",
    windowDays: 5,
  };
}

function trendHr({ log, history }: TrendContext): TrendAlert | null {
  // The 14-day baseline window excludes the 3 "recent" days being compared
  // against it (history[0..1] + today) — otherwise an already-elevated
  // recent run would drag its own baseline up and the rule could never fire.
  if (history.length < 16) return null;
  const baselineWindow = history.slice(2, 16).map((h) => h.log.heart_rate);
  // SPEC §17 item 5: personal baselines are the MEDIAN, not the mean.
  const baseline = computeBaseline(baselineWindow);
  if (baseline === undefined) return null;

  const recent = [
    log.heart_rate,
    history[0]?.log.heart_rate,
    history[1]?.log.heart_rate,
  ];
  if (recent.some((r) => r === undefined)) return null;
  const allElevated = recent.every((r) => (r as number) >= baseline + 15);
  if (!allElevated) return null;

  return {
    id: "TRD-HR-01",
    status: "yellow",
    message:
      "Resting heart rate has been 15+ bpm above your 14-day baseline for 3 days.",
    windowDays: 3,
  };
}

function trendExercise({ log, history }: TrendContext): TrendAlert | null {
  const totals = [
    exerciseTotal(log),
    history[0] && exerciseTotal(history[0].log),
    history[1] && exerciseTotal(history[1].log),
  ];
  if (totals.some((t) => t === undefined)) return null;
  if (!totals.every((t) => (t as number) < 30)) return null;
  return {
    id: "TRD-EXR-01",
    status: "yellow",
    message:
      "Bone and muscle protection at risk: under 30 minutes of exercise for 3 days in a row.",
    windowDays: 3,
  };
}

function trendWeight({ log, history }: TrendContext): TrendAlert | null {
  if (log.weight_kg === undefined) return null;
  const windowDays = history.slice(0, 14);
  const baselineEntry = [...windowDays]
    .reverse()
    .find((h) => h.log.weight_kg !== undefined);
  if (!baselineEntry?.log.weight_kg) return null;
  const loss =
    (baselineEntry.log.weight_kg - log.weight_kg) / baselineEntry.log.weight_kg;
  if (loss <= 0.03) return null;
  return {
    id: "TRD-WGT-01",
    status: milder("yellow", "red"),
    message:
      "Weight loss over 3% in the last 14 days. Nutrition check recommended.",
    windowDays: 14,
  };
}

function trendRadiation({
  log,
  history,
  mission,
}: TrendContext): TrendAlert | null {
  const budget = mission.radiationMissionBudgetMsv;
  const totalDays = mission.missionTotalDays;
  if (!budget || !totalDays) return null;

  const readings = [
    log.radiation_msv,
    ...history.map((h) => h.log.radiation_msv),
  ].filter((v) => v !== undefined) as number[];
  if (readings.length === 0) return null;
  const avgDaily = readings.reduce((a, b) => a + b, 0) / readings.length;

  const cumulativeSoFar = mission.radiationCumulativeMsv ?? 0;
  const remainingDays = Math.max(totalDays - mission.missionDay, 0);
  const projected = cumulativeSoFar + avgDaily * remainingDays;

  if (projected <= budget) return null;
  return {
    id: "TRD-RAD-01",
    status: milder("yellow", "red"),
    message: "Cumulative radiation is projected to exceed the mission budget.",
    windowDays: mission.missionDay,
  };
}

/**
 * TRD-MISS-01 without a new log (SPEC §9: "after 2 missed days, trigger
 * rule TRD-MISS-01"): the same gap arithmetic and the same 2-day / 4-day
 * steps as the in-engine rule below, measured from the last saved log to
 * `today` instead of to the log being evaluated. `today` itself is not
 * counted as missed (it is still open). Returns null when there is no
 * previous log at all — nothing real to measure a gap from.
 */
export function evaluateMissedCheckin(
  lastLogDate: string | undefined,
  today: string,
): TrendAlert | null {
  if (lastLogDate === undefined) return null;
  const gap = dayDiff(lastLogDate, today) - 1;
  if (gap < 2) return null;
  return {
    id: "TRD-MISS-01",
    status: gap >= 4 ? "red" : "yellow",
    message: `No check-in for ${gap} days.`,
    windowDays: gap,
  };
}

function trendMissedCheckin({ log, history }: TrendContext): TrendAlert | null {
  if (history.length === 0) return null;
  const gap = dayDiff(history[0].date, log.date) - 1;
  if (gap >= 4) {
    return {
      id: "TRD-MISS-01",
      status: "red",
      message: `No check-in for ${gap} days — flagged on the surgeon view.`,
      windowDays: gap,
    };
  }
  if (gap >= 2) {
    return {
      id: "TRD-MISS-01",
      status: "yellow",
      message: `Missed check-ins: ${gap} days with no log before this one.`,
      windowDays: gap,
    };
  }
  return null;
}

function trendTeam({ log, history }: TrendContext): TrendAlert | null {
  const recent = [
    log.team_relations,
    history[0]?.log.team_relations,
    history[1]?.log.team_relations,
  ];
  const sustainedLow = recent.every((r) => r !== undefined && r <= 2);

  const avg5 = average([
    log.team_relations,
    history[0]?.log.team_relations,
    history[1]?.log.team_relations,
    history[2]?.log.team_relations,
    history[3]?.log.team_relations,
  ]);
  const lowAverage = avg5 !== undefined && avg5 <= 2.5;

  if (!sustainedLow && !lowAverage) return null;
  return {
    id: "TRD-TEAM-01",
    status: "yellow",
    message:
      "Team tension building. Talk to a crewmate/commander and mention it to the surgeon/psychologist.",
    windowDays: sustainedLow ? 3 : 5,
  };
}

const TREND_RULES: ((ctx: TrendContext) => TrendAlert | null)[] = [
  trendSleepDebt,
  trendChronicSleepLoss,
  trendMood,
  trendBp,
  trendHr,
  trendExercise,
  trendWeight,
  trendRadiation,
  trendMissedCheckin,
  trendTeam,
];

export function evaluateTrends(ctx: TrendContext): TrendAlert[] {
  const trends: TrendAlert[] = [];
  for (const rule of TREND_RULES) {
    const trend = rule(ctx);
    if (trend) trends.push(trend);
  }
  return trends;
}

export type { TrendContext };
