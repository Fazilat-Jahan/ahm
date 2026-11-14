import { ADAPTATION_RULE_DAYS } from "@/config/environments";
import type { SymptomId } from "@/config/symptoms";
import { getIndicatorStatus } from "./bands";
import { isWithinAdaptationWindow } from "./modifiers";
import { milder, worst } from "./status";
import type {
  CrewSignals,
  DailyLogInput,
  Flag,
  HistoryDay,
  IndicatorResult,
  MissionContext,
  SymptomInput,
} from "./types";

function hasSymptom(
  symptoms: SymptomInput[],
  id: SymptomId,
  minSeverity: 1 | 2 | 3 = 1,
): boolean {
  return symptoms.some((s) => s.symptom === id && s.severity >= minSeverity);
}

function hasAny(symptoms: SymptomInput[], ids: SymptomId[]): boolean {
  return ids.some((id) => hasSymptom(symptoms, id));
}

interface ComboContext {
  log: DailyLogInput;
  symptoms: SymptomInput[];
  history: HistoryDay[];
  mission: MissionContext;
  indicators: IndicatorResult[];
  crewSignals?: CrewSignals;
}

type ComboRule = (ctx: ComboContext) => Flag | null;

const comboChest: ComboRule = ({ symptoms }) => {
  const chestPain = hasSymptom(symptoms, "chest_pain");
  const severe = hasSymptom(symptoms, "chest_pain", 2);
  const withBreath = chestPain && hasSymptom(symptoms, "shortness_of_breath");
  if (!severe && !withBreath) return null;
  return {
    id: "CMB-CHEST-01",
    status: "critical",
    message:
      "Chest pain reported — possible cardiac emergency. Stop activity, sit/secure yourself, contact the flight surgeon now.",
    hazard: "gravity",
    causedBySymptoms: ["chest_pain"],
  };
};

const comboCo2: ComboRule = ({ symptoms, indicators, crewSignals }) => {
  if (!hasSymptom(symptoms, "headache")) return null;
  if (
    !hasAny(symptoms, [
      "dizziness",
      "shortness_of_breath",
      "difficulty_concentrating",
    ])
  )
    return null;
  const spo2Status = getIndicatorStatus(indicators, "spo2");
  const spo2Elevated = spo2Status === "yellow" || spo2Status === "red";
  if (!spo2Elevated && !crewSignals?.sameSymptomReportedByOthers) return null;
  return {
    id: "CMB-CO2-01",
    status: "red",
    message:
      "Possible high CO2 / air quality problem. Check the cabin CO2 monitor, move to a different module, alert the crew.",
    hazard: "closed_environment",
  };
};

const comboInfection: ComboRule = ({ log, symptoms }) => {
  if (log.temperature_c === undefined || log.temperature_c < 37.8) return null;
  if (
    !hasAny(symptoms, [
      "cough_sore_throat",
      "fever_chills",
      "rash_skin_irritation",
    ])
  )
    return null;
  return {
    id: "CMB-INF-01",
    status: "red",
    message:
      "Possible infection. Isolate, hydrate, and contact the flight surgeon.",
    hazard: "radiation",
  };
};

const comboCardiovascular: ComboRule = ({ symptoms, indicators }) => {
  if (getIndicatorStatus(indicators, "heart_rate") !== "red") return null;
  if (!hasAny(symptoms, ["dizziness", "palpitations"])) return null;
  return {
    id: "CMB-CV-01",
    status: "red",
    message:
      "Elevated heart rate with dizziness/palpitations. Sit/rest, repeat the measurement after 10 minutes, contact the flight surgeon.",
    hazard: "gravity",
  };
};

const comboHypertension: ComboRule = ({ symptoms, indicators }) => {
  const bpStatus = worst(
    getIndicatorStatus(indicators, "bp_systolic") ?? "green",
    getIndicatorStatus(indicators, "bp_diastolic") ?? "green",
  );
  if (bpStatus !== "red") return null;
  if (!hasAny(symptoms, ["headache", "vision_changes"])) return null;
  return {
    id: "CMB-HYP-01",
    // SPEC says "critical/red" with no stated differentiator; we pick the
    // milder of the two (see lib/rules/status.ts `milder`).
    status: milder("critical", "red"),
    message:
      "High blood pressure with headache/vision changes. Contact the flight surgeon (possible severe hypertension).",
    hazard: "gravity",
  };
};

