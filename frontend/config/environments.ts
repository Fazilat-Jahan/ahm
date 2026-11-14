import type { Hazard } from "./thresholds";
import type { SymptomId } from "./symptoms";
import type { Environment } from "@/lib/rules/types";

/**
 * Environment-specific behaviour (SPEC §12) and the mission-phase /
 * environment rule modifiers (SPEC §4.4), in one config file so nothing
 * here is hardcoded inside a component or the rule engine.
 *
 * Emphasis and tips are a plain-language restatement of the SPEC §12 and
 * §4.4 rows. They are guidance on what to watch and log, not treatment
 * advice, and they change no threshold.
 */

/** Microgravity vs. partial gravity. Moving between the two classes is a
 * "gravity change" for SPEC §4.4 CMB-SAM-01. The rover counts as partial
 * gravity: it drives on a surface (see docs/DECISIONS.md). */
export type GravityClass = "micro" | "partial";

export interface EnvironmentConfig {
  id: Environment;
  label: string;
  /** Short gravity description shown on the Environment screen. */
  gravity: string;
  gravityClass: GravityClass;
  /** SPEC §12 "Emphasis" column, as short phrases. */
  emphasis: string[];
  /** Hazards to badge for this environment. */
  hazards: Hazard[];
  /** Symptoms this environment makes more likely — "log these if you
   * notice them". Real `config/symptoms.ts` ids only. */
  watchSymptoms: SymptomId[];
  /** Tip pack. */
  tips: string[];
}

export const ENVIRONMENT_CONFIGS: Record<Environment, EnvironmentConfig> = {
  spacecraft: {
    id: "spacecraft",
    label: "Spacecraft (transit)",
    gravity: "Microgravity",
    gravityClass: "micro",
    emphasis: [
      "Fluid shift toward the head",
      "Vision changes",
      "Bone and muscle loss",
      "Isolation",
      "Radiation shelter drills",
      "Space adaptation in the first week",
    ],
    hazards: ["gravity", "radiation", "isolation", "distance"],
    watchSymptoms: [
      "nausea_vomiting",
      "dizziness",
      "facial_puffiness",
      "ear_congestion",
      "vision_changes",
    ],
    tips: [
      "Nausea, dizziness, a puffy face or blocked ears are common in the first week. Log them at check-in.",
      "Log any change in your vision, even a small one.",
      "Keep up daily resistance and cardio exercise to protect bones and muscles.",
      "Know the radiation shelter procedure. Log your dosimeter reading if you have one.",
    ],
  },
  station: {
    id: "station",
    label: "Space station",
    gravity: "Microgravity",
    gravityClass: "micro",
    emphasis: [
      "Fluid shift toward the head",
      "Vision changes",
      "Bone and muscle loss",
      "Isolation",
      "Regular exercise on the station equipment",
      "Cabin CO2 monitoring",
    ],
    hazards: ["gravity", "radiation", "isolation", "closed_environment"],
    watchSymptoms: [
      "nausea_vomiting",
      "dizziness",
      "facial_puffiness",
      "ear_congestion",
      "vision_changes",
      "headache",
    ],
    tips: [
      "Nausea, dizziness, a puffy face or blocked ears are common in the first week. Log them at check-in.",
      "Use the resistance device, treadmill and bike as scheduled, and log the minutes.",
      "A headache or trouble concentrating can be linked to cabin air. Log it so the cabin-air rule can check.",
      "Log any change in your vision, even a small one.",
    ],
  },
  rover: {
    id: "rover",
    label: "Rover",
    gravity: "Partial gravity, with vibration while moving",
    gravityClass: "partial",
    emphasis: [
      "Vibration",
      "Back pain",
      "Motion sickness",
      "Confinement in a tight cabin",
      "Thermal comfort",
      "Short-duration stress",
    ],
    hazards: ["closed_environment", "gravity", "isolation"],
    watchSymptoms: ["back_pain", "nausea_vomiting", "dizziness"],
    tips: [
      "Vibration and a tight cabin make back pain and motion sickness more likely. Log them at check-in.",
      "Log your water intake. A small cabin can get warm.",
      "Short trips can still be stressful. Record your stress level honestly.",
      "Change position and stretch when the rover is stopped.",
    ],
  },
  moon_base: {
    id: "moon_base",
    label: "Moon base",
    gravity: "About 1/6 of Earth gravity",
    gravityClass: "partial",
    emphasis: [
      "Dust (eyes and cough)",
      "Bone loading still needed",
      "Radiation",
      "Isolation",
    ],
    hazards: ["closed_environment", "gravity", "radiation", "isolation"],
    watchSymptoms: ["eye_pain", "cough_sore_throat", "back_pain"],
    tips: [
      "Dust can irritate the eyes and airways. Log eye pain or a cough.",
      "One sixth of Earth gravity does not load the bones enough. Keep up resistance exercise.",
      "Log your dosimeter reading if you have one.",
      "Isolation builds slowly. Keep doing the mood and sleep check-in every day.",
    ],
  },
  mars_base: {
    id: "mars_base",
    label: "Mars base",
    gravity: "About 3/8 of Earth gravity",
    gravityClass: "partial",
    emphasis: [
      "Long isolation",
      "Radiation",
      "Adaptation after the long transit",
      "Nutrition",
      "Communication delay with Earth",
    ],
    hazards: ["isolation", "distance", "radiation", "gravity"],
    watchSymptoms: [
      "nausea_vomiting",
      "dizziness",
      "low_mood",
      "loss_of_appetite",
    ],
    tips: [
      "After the long transit, expect a few days of adapting to gravity again. Log nausea or dizziness.",
      "Help from Earth arrives with a delay. Follow the escalation steps in this app and tell the crew early.",
      "Keep an eye on appetite and water intake, and log them.",
      "Mood and sleep matter more as the mission goes on. Keep the daily check-in going.",
    ],
  },
};

export function getEnvironmentConfig(id: Environment): EnvironmentConfig {
  return ENVIRONMENT_CONFIGS[id];
}

/** True when switching between these two environments moves the astronaut
 * between microgravity and partial gravity. */
export function isGravityChange(from: Environment, to: Environment): boolean {
  return (
    ENVIRONMENT_CONFIGS[from].gravityClass !==
    ENVIRONMENT_CONFIGS[to].gravityClass
  );
}

/* ---- Mission-phase modifiers (SPEC §4.4) -------------------------------- */

/** CMB-SAM-01: "first 3 mission days or first 3 days after gravity
 * change". */
export const ADAPTATION_RULE_DAYS = 3;

/** "Mission day 1 to 7: expect space-adaptation symptoms; soften yellow".
 * The same 7-day window is applied after a gravity change. */
export const ADAPTATION_SOFTEN_DAYS = 7;

/** "...soften yellow for nausea, dizziness, facial_puffiness,
 * ear_congestion, but never soften red/critical." */
export const ADAPTATION_SOFTEN_SYMPTOMS: SymptomId[] = [
  "nausea_vomiting",
  "dizziness",
  "facial_puffiness",
  "ear_congestion",
];
