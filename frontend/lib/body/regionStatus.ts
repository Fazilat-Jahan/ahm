import type { Status } from "@/config/thresholds";
import type { IndicatorResult } from "@/lib/rules/types";
import { worst } from "@/lib/rules/status";

/**
 * Worst status among a region's mapped indicators (SPEC §8.3 screen 3's
 * region-mapping table), or `null` if none of them have a real value in the
 * latest evaluation yet — `null` means "neutral grey, no data" (SPEC §16),
 * never a fabricated default colour.
 */
export function getRegionStatus(
  indicators: IndicatorResult[] | undefined,
  indicatorIds: readonly string[],
): Status | null {
  if (!indicators || indicatorIds.length === 0) return null;
  let result: Status | null = null;
  for (const indicator of indicators) {
    if (!indicatorIds.includes(indicator.id)) continue;
    result =
      result === null ? indicator.status : worst(result, indicator.status);
  }
  return result;
}