const comboVision: ComboRule = ({ symptoms, history }) => {
  if (!hasAny(symptoms, ["vision_changes", "eye_pain"])) return null;
  const yesterday = history[0];
  const persisted =
    yesterday !== undefined &&
    hasAny(yesterday.symptoms, ["vision_changes", "eye_pain"]);
  return {
    id: "CMB-VIS-01",
    status: persisted ? "red" : "yellow",
    message: persisted
      ? "Vision change/eye pain persisting 2+ days — SANS watch. Report to the flight surgeon."
      : "Vision change/eye pain reported. Log it and do a vision self-test (SANS watch).",
    hazard: "gravity",
    causedBySymptoms: persisted ? undefined : ["vision_changes"],
  };
};

const comboDehydration: ComboRule = ({ symptoms, indicators }) => {
  const hydrationStatus = getIndicatorStatus(indicators, "water_ml");
  if (hydrationStatus !== "yellow" && hydrationStatus !== "red") return null;
  const hrElevated = ["yellow", "red", "critical"].includes(
    getIndicatorStatus(indicators, "heart_rate") ?? "green",
  );
  if (!hasAny(symptoms, ["dizziness", "fatigue"]) && !hrElevated) return null;
  return {
    id: "CMB-DEHY-01",
    status: milder("yellow", "red"),
    message:
      "Low hydration with dizziness/fatigue. Drink water/electrolytes, reassess in 2 hours.",
    hazard: "closed_environment",
  };
};

const comboGlucoseHigh: ComboRule = ({ symptoms, indicators }) => {
  if (getIndicatorStatus(indicators, "glucose_mgdl") !== "red") return null;
  if (!hasAny(symptoms, ["nausea_vomiting", "abdominal_pain"])) return null;
  return {
    id: "CMB-GLU-01",
    status: milder("red", "critical"),
    message:
      "High glucose with nausea/abdominal pain. Contact the flight surgeon.",
    hazard: "closed_environment",
  };
};

const comboGlucoseLow: ComboRule = ({ log, symptoms }) => {
  if (log.glucose_mgdl === undefined || log.glucose_mgdl >= 70) return null;
  if (!hasAny(symptoms, ["dizziness", "fatigue"])) return null;
  return {
    id: "CMB-HYPO-01",
    status: "red",
    message:
      "Low glucose with dizziness/fatigue. Take a fast-acting carbohydrate, recheck in 15 minutes.",
    hazard: "closed_environment",
  };
};

const comboSpaceAdaptation: ComboRule = ({ symptoms, mission }) => {
  // SPEC §4.4: "in first 3 mission days or first 3 days after gravity
  // change". The second clause is driven by the Environment screen (C10).
  if (!isWithinAdaptationWindow(mission, ADAPTATION_RULE_DAYS)) return null;
  if (
    !hasSymptom(symptoms, "nausea_vomiting") ||
    !hasSymptom(symptoms, "dizziness")
  )
    return null;
  return {
    id: "CMB-SAM-01",
    status: "yellow",
    message:
      "Space adaptation syndrome likely. Move your head slowly, hydrate, rest.",
    hazard: "gravity",
    // Deliberately untagged: CMB-SAM-01 is itself the dedicated, already-
    // capped-at-yellow early-mission rule for these exact symptoms, so it
    // must not also be a target of the mission-phase softening modifier
    // (that would silently cancel it out every time it fires — see
    // DECISIONS.md). The softening mechanism stays available in
    // lib/rules/modifiers.ts for any other symptom-only-driven yellow.
  };
};

const comboMentalHealth: ComboRule = ({ log, symptoms }) => {
  if (log.mood === undefined || log.mood > 2) return null;
  if (!hasAny(symptoms, ["low_mood", "anxiety", "insomnia"])) return null;
  return {
    id: "CMB-MENT-01",
    status: "red",
    message:
      "Low mood with low mood/anxiety/insomnia symptoms. Talk to a crewmate; schedule a private call with the counsellor.",
    hazard: "isolation",
  };
};

