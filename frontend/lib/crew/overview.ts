import type { Status } from "@/config/thresholds";
import type { AstronautRole } from "@/lib/db/schema";
import { STATUS_RANK } from "@/lib/rules/status";

/**
 * Crew overview (SPEC §8.3 screens 0 and 10): who may open it, and the
 * search / sort rules. Pure — no Dexie, no React.
 */

/** Roles that may see other astronauts' data (read-only). The astronaut
 * role never may. Mirrors `CREW_READ_ROLES` on the server. */
export const CREW_VIEW_ROLES: readonly AstronautRole[] = [
  "commander",
  "surgeon",
  "admin",
];

export function canViewCrew(role: AstronautRole | undefined): boolean {
  return role !== undefined && CREW_VIEW_ROLES.includes(role);
}

/** Only the flight surgeon writes notes (SPEC §13: "surgeon (read-only +
 * notes)"). */
export function canWriteNotes(role: AstronautRole | undefined): boolean {
  return role === "surgeon";
}

export interface CrewFlag {
  /** Rule id, e.g. "CMB-CO2-01" or "TRD-MISS-01". */
  id: string;
  status: Status;
  message: string;
}

export interface CrewSparklines {
  heart_rate: number[];
  sleep_hours: number[];
  mood: number[];
}

export interface CrewOverviewRow {
  id: string;
  name: string;
  crewCode: string;
  role: AstronautRole;
  /** Date of the most recent saved check-in, if any. */
  lastCheckinDate?: string;
  /** Overall status of the most recent stored result, if any. */
  overallStatus?: Status;
  /** Date of that result. */
  statusDate?: string;
  /** Non-green rule results from the latest result, plus the live
   * missed-check-in alert. Worst first. */
  flags: CrewFlag[];
  /** Real values from the last 7 logged days, oldest first. */
  sparklines: CrewSparklines;
}

export type CrewSort = "status" | "name" | "last_checkin";

export const CREW_SORT_LABELS: Record<CrewSort, string> = {
  status: "Status (worst first)",
  name: "Name",
  last_checkin: "Last check-in (oldest first)",
};

/** The status a row sorts by: its overall status, raised to the worst
 * active flag (so four missed days sorts as red even if the last result,
 * days ago, was green). Undefined = no data at all. */
export function effectiveStatus(row: CrewOverviewRow): Status | undefined {
  let status = row.overallStatus;
  for (const flag of row.flags) {
    if (
      status === undefined ||
      STATUS_RANK[flag.status] > STATUS_RANK[status]
    ) {
      status = flag.status;
    }
  }
  return status;
}

function matches(row: CrewOverviewRow, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return (
    row.name.toLowerCase().includes(needle) ||
    row.crewCode.toLowerCase().includes(needle)
  );
}

/** Search by name or crew ID, then sort. "Status" puts the worst first
 * and astronauts with no data last; ties fall back to crew ID so the
 * order is stable. */
export function filterAndSortCrew(
  rows: readonly CrewOverviewRow[],
  query: string,
  sort: CrewSort,
): CrewOverviewRow[] {
  const byCode = (a: CrewOverviewRow, b: CrewOverviewRow) =>
    a.crewCode.localeCompare(b.crewCode);
  const rank = (row: CrewOverviewRow) => {
    const status = effectiveStatus(row);
    return status === undefined ? -1 : STATUS_RANK[status];
  };
  const result = rows.filter((row) => matches(row, query));
  if (sort === "name") {
    result.sort((a, b) => a.name.localeCompare(b.name) || byCode(a, b));
  } else if (sort === "last_checkin") {
    // Oldest check-in first; never checked in comes before everyone.
    result.sort(
      (a, b) =>
        (a.lastCheckinDate ?? "").localeCompare(b.lastCheckinDate ?? "") ||
        byCode(a, b),
    );
  } else {
    result.sort((a, b) => rank(b) - rank(a) || byCode(a, b));
  }
  return result;
}
