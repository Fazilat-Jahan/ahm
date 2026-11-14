import { MEASUREMENTS } from "@/config/measurements";
import { getSymptomLabel, isSymptomId } from "@/config/symptoms";
import {
  getDb,
  type AdviceFollowup,
  type Astronaut,
  type DailyLog,
  type Reminder,
  type StoredEvaluation,
  type SymptomEntry,
  type SyncConflictRecord,
} from "@/lib/db/schema";

/**
 * Export and import (SPEC §17 item 7: "JSON + CSV export of all data,
 * offline, for handing data to a surgeon if the link fails").
 *
 * Everything here works with no network. An export contains only real
 * saved records. PIN hashes are never exported.
 */

export const EXPORT_FORMAT = "ahm-export";
export const EXPORT_VERSION = 1;

export type ExportedAstronaut = Omit<Astronaut, "pinHash" | "pinSalt">;

export interface ExportData {
  format: typeof EXPORT_FORMAT;
  version: number;
  exportedAt: string;
  astronauts: ExportedAstronaut[];
  logs: DailyLog[];
  symptoms: SymptomEntry[];
  evaluations: StoredEvaluation[];
  followups: AdviceFollowup[];
  reminders: Reminder[];
  /** Copies kept from sync conflicts (see the Sync screen). */
  conflicts: SyncConflictRecord[];
}

/** `astronautIds` = whose data to include. An astronaut exports their
 * own; a commander/surgeon/admin may export everyone on the device. */
export async function buildExport(
  astronautIds: readonly string[],
  now: Date = new Date(),
): Promise<ExportData> {
  const db = getDb();
  const ids = new Set(astronautIds);
  const mine = <T extends { astronautId?: string }>(rows: T[]) =>
    rows.filter(
      (row) => row.astronautId !== undefined && ids.has(row.astronautId),
    );

  const [
    astronauts,
    logs,
    symptoms,
    evaluations,
    followups,
    reminders,
    conflicts,
  ] = await Promise.all([
    db.astronauts.toArray(),
    db.logs.toArray(),
    db.symptoms.toArray(),
    db.evaluations.toArray(),
    db.followups.toArray(),
    db.reminders.toArray(),
    db.conflicts.toArray(),
  ]);

  return {
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    exportedAt: now.toISOString(),
    astronauts: astronauts
      .filter((a) => ids.has(a.id))
      .map(({ pinHash: _hash, pinSalt: _salt, ...rest }) => rest),
    logs: mine(logs).sort((a, b) => a.date.localeCompare(b.date)),
    symptoms: mine(symptoms),
    evaluations: mine(evaluations),
    followups: mine(followups),
    reminders: mine(reminders),
    conflicts: mine(conflicts),
  };
}

const LOG_COLUMNS = [
  "heart_rate",
  "bp_systolic",
  "bp_diastolic",
  "glucose_mgdl",
  "temperature_c",
  "spo2",
  "sleep_hours",
  "sleep_quality",
  "exercise_resistance_min",
  "exercise_cardio_min",
  "water_ml",
  "weight_kg",
  "radiation_msv",
  "mood",
  "stress",
  "team_relations",
  "eva_today",
] as const;

/** One CSV cell. Quotes when needed, and neutralises a leading = + - @
 * in free text so a spreadsheet does not run it as a formula. */