const comboSafety: ComboRule = ({ log }) => {
  if (!log.selfHarmThoughts) return null;
  return {
    id: "CMB-SAFETY-01",
    status: "critical",
    message:
      "You indicated thoughts of harming yourself. Reach out for immediate human support and contact the flight surgeon now.",
    hazard: "isolation",
  };
};

const comboBackPain: ComboRule = ({ symptoms, history }) => {
  if (!hasSymptom(symptoms, "back_pain", 2)) return null;
  const prevTwo = history.slice(0, 2);
  const sustained =
    prevTwo.length === 2 &&
    prevTwo.every((day) => hasSymptom(day.symptoms, "back_pain", 2));
  if (!sustained) return null;
  return {
    id: "CMB-BACK-01",
    status: milder("yellow", "red"),
    message:
      "Back pain (moderate+) for 3+ consecutive days. Adjust posture/exercise and report it.",
    hazard: "gravity",
  };
};

const comboHypoxia: ComboRule = ({ log, symptoms }) => {
  if (log.spo2 === undefined || log.spo2 >= 95) return null;
  const trigger =
    hasAny(symptoms, [
      "shortness_of_breath",
      "headache",
      "dizziness",
      "difficulty_concentrating",
    ]) || hasSymptom(symptoms, "fatigue", 2);
  if (!trigger) return null;
  return {
    id: "CMB-HYPOX-01",
    status: log.spo2 < 88 ? "critical" : "red",
    message:
      "Possible low oxygen. Sit down, check cabin/suit O2 and CO2 readings per mission procedure, alert crew, contact the flight surgeon.",
    hazard: "closed_environment",
  };
};

const comboDecompressionSickness: ComboRule = ({ log, symptoms, history }) => {
  const evaRecently =
    Boolean(log.eva_today) || Boolean(history[0]?.log.eva_today);
  if (!evaRecently) return null;
  const criticalTrigger = hasAny(symptoms, [
    "shortness_of_breath",
    "tingling_numbness",
  ]);
  const redTrigger =
    criticalTrigger ||
    hasSymptom(symptoms, "joint_pain") ||
    hasSymptom(symptoms, "muscle_aches", 2) ||
    hasSymptom(symptoms, "dizziness");
  if (!redTrigger) return null;
  return {
    id: "CMB-DCS-01",
    status: criticalTrigger ? "critical" : "red",
    message:
      "Possible decompression sickness after a spacewalk. Stop activity, alert crew, contact the flight surgeon now.",
    hazard: "closed_environment",
  };
};

const comboImmune: ComboRule = ({ log, symptoms }) => {
  if (!hasSymptom(symptoms, "rash_skin_irritation")) return null;
  const fever =
    (log.temperature_c !== undefined && log.temperature_c >= 37.8) ||
    hasSymptom(symptoms, "fever_chills");
  if (fever) return null; // CMB-INF-01 applies instead
  return {
    id: "CMB-IMM-01",
    status: "yellow",
    message:
      "Skin/immune change (stress can reactivate dormant viruses). Log it, keep the area clean, report if spreading or lasting 2 days.",
    hazard: "radiation",
    causedBySymptoms: ["rash_skin_irritation"],
  };
};

const COMBO_RULES: ComboRule[] = [
  comboChest,
  comboCo2,
  comboInfection,
  comboCardiovascular,
  comboHypertension,
  comboVision,
  comboDehydration,
  comboGlucoseHigh,
  comboGlucoseLow,
  comboSpaceAdaptation,
  comboMentalHealth,
  comboSafety,
  comboBackPain,
  comboHypoxia,
  comboDecompressionSickness,
  comboImmune,
];

export function evaluateCombos(ctx: ComboContext): Flag[] {
  const flags: Flag[] = [];
  for (const rule of COMBO_RULES) {
    const flag = rule(ctx);
    if (flag) flags.push(flag);
  }
  return flags;
}

export type { ComboContext };
