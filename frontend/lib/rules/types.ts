import type { Status } from "@/config/thresholds";
import type { Severity, SymptomId } from "@/config/symptoms";

export type { Status };

export const ENVIRONMENTS = [
  "spacecraft",
  "station",
  "rover",
  "moon_base",
  "mars_base",
] as const;

export type Environment = (typeof ENVIRONMENTS)[number];

/** Today's measurements. Field names mirror the eventual DailyLog DB schema.
 * Everything is optional: measurements can be skipped at check-in. */
export interface DailyLogInput {
  date: string; // YYYY-MM-DD, mission-local
  heart_rate?: number;
  bp_systolic?: number;
  bp_diastolic?: number;
  glucose_mgdl?: number;
  temperature_c?: number;
  spo2?: number;
  sleep_hours?: number;
  sleep_quality?: number;
  mood?: number;
  stress?: number;
  team_relations?: number;
  weight_kg?: number;
  eva_today?: boolean;
  exercise_resistance_min?: number;
  exercise_cardio_min?: number;
  water_ml?: number;
  calories?: number;
  radiation_msv?: number;
  /** Explicit safety question from the mood/stress step (SPEC §4.4 CMB-SAFETY-01). */
  selfHarmThoughts?: boolean;
}

export interface SymptomInput {
  symptom: SymptomId;
  severity: Severity;
}

/** One prior day, most-recent-first (history[0] = yesterday). */
export interface HistoryDay {
  date: string;
  log: DailyLogInput;
  symptoms: SymptomInput[];
}

export interface MissionContext {
  environment: Environment;
  missionDay: number; // 1-based
  /** 1-based day count since the astronaut last moved between
   * microgravity and partial gravity (the day of the change is day 1).
   * Unset if there has been no such change. Supplied by the caller from
   * the astronaut's environment history; the engine stays pure. Drives
   * SPEC §4.4 CMB-SAM-01's "first 3 days after gravity change" clause. */
  daysSinceGravityChange?: number;
  missionTotalDays?: number;
  radiationDailyBudgetMsv?: number;
  radiationMissionBudgetMsv?: number;
  radiationCumulativeMsv?: number;
}

/** Signals the engine itself cannot compute (needs other crew's data). The
 * caller (repository layer) must supply these; the engine stays pure. */
export interface CrewSignals {
  sameSymptomReportedByOthers?: boolean;
}

export interface EvalInput {
  log: DailyLogInput;
  symptoms: SymptomInput[];
  history: HistoryDay[];
  mission: MissionContext;
  crewSignals?: CrewSignals;
}

export interface IndicatorResult {
  id: string;
  value: number | string;
  status: Status;
  ruleId: string;
  message: string;
  /** Symptoms that solely caused this result, if any — used by mission-phase
   * softening (SPEC §4.4). */
  causedBySymptoms?: SymptomId[];
}

export interface Flag {
  id: string;
  status: Status;
  message: string;
  hazard: string;
  causedBySymptoms?: SymptomId[];
}

export interface TrendAlert {
  id: string;
  status: Status;
  message: string;
  windowDays: number;
}

export type ActionCategory =
  | "rest"
  | "exercise"
  | "nutrition"
  | "hydration"
  | "mental"
  | "measure"
  | "medical"
  | "environment";

export interface Action {
  id: string;
  priority: 1 | 2 | 3 | 4;
  text: string;
  category: ActionCategory;
}

export type EscalationLevel =
  "none" | "self_care" | "contact_surgeon" | "emergency";

export interface Escalation {
  level: EscalationLevel;
  text: string;
}

export interface EvaluationResult {
  overall: Status;
  indicators: IndicatorResult[];
  flags: Flag[];
  trends: TrendAlert[];
  actions: Action[];
  escalation: Escalation | null;
  explanation: string[];
  rulesVersion: string;
}
