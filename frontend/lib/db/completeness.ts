import type { DailyLog } from "./schema";

/** SPEC §17 item 6: "percent of essential indicators logged today; shown
 * subtly, never as pressure." The essential set is SPEC §3.1's MVP
 * minimum (#1 heart rate, #2 blood pressure, #3 glucose, #4 temperature,
 * #5 SpO2, #6 sleep, #8 mood, plus exercise minutes) — #15 symptoms is
 * deliberately excluded: an empty symptom selection is a valid, complete
 * answer ("none today"), not a missing value, so it can't be counted the
 * same way a numeric field can. */
const ESSENTIAL_ITEMS: {
  label: string;
  isComplete: (log: DailyLog) => boolean;
}[] = [
  { label: "Heart rate", isComplete: (l) => l.heart_rate !== undefined },
  {
    label: "Blood pressure",
    isComplete: (l) =>
      l.bp_systolic !== undefined && l.bp_diastolic !== undefined,
  },
  { label: "Glucose", isComplete: (l) => l.glucose_mgdl !== undefined },
  { label: "Temperature", isComplete: (l) => l.temperature_c !== undefined },
  { label: "SpO2", isComplete: (l) => l.spo2 !== undefined },
  { label: "Sleep", isComplete: (l) => l.sleep_hours !== undefined },
  { label: "Mood", isComplete: (l) => l.mood !== undefined },
  {
    label: "Exercise",
    isComplete: (l) =>
      l.exercise_resistance_min !== undefined ||
      l.exercise_cardio_min !== undefined,
  },
];

export function computeCompletenessScore(log: DailyLog | undefined): number {
  if (!log) return 0;
  const completed = ESSENTIAL_ITEMS.filter((item) =>
    item.isComplete(log),
  ).length;
  return Math.round((completed / ESSENTIAL_ITEMS.length) * 100);
}

export function getMissingEssentials(log: DailyLog | undefined): string[] {
  return ESSENTIAL_ITEMS.filter((item) => !log || !item.isComplete(log)).map(
    (item) => item.label,
  );
}
