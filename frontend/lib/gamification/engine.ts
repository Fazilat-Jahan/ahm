import {
  BADGE_MARKS,
  BADGES,
  FREEZE_TOKEN_EVERY_DAYS,
  FULL_SPECTRUM_GROUPS,
  LEVEL_DIVISOR,
  MEASUREMENT_GROUPS,
  POINTS,
  WEEKLY_CHALLENGE,
  type BadgeId,
} from "@/config/badges";
import { getIndicatorConfig } from "@/config/thresholds";
import { daysAgo, diffDays, startOfWeek } from "@/lib/time/missionDate";

/**
 * Gamification (SPEC §11) as a pure function of one astronaut's saved
 * data. Nothing is stored: points, streak, level and badges are worked
 * out again from the real check-ins and action records every time, so
 * they can never drift from, or exist without, the data behind them.
 *
 * Guardrails are structural, not a filter applied afterwards:
 * - The input has no symptoms and no status. Reporting a symptom (or
 *   "None today") cannot change the result, and neither can a red day.
 * - A measurement earns points for being logged, never for its value.
 * - Day-count badges and the weekly challenge count days that reach a
 *   fixed mark; going far beyond the mark earns nothing extra.
 */

/** The only fields of a saved check-in this module reads. */
export interface GameLog {
  date: string; // YYYY-MM-DD
  heart_rate?: number;
  bp_systolic?: number;
  bp_diastolic?: number;
  glucose_mgdl?: number;
  temperature_c?: number;
  spo2?: number;
  sleep_hours?: number;
  exercise_resistance_min?: number;
  exercise_cardio_min?: number;
  water_ml?: number;
  weight_kg?: number;
  radiation_msv?: number;
  mood?: number;
}

/** One saved action record: an action ticked as done on Home
 * (`completed`), or a "did you follow yesterday's advice?" answer
 * (`answered` — Yes, Partly and No all count the same). */
export interface GameActionRecord {
  date: string;
  kind: "completed" | "answered";
}

export interface GameInput {
  logs: readonly GameLog[];
  actions: readonly GameActionRecord[];
  today: string;
}

export interface PointsBreakdown {
  checkins: number;
  measurements: number;
  actionsCompleted: number;
  followupsAnswered: number;
  streakBonuses: number;
}

export interface BadgeProgress {
  id: BadgeId;
  name: string;
  description: string;
  earned: boolean;
  /** Capped at `target`. */
  progress: number;
  target: number;
}

export interface StreakState {
  /** Consecutive check-in days in the current run (a day covered by a
   * freeze is not counted as a check-in day). */
  current: number;
  longest: number;
  /** `active`: checked in today or yesterday. `frozen`: yesterday was
   * missed, a freeze is available, and checking in today keeps the run.
   * `none`: no run in progress. */
  status: "active" | "frozen" | "none";
  /** True if no freeze was used in the last 14 days. */
  freezeAvailable: boolean;
}

export interface WeeklyChallengeState {
  id: string;
  title: string;
  progress: number;
  target: number;
  completed: boolean;
  weekStart: string;
}

export interface GameSummary {
  points: number;
  breakdown: PointsBreakdown;
  level: number;
  /** Points at which the current level started / the next one starts. */
  levelFloor: number;
  nextLevelAt: number;
  streak: StreakState;
  badges: BadgeProgress[];
  weeklyChallenge: WeeklyChallengeState;
  checkinCount: number;
}

function isLogged(log: GameLog, field: string): boolean {
  return typeof (log as unknown as Record<string, unknown>)[field] === "number";
}

/** Ids of the measurement cards filled in on this check-in. */
export function getLoggedMeasurementGroups(log: GameLog): string[] {
  return MEASUREMENT_GROUPS.filter((group) =>
    group.fields.some((field) => isLogged(log, field)),
  ).map((group) => group.id);
}