export function csvCell(value: unknown): string {
  if (value === undefined || value === null) return "";
  let text = typeof value === "string" ? value : String(value);
  if (typeof value === "string" && /^[=+\-@\t\r]/.test(text)) {
    text = `'${text}`;
  }
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** One row per daily log, with its symptoms and stored result. */
export function toCsv(data: ExportData): string {
  const astronauts = new Map(data.astronauts.map((a) => [a.id, a]));
  const header = [
    "crew_id",
    "name",
    "date",
    "late_entry",
    ...LOG_COLUMNS,
    "symptoms",
    "overall_status",
    "rules_version",
  ];
  const lines = [header.join(",")];
  for (const log of data.logs) {
    const astronaut = astronauts.get(log.astronautId);
    const symptoms = data.symptoms
      .filter((s) => s.logId === log.id)
      .map(
        (s) =>
          `${isSymptomId(s.symptom) ? getSymptomLabel(s.symptom) : s.symptom} (${s.severity})`,
      )
      .join("; ");
    const evaluation = data.evaluations
      .filter((e) => e.logId === log.id)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    lines.push(
      [
        astronaut?.crewCode,
        astronaut?.name,
        log.date,
        log.isBackdated ? "yes" : "no",
        ...LOG_COLUMNS.map((column) => log[column]),
        symptoms,
        evaluation?.overallStatus,
        evaluation?.rulesVersion,
      ]
        .map(csvCell)
        .join(","),
    );
  }
  return `${lines.join("\r\n")}\r\n`;
}

/* ---- import ------------------------------------------------------------- */

interface Bounds {
  min: number;
  max?: number;
}

/** The same sanity bounds as the check-in form, from the same config. */
function measurementBounds(): Map<string, Bounds> {
  const bounds = new Map<string, Bounds>();
  for (const measurement of MEASUREMENTS) {
    if (measurement.kind === "number" || measurement.kind === "slider") {
      bounds.set(measurement.id, {
        min: measurement.min,
        max: measurement.max,
      });
    } else if (measurement.kind === "two-number") {
      for (const field of measurement.fields) {
        bounds.set(field.id, { min: field.min, max: field.max });
      }
    }
  }
  bounds.set("mood", { min: 1, max: 5 });
  bounds.set("stress", { min: 1, max: 5 });
  return bounds;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Null if the log is acceptable, else why not. */
export function validateImportedLog(log: unknown): string | null {
  if (!isRecord(log)) return "not a record";
  if (typeof log.id !== "string" || typeof log.astronautId !== "string") {
    return "missing id";
  }
  if (typeof log.date !== "string" || !DATE_PATTERN.test(log.date)) {
    return "bad date";
  }
  for (const [field, { min, max }] of measurementBounds()) {
    const value = log[field];
    if (value === undefined || value === null) continue;
    if (typeof value !== "number" || Number.isNaN(value)) {
      return `${field} is not a number`;
    }
    if (value < min || (max !== undefined && value > max)) {
      return `${field} ${value} is outside ${min} to ${max ?? "any"}`;
    }
  }
  return null;
}

export class ImportError extends Error {}

export function parseExport(text: string): ExportData {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new ImportError("This file is not valid JSON.");
  }
  if (!isRecord(parsed) || parsed.format !== EXPORT_FORMAT) {
    throw new ImportError(
      "This is not an Astronaut Health Monitor export file.",
    );
  }
  if (parsed.version !== EXPORT_VERSION) {
    throw new ImportError(
      "This export was made by a different version of the app.",
    );
  }
  const list = (key: string): unknown[] => {
    const value = parsed[key];
    return Array.isArray(value) ? value : [];
  };
  return {
    ...(parsed as unknown as ExportData),
    astronauts: list("astronauts") as ExportedAstronaut[],
    logs: list("logs") as DailyLog[],
    symptoms: list("symptoms") as SymptomEntry[],
    evaluations: list("evaluations") as StoredEvaluation[],
    followups: list("followups") as AdviceFollowup[],
    reminders: list("reminders") as Reminder[],
    conflicts: [],
  };
}

export interface ImportResult {
  imported: number;
  /** Already on this device (same or newer), so left as it is. */
  unchanged: number;
  /** Not imported, with the reason (bad values, other astronaut, ...). */
  skipped: { what: string; reason: string }[];
}

/**
 * Imports an export file into this device.
 *
 * - Only records of `allowedAstronautIds` are taken, and only for
 *   astronauts already registered on this device (an export carries no
 *   PIN, so it cannot create an astronaut).
 * - A record already here with the same or a higher version is left
 *   alone; nothing local is overwritten by something older.
 * - A log for a date that already has a different log here is skipped.
 * - Every imported record also gets an outbox row, so it syncs onward.
 */
export async function importExport(
  data: ExportData,
  allowedAstronautIds: readonly string[],
): Promise<ImportResult> {
  const db = getDb();
  const result: ImportResult = { imported: 0, unchanged: 0, skipped: [] };
  const allowed = new Set(allowedAstronautIds);

  await db.transaction(
    "rw",
    [
      db.astronauts,
      db.logs,
      db.symptoms,
      db.evaluations,
      db.followups,
      db.reminders,
      db.outbox,
    ],
    async () => {
      const known = new Set((await db.astronauts.toArray()).map((a) => a.id));
      const usable = (astronautId: unknown, what: string): boolean => {
        if (typeof astronautId !== "string" || !allowed.has(astronautId)) {
          result.skipped.push({ what, reason: "belongs to another astronaut" });
          return false;
        }
        if (!known.has(astronautId)) {
          result.skipped.push({
            what,
            reason: "that astronaut is not registered on this device",
          });
          return false;
        }
        return true;
      };
      const now = new Date().toISOString();
      const enqueue = (entity: string, row: { id: string }) =>
        db.outbox.add({
          entity,
          entityId: row.id,
          op: "upsert",
          payload: row,
          createdAt: now,
        });
      const isNewer = (
        incoming: { version?: number },
        local: { version?: number } | undefined,
      ) =>
        local === undefined || (incoming.version ?? 1) > (local.version ?? 1);

      const importedLogIds = new Set<string>();
      for (const log of data.logs) {
        const what = `log ${isRecord(log) ? String(log.date) : ""}`;
        const problem = validateImportedLog(log);
        if (problem) {
          result.skipped.push({ what, reason: problem });
          continue;
        }
        if (!usable(log.astronautId, what)) continue;
        const local = await db.logs.get(log.id);
        if (!local) {
          const sameDate = await db.logs
            .where("[astronautId+date]")
            .equals([log.astronautId, log.date])
            .first();
          if (sameDate) {
            result.skipped.push({
              what,
              reason: "a different check-in for that date is already here",
            });
            continue;
          }
        }
        if (!isNewer(log, local)) {
          result.unchanged += 1;
          importedLogIds.add(log.id);
          continue;
        }
        await db.logs.put(log);
        await enqueue("daily_log", log);
        importedLogIds.add(log.id);
        result.imported += 1;
      }

      for (const symptom of data.symptoms) {
        const what = "symptom";
        if (!isRecord(symptom) || typeof symptom.id !== "string") continue;
        if (!importedLogIds.has(symptom.logId)) continue; // its log was skipped
        if (!usable(symptom.astronautId, what)) continue;
        if (
          !isSymptomId(symptom.symptom) ||
          ![1, 2, 3].includes(symptom.severity)
        ) {
          result.skipped.push({ what, reason: "unknown symptom or severity" });
          continue;
        }
        if (!isNewer(symptom, await db.symptoms.get(symptom.id))) {
          result.unchanged += 1;
          continue;
        }
        await db.symptoms.put(symptom);
        await enqueue("symptom_entry", symptom);
        result.imported += 1;
      }

      for (const evaluation of data.evaluations) {
        if (!isRecord(evaluation) || typeof evaluation.id !== "string")
          continue;
        if (!importedLogIds.has(evaluation.logId)) continue;
        if (!usable(evaluation.astronautId, "result")) continue;
        if (await db.evaluations.get(evaluation.id)) {
          result.unchanged += 1;
          continue;
        }
        await db.evaluations.put(evaluation);
        await enqueue("evaluation", evaluation);
        result.imported += 1;
      }

      for (const followup of data.followups) {
        if (!isRecord(followup) || typeof followup.id !== "string") continue;
        if (!usable(followup.astronautId, "follow-up")) continue;
        if (!isNewer(followup, await db.followups.get(followup.id))) {
          result.unchanged += 1;
          continue;
        }
        await db.followups.put(followup);
        await enqueue("advice_followup", followup);
        result.imported += 1;
      }

      for (const reminder of data.reminders) {
        if (!isRecord(reminder) || typeof reminder.id !== "string") continue;
        if (!usable(reminder.astronautId, "reminder")) continue;
        if (!isNewer(reminder, await db.reminders.get(reminder.id))) {
          result.unchanged += 1;
          continue;
        }
        await db.reminders.put(reminder);
        await enqueue("reminder", reminder);
        result.imported += 1;
      }
    },
  );
  return result;
}
