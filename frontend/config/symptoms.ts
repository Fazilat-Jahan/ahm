/** Symptom checklist (SPEC §4.3). Each reported symptom carries a severity. */

export const SYMPTOM_IDS = [
  "headache",
  "dizziness",
  "nausea_vomiting",
  "fatigue",
  "muscle_aches",
  "back_pain",
  "joint_pain",
  "chest_pain",
  "shortness_of_breath",
  "palpitations",
  "fever_chills",
  "cough_sore_throat",
  "rash_skin_irritation",
  "vision_changes",
  "eye_pain",
  "facial_puffiness",
  "loss_of_appetite",
  "abdominal_pain",
  "insomnia",
  "low_mood",
  "anxiety",
  "irritability",
  "difficulty_concentrating",
  "ear_congestion",
  "tingling_numbness",
] as const;

export type SymptomId = (typeof SYMPTOM_IDS)[number];

export const SEVERITY_LEVELS = [1, 2, 3] as const;
export type Severity = (typeof SEVERITY_LEVELS)[number];

export interface SymptomConfig {
  id: SymptomId;
  label: string;
}

const LABELS: Record<SymptomId, string> = {
  headache: "Headache",
  dizziness: "Dizziness",
  nausea_vomiting: "Nausea / vomiting",
  fatigue: "Fatigue",
  muscle_aches: "Muscle aches",
  back_pain: "Back pain",
  joint_pain: "Joint pain",
  chest_pain: "Chest pain",
  shortness_of_breath: "Shortness of breath",
  palpitations: "Palpitations",
  fever_chills: "Fever / chills",
  cough_sore_throat: "Cough / sore throat",
  rash_skin_irritation: "Rash / skin irritation",
  vision_changes: "Vision changes",
  eye_pain: "Eye pain",
  facial_puffiness: "Facial puffiness",
  loss_of_appetite: "Loss of appetite",
  abdominal_pain: "Abdominal pain",
  insomnia: "Insomnia",
  low_mood: "Low mood",
  anxiety: "Anxiety",
  irritability: "Irritability",
  difficulty_concentrating: "Difficulty concentrating",
  ear_congestion: "Ear congestion",
  tingling_numbness: "Tingling / numbness",
};

export const SYMPTOMS: SymptomConfig[] = SYMPTOM_IDS.map((id) => ({
  id,
  label: LABELS[id],
}));

export function isSymptomId(value: string): value is SymptomId {
  return (SYMPTOM_IDS as readonly string[]).includes(value);
}

export function getSymptomLabel(id: SymptomId): string {
  return LABELS[id];
}
