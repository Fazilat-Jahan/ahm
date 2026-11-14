import {
  computeGameSummary,
  type GameActionRecord,
  type GameSummary,
} from "@/lib/gamification/engine";
import { getDb } from "./schema";

/**
 * Gamification data access (C11). Read-only: the Rewards numbers are
 * derived from the active astronaut's own saved check-ins and action
 * records each time, so there is no gamification row to write, sync or
 * get out of step (the `gamification` table stays empty — see
 * docs/DECISIONS.md). Symptoms and evaluation statuses are deliberately
 * never read here.
 */

/**
 * Turns the astronaut's saved `followups` rows into point-earning action
 * records. The same table holds two things (see `setActionCompleted`):
 * - an action from TODAY's result ticked as done on Home: the row's date
 *   equals the date of the evaluation it came from -> `completed`;
 * - an answer to "did you follow yesterday's advice?" in the check-in:
 *   the evaluation is from an earlier day -> `answered`, whatever the
 *   answer was (Yes, Partly and No earn the same, so there is no reason
 *   to answer anything but the truth).
 */
export async function getGameActionRecords(
  astronautId: string,
): Promise<GameActionRecord[]> {
  const db = getDb();
  const [followups, evaluations] = await Promise.all([
    db.followups.where("astronautId").equals(astronautId).toArray(),
    db.evaluations.where("astronautId").equals(astronautId).toArray(),
  ]);
  const evaluationDates = new Map(evaluations.map((e) => [e.id, e.date]));
  const records: GameActionRecord[] = [];
  for (const followup of followups) {
    const evaluationDate = evaluationDates.get(followup.evaluationId);
    if (evaluationDate === undefined) continue;
    if (evaluationDate === followup.date) {
      if (followup.response === "yes") {
        records.push({ date: followup.date, kind: "completed" });
      }
    } else {
      records.push({ date: followup.date, kind: "answered" });
    }
  }
  return records;
}

/** Points, streak, level, badges and weekly challenge for one astronaut,
 * from that astronaut's data only. */
export async function getGameSummary(
  astronautId: string,
  today: string,
): Promise<GameSummary> {
  const [logs, actions] = await Promise.all([
    getDb().logs.where("astronautId").equals(astronautId).toArray(),
    getGameActionRecords(astronautId),
  ]);
  return computeGameSummary({ logs, actions, today });
}
