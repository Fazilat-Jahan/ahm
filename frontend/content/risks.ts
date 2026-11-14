import type { Hazard } from "@/config/thresholds";

/**
 * NASA HRP risk -> indicator -> rule map (SPEC §2.1). This is the contract
 * between NASA's risk list and the app: Learn pages, body-map panels, and
 * the rule engine's `explanation` lines all reference these same risk ids.
 *
 * `summary` is a short, factual, NASA-text-free restatement of the risk —
 * full paraphrased Learn-page prose and NASA source links are C10's job
 * (SPEC §2.1 "Content rules for Learn pages and tooltips").
 */

export type RiskCoverage = "tracked" | "partly_tracked" | "out_of_scope";

export interface Risk {
  id: number;
  name: string;
  hazards: Hazard[];
  trackedVia: string[];
  ruleIds: string[];
  bodyRegions: string[];
  coverage: RiskCoverage;
  summary: string;
}

export const RISKS: Risk[] = [
  {
    id: 1,
    name: "Altered immune system responses",
    hazards: ["radiation", "isolation", "closed_environment"],
    trackedVia: [
      "temperature_c",
      "rash_skin_irritation",
      "fever_chills",
      "cough_sore_throat",
      "fatigue",
      "stress",
    ],
    ruleIds: ["CMB-INF-01", "CMB-IMM-01"],
    bodyRegions: ["region_immune", "region_skin"],
    coverage: "tracked",
    summary:
      "Spaceflight can change how the immune system responds to infection and irritation.",
  },
  {
    id: 2,
    name: "Altered sensorimotor and vestibular function",
    hazards: ["gravity"],
    trackedVia: ["dizziness", "nausea_vomiting", "ear_congestion"],
    ruleIds: ["CMB-SAM-01"],
    bodyRegions: ["region_brain"],
    coverage: "tracked",
    summary:
      "Gravity changes affect balance and orientation, especially early in a mission.",
  },
  {
    id: 3,
    name: "Cardiovascular adaptations",
    hazards: ["gravity", "radiation"],
    trackedVia: [
      "heart_rate",
      "bp_systolic",
      "bp_diastolic",
      "chest_pain",
      "palpitations",
      "dizziness",
    ],
    ruleIds: [
      "CMB-CHEST-01",
      "CMB-CV-01",
      "CMB-HYP-01",
      "TRD-BP-01",
      "TRD-HR-01",
    ],
    bodyRegions: ["region_heart"],
    coverage: "tracked",
    summary:
      "Fluid shift and deconditioning in altered gravity change heart rate and blood pressure.",
  },
  {
    id: 4,
    name: "Decompression sickness",
    hazards: ["closed_environment"],
    trackedVia: [
      "eva_today",
      "joint_pain",
      "muscle_aches",
      "tingling_numbness",
      "shortness_of_breath",
      "dizziness",
    ],
    ruleIds: ["CMB-DCS-01"],
    bodyRegions: ["region_muscles", "region_lungs"],
    coverage: "tracked",
    summary:
      "A suit-pressure change during a spacewalk can cause decompression sickness.",
  },
  {
    id: 5,
    name: "Host-microorganism interactions",
    hazards: ["closed_environment"],
    trackedVia: [
      "rash_skin_irritation",
      "abdominal_pain",
      "nausea_vomiting",
      "temperature_c",
    ],
    ruleIds: ["CMB-INF-01"],
    bodyRegions: ["region_skin", "region_gut"],
    coverage: "partly_tracked",
    summary:
      "The habitat's shared, closed microbial environment can change infection risk.",
  },
  {
    id: 6,
    name: "Hypoxia",
    hazards: ["closed_environment"],
    trackedVia: [
      "spo2",
      "shortness_of_breath",
      "headache",
      "difficulty_concentrating",
      "fatigue",
    ],
    ruleIds: ["CMB-HYPOX-01", "CMB-CO2-01"],
    bodyRegions: ["region_lungs", "region_brain"],
    coverage: "tracked",
    summary: "Habitat or suit oxygen/CO2 problems can lower blood oxygen.",
  },
  {
    id: 7,
    name: "Inadequate food and nutrition",
    hazards: ["closed_environment", "distance"],
    trackedVia: [
      "calories",
      "weight_kg",
      "glucose_mgdl",
      "water_ml",
      "loss_of_appetite",
    ],
    ruleIds: ["TRD-WGT-01"],
    bodyRegions: ["region_gut"],
    coverage: "tracked",
    summary:
      "Limited food variety and supply on long missions can lead to inadequate nutrition.",
  },
  {
    id: 8,
    name: "Injury and compromised performance from spacewalks (EVA)",
    hazards: ["closed_environment", "gravity"],
    trackedVia: ["eva_today", "fatigue", "muscle_aches", "joint_pain"],
    ruleIds: ["CMB-DCS-01"],
    bodyRegions: ["region_muscles"],
    coverage: "partly_tracked",
    summary:
      "Spacewalks carry injury and fatigue risk beyond decompression sickness alone.",
  },
  {
    id: 9,
    name: "Reduced cardiorespiratory and musculoskeletal fitness",
    hazards: ["gravity"],
    trackedVia: [
      "exercise_resistance_min",
      "exercise_cardio_min",
      "muscle_aches",
      "weight_kg",
    ],
    ruleIds: ["TRD-EXR-01"],
    bodyRegions: ["region_muscles"],
    coverage: "tracked",
    summary:
      "Without enough exercise, altered gravity reduces fitness over time.",
  },
  {
    id: 10,
    name: "Spaceflight Associated Neuro-ocular Syndrome (SANS)",
    hazards: ["gravity", "radiation"],
    trackedVia: ["vision_changes", "eye_pain", "headache", "facial_puffiness"],
    ruleIds: ["CMB-VIS-01"],
    bodyRegions: ["region_eyes"],
    coverage: "tracked",
    summary:
      "Fluid shift in altered gravity can change vision; this app tracks symptoms only, not eye imaging.",
  },
  {
    id: 11,
    name: "Spaceflight-induced bone changes",
    hazards: ["gravity"],
    trackedVia: ["exercise_resistance_min", "back_pain", "joint_pain"],
    ruleIds: ["TRD-EXR-01", "CMB-BACK-01"],
    bodyRegions: ["region_spine"],
    coverage: "tracked",
    summary:
      "Reduced gravity loading on bone can't be measured directly here, so exercise is tracked as the protective proxy.",
  },
  {
    id: 12,
    name: "Behavioral changes and psychiatric disorders",
    hazards: ["isolation", "radiation", "distance"],
    trackedVia: [
      "mood",
      "stress",
      "sleep_hours",
      "low_mood",
      "anxiety",
      "irritability",
      "selfHarmThoughts",
    ],
    ruleIds: ["CMB-MENT-01", "CMB-SAFETY-01", "TRD-MOOD-01"],
    bodyRegions: ["region_mind"],
    coverage: "tracked",
    summary:
      "Isolation, confinement, and distance from Earth affect mood and behavioural health.",
  },
  {
    id: 13,
    name: "Inadequate teamwork",
    hazards: ["isolation"],
    trackedVia: ["team_relations", "irritability"],
    ruleIds: ["TRD-TEAM-01"],
    bodyRegions: ["region_mind"],
    coverage: "tracked",
    summary:
      "Isolation and confinement can strain how well the crew works together.",
  },
  {
    id: 14,
    name: "Inadequate sleep and irregular schedules",
    hazards: ["isolation"],
    trackedVia: ["sleep_hours", "sleep_quality", "insomnia", "fatigue"],
    ruleIds: ["TRD-SLP-01", "TRD-SLP-02"],
    bodyRegions: ["region_mind"],
    coverage: "tracked",
    summary: "Isolation and workload can disrupt sleep schedules and duration.",
  },
  {
    id: 15,
    name: "Injury from dynamic loads (launch/landing)",
    hazards: ["gravity"],
    trackedVia: ["back_pain", "joint_pain", "muscle_aches"],
    ruleIds: ["CMB-BACK-01"],
    bodyRegions: ["region_spine"],
    coverage: "tracked",
    summary:
      "Launch and landing forces can cause injury, tracked here via back/joint pain.",
  },
  {
    id: 16,
    name: "Radiation-induced cancers",
    hazards: ["radiation"],
    trackedVia: ["radiation_msv"],
    ruleIds: ["TRD-RAD-01"],
    bodyRegions: ["region_immune"],
    coverage: "tracked",
    summary:
      "Cumulative radiation dose is tracked against the mission budget; cancer risk itself can't be assessed by this app.",
  },
  {
    id: 17,
    name: "Inadequate systems operations support",
    hazards: ["distance"],
    trackedVia: [],
    ruleIds: [],
    bodyRegions: [],
    coverage: "out_of_scope",
    summary:
      "An operational/training risk, not a health indicator — mentioned in Learn content only.",
  },
];

export function getRisk(id: number): Risk | undefined {
  return RISKS.find((r) => r.id === id);
}
