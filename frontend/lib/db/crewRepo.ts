import type { Status } from "@/config/thresholds";
import {
  canViewCrew,
  canWriteNotes,
  type CrewFlag,
  type CrewOverviewRow,
} from "@/lib/crew/overview";
import { STATUS_RANK } from "@/lib/rules/status";
import { evaluateMissedCheckin } from "@/lib/rules/trends";
import type { EvaluationResult } from "@/lib/rules/types";
import {
  getDb,
  type Astronaut,
  type AuditEntry,
  type SurgeonNote,
} from "./schema";

/**
 * Crew overview data access (C15). Every function takes the VIEWER's id
 * and checks the viewer's role itself, so the rule "an astronaut can
 * never see another astronaut's data" (SPEC §8.3 screen 0) does not
 * depend on a screen remembering to hide something.
 *
 * Health data is read-only here: the only writes are surgeon notes and
 * audit entries, each with its own outbox row.
 */

export class CrewAccessError extends Error {
  constructor(message = "The crew overview is not available for your role.") {
    super(message);
    this.name = "CrewAccessError";
  }
}

export const MAX_NOTE_LENGTH = 1000;

async function requireCrewViewer(viewerId: string): Promise<Astronaut> {
  const viewer = await getDb().astronauts.get(viewerId);
  if (!viewer || !canViewCrew(viewer.role)) throw new CrewAccessError();
  return viewer;
}

async function requireTarget(astronautId: string): Promise<Astronaut> {
  const target = await getDb().astronauts.get(astronautId);
  if (!target) throw new Error("Astronaut not found.");
  return target;
}

function defined(values: (number | undefined)[]): number[] {
  return values.filter((value): value is number => value !== undefined);
}

/** One row per astronaut on this device, from real saved data only. An
 * astronaut with no check-in has no status, no flags and empty
 * sparklines. */
export async function getCrewOverview(
  viewerId: string,
  today: string,
): Promise<CrewOverviewRow[]> {
  await requireCrewViewer(viewerId);
  const db = getDb();
  const astronauts = await db.astronauts.toArray();
  const rows: CrewOverviewRow[] = [];

  for (const astronaut of astronauts) {
    const logs = (
      await db.logs.where("astronautId").equals(astronaut.id).toArray()
    ).sort((a, b) => a.date.localeCompare(b.date));
    const evaluations = (
      await db.evaluations.where("astronautId").equals(astronaut.id).toArray()
    ).sort(
      (a, b) =>
        b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt),
    );
    const latest = evaluations[0];
    const result = latest?.result as EvaluationResult | undefined;
    const lastLog = logs[logs.length - 1];
    const recent = logs.slice(-7);

    const flags: CrewFlag[] = [];
    for (const flag of result?.flags ?? []) {
      flags.push({ id: flag.id, status: flag.status, message: flag.message });
    }
    for (const trend of result?.trends ?? []) {
      // The stored missed-check-in trend is replaced by the live one below.
      if (trend.id === "TRD-MISS-01") continue;
      flags.push({
        id: trend.id,
        status: trend.status,
        message: trend.message,
      });
    }
    // SPEC §4.4: "no log for 4 days -> alert on surgeon view".
    const missed = evaluateMissedCheckin(lastLog?.date, today);
    if (missed) {
      flags.push({
        id: missed.id,
        status: missed.status,
        message: missed.message,
      });
    }
    flags.sort((a, b) => STATUS_RANK[b.status] - STATUS_RANK[a.status]);

    rows.push({
      id: astronaut.id,
      name: astronaut.name,
      crewCode: astronaut.crewCode,
      role: astronaut.role,
      lastCheckinDate: lastLog?.date,
      overallStatus: latest?.overallStatus as Status | undefined,
      statusDate: latest?.date,
      flags,
      sparklines: {
        heart_rate: defined(recent.map((log) => log.heart_rate)),
        sleep_hours: defined(recent.map((log) => log.sleep_hours)),
        mood: defined(recent.map((log) => log.mood)),
      },
    });
  }
  return rows;
}

/** Last check-in date per astronaut, for the Crew picker cards. A date
 * only — no status, no values — because that screen is shown before
 * anyone has entered a PIN. */
export async function getLastCheckinDates(): Promise<Record<string, string>> {
  const dates: Record<string, string> = {};
  await getDb().logs.each((log) => {
    if (!dates[log.astronautId] || log.date > dates[log.astronautId]) {
      dates[log.astronautId] = log.date;
    }
  });
  return dates;
}

/** Records that `viewerId` opened `astronautId`'s data. Looking at your
 * own data is not an audit event. */
export async function recordCrewView(
  viewerId: string,
  astronautId: string,
): Promise<AuditEntry | undefined> {
  const viewer = await requireCrewViewer(viewerId);
  const target = await requireTarget(astronautId);
  if (viewer.id === target.id) return undefined;
  const db = getDb();
  const entry: AuditEntry = {
    id: crypto.randomUUID(),
    viewerId: viewer.id,
    viewerName: viewer.name,
    viewerCrewCode: viewer.crewCode,
    viewerRole: viewer.role,
    astronautId: target.id,
    astronautName: target.name,
    astronautCrewCode: target.crewCode,
    action: "view",
    at: new Date().toISOString(),
  };
  await db.transaction("rw", db.auditLog, db.outbox, async () => {
    await db.auditLog.add(entry);
    await db.outbox.add({
      entity: "audit_entry",
      entityId: entry.id,
      op: "upsert",
      payload: entry,
      createdAt: entry.at,
    });
  });
  return entry;
}

/** The access log on this device, newest first. */
export async function listAuditLog(
  viewerId: string,
  limit = 50,
): Promise<AuditEntry[]> {
  await requireCrewViewer(viewerId);
  const entries = await getDb().auditLog.toArray();
  return entries.sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit);
}

/** Notes about one astronaut, newest first. Commander, surgeon and admin
 * can read them; only the surgeon can add one. */
export async function listSurgeonNotes(
  viewerId: string,
  astronautId: string,
): Promise<SurgeonNote[]> {
  await requireCrewViewer(viewerId);
  const notes = await getDb()
    .surgeonNotes.where("astronautId")
    .equals(astronautId)
    .toArray();
  return notes.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function addSurgeonNote(
  authorId: string,
  astronautId: string,
  text: string,
): Promise<SurgeonNote> {
  const author = await getDb().astronauts.get(authorId);
  if (!author || !canWriteNotes(author.role)) {
    throw new CrewAccessError("Only the flight surgeon can add notes.");
  }
  const target = await requireTarget(astronautId);
  const trimmed = text.trim();
  if (!trimmed) throw new Error("Write the note before saving.");
  if (trimmed.length > MAX_NOTE_LENGTH) {
    throw new Error(`Keep the note under ${MAX_NOTE_LENGTH} characters.`);
  }
  const now = new Date().toISOString();
  const note: SurgeonNote = {
    id: crypto.randomUUID(),
    astronautId: target.id,
    authorId: author.id,
    authorName: author.name,
    authorCrewCode: author.crewCode,
    text: trimmed,
    createdAt: now,
    updatedAt: now,
    version: 1,
  };
  const db = getDb();
  await db.transaction("rw", db.surgeonNotes, db.outbox, async () => {
    await db.surgeonNotes.add(note);
    await db.outbox.add({
      entity: "surgeon_note",
      entityId: note.id,
      op: "upsert",
      payload: note,
      createdAt: now,
    });
  });
  return note;
}
