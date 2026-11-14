import type { MissionContext } from "@/lib/rules/types";
import { getMissionDay } from "@/lib/time/missionDate";
import type { Astronaut } from "./schema";

/**
 * Builds the rule engine's `MissionContext` for one astronaut on one date
 * — the single place the astronaut's environment (and its gravity-change
 * date, C10) is turned into engine input. Pure: no I/O.
 *
 * `daysSinceGravityChange` is 1 on the day of the change. It is left
 * unset when there was no change, or when `date` is before the change (a
 * backdated check-in for an earlier day).
 */
export function buildMissionContext(
  astronaut: Pick<
    Astronaut,
    "environment" | "missionStart" | "gravityChangedOn"
  >,
  date: string,
): MissionContext {
  const mission: MissionContext = {
    environment: astronaut.environment,
    missionDay: getMissionDay(astronaut.missionStart, date),
  };
  if (astronaut.gravityChangedOn) {
    const days = getMissionDay(astronaut.gravityChangedOn, date);
    if (days >= 1) mission.daysSinceGravityChange = days;
  }
  return mission;
}
