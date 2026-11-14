/**
 * Drives the check-in measurement step (SPEC §8.3 screen 2, step 3): the
 * form fields, their validation bounds, and the "(?) How to measure"
 * bottom-sheet text all come from this one config.
 *
 * `min`/`max` here are physiological *sanity* bounds for rejecting
 * impossible values (CLAUDE.md §5 convention; SPEC §13; Appendix A) — a
 * broader range than the clinical green/yellow/red/critical bands in
 * config/thresholds.ts. A value can be sane (passes here) and still be
 * red (handled by thresholds.ts via `indicatorId`, used for the
 * "rest and measure again" borderline prompt, SPEC §17 item 4).
 *
 * `indicatorId` is deliberately set only on the acute vital signs (heart
 * rate, BP, glucose, temperature, SpO2) where "rest 5 minutes and measure
 * again" is physiologically meaningful — a borderline reading there might
 * just be a measurement artifact. It's omitted for sleep hours, exercise
 * minutes, hydration totals, and team relations: none of those are
 * re-measurable readings (sleep already happened, exercise already
 * happened, and team relations is a subjective rating, not a sensor
 * reading) — see docs/DECISIONS.md.
 */

export interface NumberFieldSpec {
  id: string; // DailyLog field name
  label: string;
  unit: string;
  step: number;
  min: number;
  max?: number; // omitted = no sanity ceiling (e.g. radiation_msv)
  precision?: number; // decimal places shown/stepped; default 0
  /** config/thresholds.ts indicator id used for the borderline/re-measure
   * check. Omitted when this field has no clinical band (e.g. weight) OR
   * when "measure again" doesn't apply to it (see module doc comment). */
  indicatorId?: string;
}

interface BaseMeasurementConfig {
  id: string;
  label: string;
  howToMeasure: string[];
  /** Purely descriptive grouping for the UI (e.g. "Sleep"); has no effect
   * on validation or saving. */
  group?: string;
  optional?: boolean;
}

export interface NumberMeasurementConfig
  extends BaseMeasurementConfig, NumberFieldSpec {
  kind: "number";
}

export interface TwoNumberMeasurementConfig extends BaseMeasurementConfig {
  kind: "two-number";
  fields: [NumberFieldSpec, NumberFieldSpec];
  /** config/thresholds.ts id for the COMBINED value (e.g. exercise minutes
   * is resistance+cardio summed); used for the borderline check. */
  indicatorId?: string;
}

export interface SliderMeasurementConfig extends BaseMeasurementConfig {
  kind: "slider";
  min: number;
  max: number;
  step: number;
  indicatorId?: string;
}

export interface ToggleMeasurementConfig extends BaseMeasurementConfig {
  kind: "toggle";
}

export type MeasurementConfig =
  | NumberMeasurementConfig
  | TwoNumberMeasurementConfig
  | SliderMeasurementConfig
  | ToggleMeasurementConfig;

