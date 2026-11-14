import { getIndicatorConfig } from "@/config/thresholds";
import { getSymptomLabel, isSymptomId } from "@/config/symptoms";
import type { Risk } from "./risks";

/**
 * The parts of a risk card that SPEC §2.1 asks for beyond the summary in
 * `content/risks.ts`: "what the crew can do (exercise, sleep, nutrition,
 * hydration, teamwork, reporting), and when to contact the flight
 * surgeon". Written in our own words — no NASA text.
 *
 * "What the crew can do" stays inside that SPEC list (self-care habits
 * and reporting through the check-in); it names no treatment. "When to
 * contact the flight surgeon" is not written per risk: it always defers
 * to the rule engine's own red/critical results, so the Learn pages can
 * never disagree with what the app actually tells the astronaut.
 */
export const RISK_CREW_ACTIONS: Record<number, string> = {
  1: "Protect your sleep, keep stress down, keep skin and shared surfaces clean, and log your temperature and any rash, fever or cough.",
  2: "Move your head slowly in the first days, drink water, rest, and log nausea, dizziness or blocked ears.",
  3: "Exercise every day, drink enough water, and measure heart rate and blood pressure while resting.",
  4: "Mark spacewalk days in the check-in, and afterwards log joint pain, tingling, breathlessness or dizziness.",
  5: "Keep up hygiene, and report a rash, stomach pain, nausea or a raised temperature early so the crew can watch for spread.",
  6: "Measure blood oxygen every day and log a headache, breathlessness or trouble concentrating. Tell the crew: they breathe the same air.",
  7: "Eat regular meals, log your water intake and fasting glucose, and report a loss of appetite.",
  8: "Rest and sleep well around spacewalks, mark spacewalk days, and log fatigue and muscle or joint pain.",
  9: "Do resistance and cardio exercise every day and log the minutes.",
  10: "Log any change in vision, eye pain, headache or a puffy face at check-in, even if it is mild.",
  11: "Keep up resistance exercise every day and log back or joint pain.",
  12: "Do the mood and stress check every day, protect your sleep, stay in touch with crewmates, and answer the safety question honestly.",
  13: "Rate team relations in the check-in and talk about tension early with a crewmate or the commander.",
  14: "Keep a regular sleep schedule where you can, and log hours and quality every day.",
  15: "After launch or landing, log back, joint or muscle pain and ease back into exercise.",
  16: "Log your dosimeter reading if you have one, and follow the shelter procedure during solar storms.",
  17: "This is about training and operations, not a health measurement. Raise concerns through the normal mission channels.",
};

export function getRiskContactGuidance(risk: Risk): string {
  if (risk.coverage === "out_of_scope") {
    return "This app does not track this risk, so it raises no alerts for it.";
  }
  return "Contact the flight surgeon when this app shows red or critical for the inputs or rules listed here. The result screen shows the steps to follow.";
}

export const RISK_COVERAGE_LABELS: Record<Risk["coverage"], string> = {
  tracked: "Tracked in this app",
  partly_tracked: "Partly tracked",
  out_of_scope: "Not tracked",
};

const INPUT_LABELS: Record<string, string> = {
  stress: "Stress / fatigue",
  sleep_quality: "Sleep quality",
  eva_today: "Spacewalk (EVA) today",
  weight_kg: "Body weight",
  calories: "Calories",
  radiation_msv: "Radiation dose",
  selfHarmThoughts: "Safety question",
  exercise_resistance_min: "Resistance exercise",
  exercise_cardio_min: "Cardio exercise",
};

/** Human label for an id in a risk's `trackedVia` list (an indicator, a
 * symptom, or another check-in input). */
export function getRiskInputLabel(id: string): string {
  if (isSymptomId(id)) return getSymptomLabel(id);
  const indicator = getIndicatorConfig(id);
  if (indicator) return indicator.label;
  return INPUT_LABELS[id] ?? id.replace(/_/g, " ");
}
