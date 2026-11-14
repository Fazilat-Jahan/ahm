import type { Status } from "@/config/thresholds";
import { getStatusConfig } from "@/components/status/StatusBadge";

/** "Neutral grey" (SPEC §8.3/§16) for a region with no data yet. */
export const NEUTRAL_REGION_COLOR = "#6b7280";

/**
 * Resolves a status to the exact hex value used everywhere else in the app
 * (the `--color-status-*` custom properties in `app/globals.css`, SPEC
 * §8.4's literal tokens) — three.js material colours can't parse a CSS
 * `var(...)` string, so this reads the already-computed value instead of
 * hardcoding a second copy of the 4 hex codes.
 */
export function resolveStatusColor(status: Status | null): string {
  if (status === null || typeof window === "undefined") {
    return NEUTRAL_REGION_COLOR;
  }
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(getStatusConfig(status).colorVar)
    .trim();
  return value || NEUTRAL_REGION_COLOR;
}
