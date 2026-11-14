import type { Severity, SymptomId } from "@/config/symptoms";
import type { FollowupResponse } from "@/lib/db/schema";
import { getMissionDate } from "@/lib/time/missionDate";

export const WIZARD_STEPS = [
  "recap",
  "symptoms",
  "measurements",
  "mood",
  "review",
  "result",
] as const;

export type WizardStep = (typeof WIZARD_STEPS)[number];

export type MeasurementFieldValue = number | boolean | undefined;

export interface WizardState {
  date: string;
  followupAnswers: Record<string, FollowupResponse>;
  symptoms: Partial<Record<SymptomId, Severity>>;
  measurementValues: Record<string, MeasurementFieldValue>;
  firstReadings: Record<string, number | undefined>;
  acknowledgedBorderline: Record<string, boolean>;
  measurementErrors: Record<string, string | undefined>;
  mood: number | undefined;
  stress: number | undefined;
  selfHarmThoughts: boolean;
}

export function createInitialWizardState(): WizardState {
  return {
    date: getMissionDate(),
    followupAnswers: {},
    symptoms: {},
    measurementValues: {},
    firstReadings: {},
    acknowledgedBorderline: {},
    measurementErrors: {},
    mood: undefined,
    stress: undefined,
    selfHarmThoughts: false,
  };
}
