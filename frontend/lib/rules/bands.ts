import {
  THRESHOLDS,
  getStatusForValue,
  type Status,
} from "@/config/thresholds";
import type { DailyLogInput, IndicatorResult, MissionContext } from "./types";

const RULE_PREFIX: Record<string, string> = {
  heart_rate: "HR",
  bp_systolic: "BP-SYS",
  bp_diastolic: "BP-DIA",
  glucose_mgdl: "GLU",
  temperature_c: "TEMP",
  spo2: "SPO2",
  sleep_hours: "SLP",
  mood: "MOOD",
  exercise_minutes: "EXR",
  water_ml: "HYD",
  radiation_dose_pct: "RAD",
  team_relations: "TEAM",
};

/** Maps today's raw log (+ mission context, for radiation) onto the ids
 * used by THRESHOLDS. Exercise and radiation are computed, everything else
 * is a direct field. Returns undefined for any value that wasn't entered
 * (measurements can be skipped). */
export function deriveBandableValues(
  log: DailyLogInput,
  mission: MissionContext,
): Record<string, number | undefined> {
  const exerciseMinutes =
    log.exercise_resistance_min === undefined &&
    log.exercise_cardio_min === undefined
      ? undefined
      : (log.exercise_resistance_min ?? 0) + (log.exercise_cardio_min ?? 0);

  const radiationBudget = mission.radiationDailyBudgetMsv;
  const radiationDosePct =
    log.radiation_msv === undefined || !radiationBudget
      ? undefined
      : (log.radiation_msv / radiationBudget) * 100;

  return {
    heart_rate: log.heart_rate,
    bp_systolic: log.bp_systolic,
    bp_diastolic: log.bp_diastolic,
    glucose_mgdl: log.glucose_mgdl,
    temperature_c: log.temperature_c,
    spo2: log.spo2,
    sleep_hours: log.sleep_hours,
    mood: log.mood,
    exercise_minutes: exerciseMinutes,
    water_ml: log.water_ml,
    radiation_dose_pct: radiationDosePct,
    team_relations: log.team_relations,
  };
}

export function evaluateBands(
  log: DailyLogInput,
  mission: MissionContext,
): IndicatorResult[] {
  const values = deriveBandableValues(log, mission);
  const results: IndicatorResult[] = [];

  for (const config of THRESHOLDS) {
    const value = values[config.id];
    if (value === undefined || Number.isNaN(value)) continue;

    const status = getStatusForValue(config, value);
    const prefix = RULE_PREFIX[config.id] ?? config.id.toUpperCase();
    results.push({
      id: config.id,
      value,
      status,
      ruleId: `${prefix}-01`,
      message: `${config.label} ${value}${config.unit} is ${status}.`,
    });
  }

  return results;
}

export function getIndicatorStatus(
  indicators: IndicatorResult[],
  id: string,
): Status | undefined {
  return indicators.find((i) => i.id === id)?.status;
}