export const MEASUREMENTS: MeasurementConfig[] = [
  {
    id: "heart_rate",
    label: "Resting heart rate",
    kind: "number",
    unit: "bpm",
    step: 1,
    min: 20,
    max: 250,
    indicatorId: "heart_rate",
    howToMeasure: [
      "Sit quietly for a few minutes before measuring.",
      "Use a wrist/chest sensor, or count your pulse for 30 seconds and double it.",
    ],
  },
  {
    id: "blood_pressure",
    label: "Blood pressure",
    kind: "two-number",
    fields: [
      {
        id: "bp_systolic",
        label: "Systolic",
        unit: "mmHg",
        step: 1,
        min: 50,
        max: 260,
        indicatorId: "bp_systolic",
      },
      {
        id: "bp_diastolic",
        label: "Diastolic",
        unit: "mmHg",
        step: 1,
        min: 30,
        max: 160,
        indicatorId: "bp_diastolic",
      },
    ],
    howToMeasure: ["Use an automatic cuff, seated and relaxed."],
  },
  {
    id: "glucose_mgdl",
    label: "Fasting blood glucose",
    kind: "number",
    unit: "mg/dL",
    step: 1,
    min: 20,
    max: 600,
    indicatorId: "glucose_mgdl",
    howToMeasure: ["Use a finger-prick glucometer while fasting."],
  },
  {
    id: "temperature_c",
    label: "Body temperature",
    kind: "number",
    unit: "°C",
    step: 0.1,
    min: 30,
    max: 43,
    precision: 1,
    indicatorId: "temperature_c",
    howToMeasure: ["Use an ear, forehead, or oral thermometer."],
  },
  {
    id: "spo2",
    label: "Blood oxygen (SpO2)",
    kind: "number",
    unit: "%",
    step: 1,
    min: 50,
    max: 100,
    indicatorId: "spo2",
    howToMeasure: ["Use a pulse oximeter on a fingertip."],
  },
  {
    id: "sleep_hours",
    label: "Sleep duration",
    kind: "number",
    unit: "h",
    step: 0.5,
    min: 0,
    max: 24,
    precision: 1,
    // No indicatorId: "rest and remeasure" doesn't make sense for a fact
    // about last night's sleep (see docs/DECISIONS.md).
    group: "Sleep",
    howToMeasure: [
      "Log the hours you actually slept, from a sleep diary or wearable.",
    ],
  },
  {
    id: "sleep_quality",
    label: "Sleep quality",
    kind: "slider",
    min: 1,
    max: 5,
    step: 1,
    group: "Sleep",
    howToMeasure: ["Rate how rested you feel, 1 (poor) to 5 (excellent)."],
  },
  {
    id: "exercise",
    label: "Exercise (resistance + cardio)",
    kind: "two-number",
    fields: [
      {
        id: "exercise_resistance_min",
        label: "Resistance",
        unit: "min",
        step: 5,
        min: 0,
        max: 600,
      },
      {
        id: "exercise_cardio_min",
        label: "Cardio",
        unit: "min",
        step: 5,
        min: 0,
        max: 600,
      },
    ],
    // No indicatorId: minutes already exercised today can't be "measured
    // again after resting" (see docs/DECISIONS.md).
    howToMeasure: [
      "Log total minutes of resistance and cardio exercise for the day.",
    ],
  },
  {
    id: "water_ml",
    label: "Hydration / water intake",
    kind: "number",
    unit: "mL",
    step: 50,
    min: 0,
    max: 10000,
    // No indicatorId: a logged running total isn't a re-measurable reading.
    howToMeasure: ["Log total water intake for the day."],
  },
  {
    id: "weight_kg",
    label: "Body weight",
    kind: "number",
    unit: "kg",
    step: 0.1,
    min: 20,
    max: 250,
    precision: 1,
    howToMeasure: [
      "Use a mass measurement device — a bathroom scale doesn't work in micro-g.",
    ],
  },
  {
    id: "radiation_msv",
    label: "Radiation dose",
    kind: "number",
    unit: "mSv",
    step: 0.01,
    min: 0,
    precision: 2,
    optional: true,
    howToMeasure: [
      "Log the daily reading from your personal dosimeter, if available.",
    ],
  },
  {
    id: "team_relations",
    label: "Team relations",
    kind: "slider",
    min: 1,
    max: 5,
    step: 1,
    optional: true,
    // No indicatorId: a subjective rating isn't something you "rest and
    // measure again" — the rest-and-remeasure flow is for vital signs
    // where a borderline reading might be a measurement artifact.
    howToMeasure: ["Rate how the crew is getting along today, 1-5."],
  },
  {
    id: "eva_today",
    label: "Spacewalk (EVA) today?",
    kind: "toggle",
    howToMeasure: [
      "Turn this on if you did or are doing a spacewalk today — it feeds the decompression-sickness check.",
    ],
  },
];

export function getMeasurementConfig(
  id: string,
): MeasurementConfig | undefined {
  return MEASUREMENTS.find((m) => m.id === id);
}