export function getMeasurementPoints(log: GameLog): number {
  return Math.min(
    getLoggedMeasurementGroups(log).length * POINTS.perMeasurement,
    POINTS.maxMeasurementPointsPerDay,
  );
}

/** "level = floor(sqrt(points/50)) + 1". */
export function getLevel(points: number): number {
  return Math.floor(Math.sqrt(Math.max(points, 0) / LEVEL_DIVISOR)) + 1;
}

/** Points needed to reach `level`. */
export function getLevelThreshold(level: number): number {
  return LEVEL_DIVISOR * (level - 1) ** 2;
}

interface Run {
  /** Check-in days in the run. */
  length: number;
  lastDate: string;
}

interface RunsResult {
  runs: Run[];
  /** Dates of the missed days that a freeze covered. */
  freezeDates: string[];
}

/**
 * Splits the check-in dates into streak runs. Two check-ins on following
 * days continue a run. A single missed day is covered by the freeze
 * token if none was used in the 14 days before it ("one freeze token per
 * 14 days"); it is applied automatically. Two or more missed days in a
 * row, or a missed day with no freeze left, end the run.
 */
export function computeRuns(dates: readonly string[]): RunsResult {
  const sorted = [...new Set(dates)].sort();
  const runs: Run[] = [];
  const freezeDates: string[] = [];
  let lastFreeze: string | undefined;

  for (const date of sorted) {
    const run = runs[runs.length - 1];
    if (!run) {
      runs.push({ length: 1, lastDate: date });
      continue;
    }
    const gap = diffDays(run.lastDate, date);
    if (gap === 1) {
      run.length += 1;
      run.lastDate = date;
      continue;
    }
    const missedDay = daysAgo(1, date);
    const freezeReady =
      lastFreeze === undefined ||
      diffDays(lastFreeze, missedDay) >= FREEZE_TOKEN_EVERY_DAYS;
    if (gap === 2 && freezeReady) {
      lastFreeze = missedDay;
      freezeDates.push(missedDay);
      run.length += 1;
      run.lastDate = date;
      continue;
    }
    runs.push({ length: 1, lastDate: date });
  }
  return { runs, freezeDates };
}

function computeStreak(dates: readonly string[], today: string): StreakState {
  const past = dates.filter((d) => d <= today);
  const { runs, freezeDates } = computeRuns(past);
  const longest = runs.reduce((max, run) => Math.max(max, run.length), 0);
  const lastFreeze = freezeDates[freezeDates.length - 1];
  const freezeAvailable =
    lastFreeze === undefined ||
    diffDays(lastFreeze, today) >= FREEZE_TOKEN_EVERY_DAYS;

  const last = runs[runs.length - 1];
  if (!last) {
    return { current: 0, longest, status: "none", freezeAvailable };
  }
  const sinceLast = diffDays(last.lastDate, today);
  if (sinceLast <= 1) {
    return { current: last.length, longest, status: "active", freezeAvailable };
  }
  // Yesterday was missed; today is still open. A freeze can cover
  // yesterday if one is free on that day.
  const yesterday = daysAgo(1, today);
  const freezeFreeYesterday =
    lastFreeze === undefined ||
    diffDays(lastFreeze, yesterday) >= FREEZE_TOKEN_EVERY_DAYS;
  if (sinceLast === 2 && freezeFreeYesterday) {
    return { current: last.length, longest, status: "frozen", freezeAvailable };
  }
  return { current: 0, longest, status: "none", freezeAvailable };
}

function countDays(
  logs: readonly GameLog[],
  predicate: (log: GameLog) => boolean,
): number {
  return logs.filter(predicate).length;
}

function exerciseMinutes(log: GameLog): number | undefined {
  if (
    log.exercise_resistance_min === undefined &&
    log.exercise_cardio_min === undefined
  ) {
    return undefined;
  }
  return (log.exercise_resistance_min ?? 0) + (log.exercise_cardio_min ?? 0);
}

