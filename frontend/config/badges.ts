/**
 * Gamification rules (SPEC §11): "supports consistency, not competition".
 * Every number here is from the SPEC §11 table; nothing is hardcoded in a
 * component or in lib/gamification.
 *
 * Guardrails (SPEC §11), reflected in what this file does NOT contain:
 * - no points or badge for reporting, or for not reporting, a symptom;
 * - no points or badge that depend on a result being green, and nothing
 *   that is taken away on a red day;
 * - nothing that grows with "more": a measurement earns the same points
 *   whatever its value, and exercise/sleep badges count days that reach a
 *   fixed mark, never the highest number.
 */

export const POINTS = {
  /** "Daily check-in +20". */
  checkin: 20,
  /** "each measurement +5 (max 40)". */
  perMeasurement: 5,
  maxMeasurementPointsPerDay: 40,
  /** "action completed +10". */
  actionCompleted: 10,
  /** "follow-up answered +5" — for answering, whatever the answer. */
  followupAnswered: 5,
  /** "7-day streak bonus +50". */
  streakBonus: 50,
  streakBonusEveryDays: 7,
} as const;

/** "one freeze token per 14 days". */
export const FREEZE_TOKEN_EVERY_DAYS = 14;

/** "level = floor(sqrt(points/50)) + 1". */
export const LEVEL_DIVISOR = 50;

/**
 * What counts as one logged "measurement" for points: one per measurement
 * card on the check-in, so blood pressure (two numbers) and exercise (two
 * numbers) each count once. Mood, stress and symptoms are not here.
 */
export const MEASUREMENT_GROUPS: { id: string; fields: string[] }[] = [
  { id: "heart_rate", fields: ["heart_rate"] },
  { id: "blood_pressure", fields: ["bp_systolic", "bp_diastolic"] },
  { id: "glucose", fields: ["glucose_mgdl"] },
  { id: "temperature", fields: ["temperature_c"] },
  { id: "spo2", fields: ["spo2"] },
  { id: "sleep", fields: ["sleep_hours"] },
  {
    id: "exercise",
    fields: ["exercise_resistance_min", "exercise_cardio_min"],
  },
  { id: "hydration", fields: ["water_ml"] },
  { id: "weight", fields: ["weight_kg"] },
  { id: "radiation", fields: ["radiation_msv"] },
];

export type BadgeId =
  | "first_orbit"
  | "iron_sleeper"
  | "bone_guardian"
  | "hydration_hero"
  | "calm_mind"
  | "full_spectrum"
  | "mission_marathon";

export interface BadgeConfig {
  id: BadgeId;
  name: string;
  /** Plain-language rule shown on the Rewards screen. */
  description: string;
  /** How many qualifying days (or streak days) earn it. */
  target: number;
}

/** Marks used by the day-count badges (SPEC §11 badge row). */
export const BADGE_MARKS = {
  sleepHours: 7,
  exerciseMinutes: 60,
  mood: 4,
  /** "Hydration Hero (7 days >= target)": the target is the bottom of the
   * green band of the hydration indicator in config/thresholds.ts. */
  hydrationIndicatorId: "water_ml",
} as const;

export const BADGES: BadgeConfig[] = [
  {
    id: "first_orbit",
    name: "First Orbit",
    description: "Complete your first check-in.",
    target: 1,
  },
  {
    id: "iron_sleeper",
    name: "Iron Sleeper",
    description: "Log 7 nights of 7 hours of sleep or more.",
    target: 7,
  },
  {
    id: "bone_guardian",
    name: "Bone Guardian",
    description: "Log 14 days with 60 minutes of exercise or more.",
    target: 14,
  },
  {
    id: "hydration_hero",
    name: "Hydration Hero",
    description: "Log 7 days that reach the daily water target.",
    target: 7,
  },
  {
    id: "calm_mind",
    name: "Calm Mind",
    description: "Log 7 days with a mood of 4 or 5.",
    target: 7,
  },
  {
    id: "full_spectrum",
    name: "Full Spectrum",
    description:
      "Log heart rate, blood pressure, glucose, temperature, blood oxygen, sleep, mood and exercise in one day.",
    target: 1,
  },
  {
    id: "mission_marathon",
    name: "Mission Marathon",
    description: "Reach a 30-day check-in streak.",
    target: 30,
  },
];

/** SPEC §3.1 "MVP minimum" indicators, for Full Spectrum. The symptoms
 * step is part of every check-in ("None today" counts), so it needs no
 * field here — and adds no incentive either way. */
export const FULL_SPECTRUM_GROUPS = [
  "heart_rate",
  "blood_pressure",
  "glucose",
  "temperature",
  "spo2",
  "sleep",
  "exercise",
] as const;

/** SPEC §11: 'Weekly challenge, e.g. "5 nights of 7+ hours"'. One fixed
 * challenge; the week runs Monday to Sunday. */
export const WEEKLY_CHALLENGE = {
  id: "sleep_5_nights",
  title: "5 nights of 7+ hours of sleep",
  target: 5,
  sleepHours: 7,
} as const;
