import {
  getIndicatorConfig,
  getStatusForValue,
  type Status,
} from "@/config/thresholds";
import type { MeasurementConfig } from "@/config/measurements";

/** SPEC §17 item 4: "if a value is yellow/red, prompt Rest 5 min and
 * measure again". Critical is deliberately excluded — that's handled by
 * the result screen's escalation (C4), not a re-measure nudge at entry. */
export function isBorderline(status: Status | undefined): boolean {
  return status === "yellow" || status === "red";
}

export function statusForIndicator(
  indicatorId: string | undefined,
  value: number | undefined,
): Status | undefined {
  if (indicatorId === undefined || value === undefined) return undefined;
  const config = getIndicatorConfig(indicatorId);
  if (!config) return undefined;
  return getStatusForValue(config, value);
}

/** Resolves the indicator id + value to borderline-check for one
 * measurement card, given the current form values. Handles both
 * per-field indicators (e.g. BP systolic/diastolic, checked
 * independently) and card-level combined indicators (e.g. exercise
 * minutes = resistance + cardio summed, mirroring
 * lib/rules/bands.ts `deriveBandableValues`). */
export function resolveBorderlineTargets(
  measurement: MeasurementConfig,
  values: Record<string, number | boolean | undefined>,
): { fieldId: string; indicatorId: string; value: number }[] {
  if (measurement.kind === "number" && measurement.indicatorId) {
    const value = values[measurement.id];
    if (typeof value === "number") {
      return [
        {
          fieldId: measurement.id,
          indicatorId: measurement.indicatorId,
          value,
        },
      ];
    }
    return [];
  }

  if (measurement.kind === "slider" && measurement.indicatorId) {
    const value = values[measurement.id];
    if (typeof value === "number") {
      return [
        {
          fieldId: measurement.id,
          indicatorId: measurement.indicatorId,
          value,
        },
      ];
    }
    return [];
  }

  if (measurement.kind === "two-number") {
    const [a, b] = measurement.fields;
    const results: { fieldId: string; indicatorId: string; value: number }[] =
      [];

    for (const field of [a, b]) {
      if (!field.indicatorId) continue;
      const value = values[field.id];
      if (typeof value === "number") {
        results.push({
          fieldId: field.id,
          indicatorId: field.indicatorId,
          value,
        });
      }
    }

    if (results.length === 0 && measurement.indicatorId) {
      const va = values[a.id];
      const vb = values[b.id];
      if (typeof va === "number" || typeof vb === "number") {
        const combined =
          (typeof va === "number" ? va : 0) + (typeof vb === "number" ? vb : 0);
        results.push({
          fieldId: measurement.id,
          indicatorId: measurement.indicatorId,
          value: combined,
        });
      }
    }

    return results;
  }

  return [];
}

/** All field ids this measurement could ever flag as borderline,
 * independent of whether a value is currently entered. Used to decide
 * which fields might need to show a stashed "first reading" note even
 * while their current value is empty (mid re-measure) — see
 * MeasurementCard, and the interaction note on `resolveBorderlineTargets`
 * above: that function alone can't do this because it only reports a
 * field once it HAS a current numeric value. */
export function getBorderlineFieldIds(
  measurement: MeasurementConfig,
): string[] {
  if (
    (measurement.kind === "number" || measurement.kind === "slider") &&
    measurement.indicatorId
  ) {
    return [measurement.id];
  }

  if (measurement.kind === "two-number") {
    const perField = measurement.fields
      .filter((f) => f.indicatorId)
      .map((f) => f.id);
    if (perField.length > 0) return perField;
    if (measurement.indicatorId) return [measurement.id];
  }

  return [];
}

/** Display unit for a borderline field id, for the prompt/info text. */
export function unitForBorderlineField(
  measurement: MeasurementConfig,
  fieldId: string,
): string {
  if (measurement.kind === "number") return measurement.unit;
  if (measurement.kind === "two-number") {
    return measurement.fields.find((f) => f.id === fieldId)?.unit ?? "";
  }
  return "";
}