/** Bottom of the green band of the hydration indicator. */
function getHydrationTarget(): number | undefined {
  return getIndicatorConfig(BADGE_MARKS.hydrationIndicatorId)?.bands.find(
    (band) => band.status === "green",
  )?.min;
}

function isFullSpectrum(log: GameLog): boolean {
  const groups = getLoggedMeasurementGroups(log);
  return (
    FULL_SPECTRUM_GROUPS.every((id) => groups.includes(id)) &&
    typeof log.mood === "number"
  );
}

export function computeGameSummary(input: GameInput): GameSummary {
  // One check-in per date (the repository already enforces this).
  const byDate = new Map<string, GameLog>();
  for (const log of input.logs) byDate.set(log.date, log);
  const logs = [...byDate.values()].sort((a, b) =>
    a.date.localeCompare(b.date),
  );
  const dates = logs.map((log) => log.date);

  const { runs } = computeRuns(dates);
  const breakdown: PointsBreakdown = {
    checkins: logs.length * POINTS.checkin,
    measurements: logs.reduce((sum, log) => sum + getMeasurementPoints(log), 0),
    actionsCompleted:
      input.actions.filter((a) => a.kind === "completed").length *
      POINTS.actionCompleted,
    followupsAnswered:
      input.actions.filter((a) => a.kind === "answered").length *
      POINTS.followupAnswered,
    streakBonuses: runs.reduce(
      (sum, run) =>
        sum +
        Math.floor(run.length / POINTS.streakBonusEveryDays) *
          POINTS.streakBonus,
      0,
    ),
  };
  const points =
    breakdown.checkins +
    breakdown.measurements +
    breakdown.actionsCompleted +
    breakdown.followupsAnswered +
    breakdown.streakBonuses;

  const level = getLevel(points);
  const streak = computeStreak(dates, input.today);
  const hydrationTarget = getHydrationTarget();

  const badgeProgress: Record<BadgeId, number> = {
    first_orbit: logs.length,
    iron_sleeper: countDays(
      logs,
      (l) =>
        l.sleep_hours !== undefined && l.sleep_hours >= BADGE_MARKS.sleepHours,
    ),
    bone_guardian: countDays(logs, (l) => {
      const minutes = exerciseMinutes(l);
      return minutes !== undefined && minutes >= BADGE_MARKS.exerciseMinutes;
    }),
    hydration_hero:
      hydrationTarget === undefined
        ? 0
        : countDays(
            logs,
            (l) => l.water_ml !== undefined && l.water_ml >= hydrationTarget,
          ),
    calm_mind: countDays(
      logs,
      (l) => l.mood !== undefined && l.mood >= BADGE_MARKS.mood,
    ),
    full_spectrum: countDays(logs, isFullSpectrum),
    mission_marathon: streak.longest,
  };

  const badges: BadgeProgress[] = BADGES.map((badge) => {
    const raw = badgeProgress[badge.id];
    return {
      id: badge.id,
      name: badge.name,
      description: badge.description,
      earned: raw >= badge.target,
      progress: Math.min(raw, badge.target),
      target: badge.target,
    };
  });

  const weekStart = startOfWeek(input.today);
  const weekProgress = countDays(
    logs,
    (l) =>
      l.date >= weekStart &&
      l.date <= input.today &&
      l.sleep_hours !== undefined &&
      l.sleep_hours >= WEEKLY_CHALLENGE.sleepHours,
  );

  return {
    points,
    breakdown,
    level,
    levelFloor: getLevelThreshold(level),
    nextLevelAt: getLevelThreshold(level + 1),
    streak,
    badges,
    weeklyChallenge: {
      id: WEEKLY_CHALLENGE.id,
      title: WEEKLY_CHALLENGE.title,
      progress: Math.min(weekProgress, WEEKLY_CHALLENGE.target),
      target: WEEKLY_CHALLENGE.target,
      completed: weekProgress >= WEEKLY_CHALLENGE.target,
      weekStart,
    },
    checkinCount: logs.length,
  };
}
