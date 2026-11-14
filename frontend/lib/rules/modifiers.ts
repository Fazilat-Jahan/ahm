import {
  ADAPTATION_SOFTEN_DAYS,
  ADAPTATION_SOFTEN_SYMPTOMS,
} from "@/config/environments";
import type { SymptomId } from "@/config/symptoms";
import type {
  Flag,
  IndicatorResult,
  MissionContext,
  TrendAlert,
} from "./types";

/**
 * True during the first `days` mission days, or the first `days` days
 * after the astronaut moved between microgravity and partial gravity.
 * The second half is how the astronaut's environment reaches the engine:
 * the Environment screen records the gravity change, the caller turns it
 * into `mission.daysSinceGravityChange`.
 */
export function isWithinAdaptationWindow(
  mission: MissionContext,
  days: number,
): boolean {
  if (mission.missionDay <= days) return true;
  const sinceChange = mission.daysSinceGravityChange;
  return sinceChange !== undefined && sinceChange >= 1 && sinceChange <= days;
}

function isSoftenable(causedBySymptoms: SymptomId[] | undefined): boolean {
  if (!causedBySymptoms || causedBySymptoms.length === 0) return false;
  return causedBySymptoms.every((s) => ADAPTATION_SOFTEN_SYMPTOMS.includes(s));
}

interface Adjustable {
  indicators: IndicatorResult[];
  flags: Flag[];
  trends: TrendAlert[];
}

/** Step 5 of the pipeline (SPEC §4.1 / Appendix B `applyModifiers`).
 *
 * Mission-phase softening (SPEC §4.4): inside the adaptation window, a
 * result is dropped only if its status is exactly `yellow` AND it was
 * caused solely by the early-adaptation symptoms in
 * `config/environments.ts`. Red and critical are never touched — the
 * check below is on `status === "yellow"`, so nothing else can match.
 *
 * Environment: the window itself depends on the astronaut's environment
 * history (`daysSinceGravityChange`). Environment emphasis and tip packs
 * (SPEC §12) are presentation, not status changes, and live in
 * `config/environments.ts`.
 */
export function applyModifiers(
  adjusted: Adjustable,
  mission: MissionContext,
): Adjustable {
  if (!isWithinAdaptationWindow(mission, ADAPTATION_SOFTEN_DAYS)) {
    return adjusted;
  }

  const keepFlag = (flag: Flag) =>
    !(flag.status === "yellow" && isSoftenable(flag.causedBySymptoms));
  const keepIndicator = (indicator: IndicatorResult) =>
    !(
      indicator.status === "yellow" && isSoftenable(indicator.causedBySymptoms)
    );

  return {
    indicators: adjusted.indicators.filter(keepIndicator),
    flags: adjusted.flags.filter(keepFlag),
    trends: adjusted.trends,
  };
}
