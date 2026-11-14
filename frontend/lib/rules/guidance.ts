import type { Status } from "@/config/thresholds";
import { getIndicatorConfig } from "@/config/thresholds";
import type {
  Action,
  ActionCategory,
  EscalationLevel,
  Escalation,
  EvalInput,
  Flag,
  IndicatorResult,
  TrendAlert,
} from "./types";

const INDICATOR_CATEGORY: Record<string, ActionCategory> = {
  heart_rate: "medical",
  bp_systolic: "medical",
  bp_diastolic: "medical",
  glucose_mgdl: "nutrition",
  temperature_c: "medical",
  spo2: "medical",
  sleep_hours: "rest",
  mood: "mental",
  exercise_minutes: "exercise",
  water_ml: "hydration",
  radiation_dose_pct: "medical",
  team_relations: "mental",
};

const RULE_CATEGORY: Record<string, ActionCategory> = {
  "CMB-CHEST-01": "medical",
  "CMB-CO2-01": "environment",
  "CMB-INF-01": "medical",
  "CMB-CV-01": "medical",
  "CMB-HYP-01": "medical",
  "CMB-VIS-01": "medical",
  "CMB-DEHY-01": "hydration",
  "CMB-GLU-01": "nutrition",
  "CMB-HYPO-01": "nutrition",
  "CMB-SAM-01": "rest",
  "CMB-MENT-01": "mental",
  "CMB-SAFETY-01": "mental",
  "CMB-BACK-01": "exercise",
  "CMB-HYPOX-01": "medical",
  "CMB-DCS-01": "medical",
  "CMB-IMM-01": "medical",
  "TRD-SLP-01": "rest",
  "TRD-SLP-02": "rest",
  "TRD-MOOD-01": "mental",
  "TRD-BP-01": "medical",
  "TRD-HR-01": "medical",
  "TRD-EXR-01": "exercise",
  "TRD-WGT-01": "nutrition",
  "TRD-RAD-01": "medical",
  "TRD-MISS-01": "measure",
  "TRD-TEAM-01": "mental",
};

const STATUS_PRIORITY: Record<Status, 1 | 2 | 3 | 4> = {
  critical: 1,
  red: 2,
  yellow: 3,
  green: 4,
};

const MAX_ACTIONS = 4;
const MAX_ACTION_LENGTH = 140;

function clamp(text: string): string {
  return text.length > MAX_ACTION_LENGTH
    ? `${text.slice(0, MAX_ACTION_LENGTH - 1)}…`
    : text;
}

function buildExplanation(
  indicators: IndicatorResult[],
  flags: Flag[],
  trends: TrendAlert[],
  overall: Status,
): string[] {
  const lines: string[] = [`Overall status: ${overall}.`];
  for (const i of indicators) {
    if (i.status === "green") continue;
    lines.push(`${i.ruleId}: ${i.id}=${i.value} -> ${i.status}.`);
  }
  for (const f of flags) {
    lines.push(`${f.id}: ${f.message}`);
  }
  for (const t of trends) {
    lines.push(`${t.id}: ${t.message}`);
  }
  return lines;
}

function actionsFromIndicators(indicators: IndicatorResult[]): Action[] {
  const actions: Action[] = [];
  for (const indicator of indicators) {
    if (indicator.status === "green") continue;
    const config = getIndicatorConfig(indicator.id);
    const tip = config?.tips[indicator.status]?.[0];
    if (!tip) continue;
    actions.push({
      id: `${indicator.ruleId}-tip`,
      priority: STATUS_PRIORITY[indicator.status],
      text: clamp(tip),
      category: INDICATOR_CATEGORY[indicator.id] ?? "measure",
    });
    if (indicator.status === "yellow" || indicator.status === "red") {
      actions.push({
        id: `${indicator.ruleId}-remeasure`,
        priority: STATUS_PRIORITY[indicator.status],
        text: clamp(
          `Re-check ${config?.label ?? indicator.id} after resting 10-15 minutes.`,
        ),
        category: "measure",
      });
    }
  }
  return actions;
}

function actionsFromFlags(flags: Flag[]): Action[] {
  return flags.map((flag) => ({
    id: `${flag.id}-action`,
    priority: STATUS_PRIORITY[flag.status],
    text: clamp(flag.message),
    category: RULE_CATEGORY[flag.id] ?? "medical",
  }));
}

function actionsFromTrends(trends: TrendAlert[]): Action[] {
  return trends.map((trend) => ({
    id: `${trend.id}-action`,
    priority: STATUS_PRIORITY[trend.status],
    text: clamp(trend.message),
    category: RULE_CATEGORY[trend.id] ?? "measure",
  }));
}

function pickTopActions(candidates: Action[]): Action[] {
  const seen = new Set<string>();
  const unique = candidates.filter((a) => {
    if (seen.has(a.id)) return false;
    seen.add(a.id);
    return true;
  });
  unique.sort((a, b) => a.priority - b.priority);
  return unique.slice(0, MAX_ACTIONS);
}

function buildEscalation(overall: Status): Escalation | null {
  const level: EscalationLevel =
    overall === "critical"
      ? "emergency"
      : overall === "red"
        ? "contact_surgeon"
        : overall === "yellow"
          ? "self_care"
          : "none";

  switch (level) {
    case "none":
      return { level, text: "No escalation needed today." };
    case "self_care":
      return {
        level,
        text: "Self-care: follow today's actions above and re-measure anything borderline.",
      };
    case "contact_surgeon":
      return {
        level,
        text: "Contact the flight surgeon. Share your last 3 values and today's symptoms. See the onboard medical kit (check your mission formulary) for general supportive care.",
      };
    case "emergency":
      return {
        level,
        text: "Emergency: stop activity, secure yourself, alert the crew, and contact the flight surgeon now. See the onboard medical kit (check your mission formulary) for general supportive care.",
      };
  }
}

export function buildGuidance(
  adjusted: {
    indicators: IndicatorResult[];
    flags: Flag[];
    trends: TrendAlert[];
  },
  overall: Status,
  _input: EvalInput,
): { actions: Action[]; escalation: Escalation | null; explanation: string[] } {
  const candidates = [
    ...actionsFromFlags(adjusted.flags),
    ...actionsFromIndicators(adjusted.indicators),
    ...actionsFromTrends(adjusted.trends),
  ];

  return {
    actions: pickTopActions(candidates),
    escalation: buildEscalation(overall),
    explanation: buildExplanation(
      adjusted.indicators,
      adjusted.flags,
      adjusted.trends,
      overall,
    ),
  };
}
