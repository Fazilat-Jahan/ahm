import Dexie from "dexie";
import { isGravityChange } from "@/config/environments";
import { evaluate } from "@/lib/rules/engine";
import { evaluateTrends } from "@/lib/rules/trends";
import type {
  DailyLogInput,
  EvaluationResult,
  Environment,
  HistoryDay,
  MissionContext,
  SymptomInput,
  TrendAlert,
} from "@/lib/rules/types";
import type { MeasurementFormValues } from "./measurementSchema";
import {
  getDb,
  type AdviceFollowup,
  type Astronaut,
  type AstronautRole,
  type DailyLog,
  type FollowupResponse,
  type StoredEvaluation,
  type SymptomEntry,
} from "./schema";
import { hashPin, verifyPin } from "./pin";

export class DuplicateCrewCodeError extends Error {
  constructor(crewCode: string) {
    super(`Crew ID "${crewCode}" is already registered.`);
    this.name = "DuplicateCrewCodeError";
  }
}

async function enqueueOutbox(
  entity: string,
  entityId: string,
  op: "upsert" | "delete",
  payload: unknown,
): Promise<void> {
  await getDb().outbox.add({
    entity,
    entityId,
    op,
    payload,
    createdAt: new Date().toISOString(),
  });
}

export interface RegisterAstronautInput {
  name: string;
  crewCode: string;
  role: AstronautRole;
  environment: Environment;
  missionStart: string;
  missionEnd?: string;
  pin: string;
}

export async function registerAstronaut(
  input: RegisterAstronautInput,
): Promise<Astronaut> {
  const db = getDb();
  const { hash, salt } = await hashPin(input.pin);
  const now = new Date().toISOString();

  const astronaut: Astronaut = {
    id: crypto.randomUUID(),
    name: input.name,
    crewCode: input.crewCode,
    role: input.role,
    environment: input.environment,
    missionStart: input.missionStart,
    missionEnd: input.missionEnd,
    pinHash: hash,
    pinSalt: salt,
    isActive: true,
    createdAt: now,
    updatedAt: now,
    version: 1,
  };

  try {
    await db.transaction("rw", db.astronauts, db.outbox, async () => {
      await db.astronauts.add(astronaut);
      await enqueueOutbox("astronaut", astronaut.id, "upsert", astronaut);
    });
  } catch (error) {
    if (error instanceof Dexie.ConstraintError) {
      throw new DuplicateCrewCodeError(input.crewCode);
    }
    throw error;
  }

  return astronaut;
}

/**
 * Changes the astronaut's own environment (C10 Environment screen). If
 * the move is between microgravity and partial gravity, `today` is
 * recorded as the gravity-change date, which the rule engine uses for
 * SPEC §4.4's "first 3 days after gravity change". A move within the same
 * gravity class leaves any earlier gravity-change date as it was.
 */
export async function changeAstronautEnvironment(
  astronautId: string,
  environment: Environment,
  today: string,
): Promise<Astronaut | undefined> {
  const db = getDb();
  return db.transaction("rw", db.astronauts, db.outbox, async () => {
    const existing = await db.astronauts.get(astronautId);
    if (!existing) return undefined;
    if (existing.environment === environment) return existing;
    const next: Astronaut = {
      ...existing,
      environment,
      ...(isGravityChange(existing.environment, environment)
        ? { gravityChangedOn: today }
        : {}),
      updatedAt: new Date().toISOString(),
      version: existing.version + 1,
    };
    await db.astronauts.put(next);
    await enqueueOutbox("astronaut", next.id, "upsert", next);
    return next;
  });
}

export async function listAstronauts(): Promise<Astronaut[]> {
  return getDb().astronauts.toArray();
}

export async function getAstronaut(id: string): Promise<Astronaut | undefined> {
  return getDb().astronauts.get(id);
}

export async function verifyAstronautPin(
  id: string,
  pin: string,
): Promise<boolean> {
  const astronaut = await getAstronaut(id);
  if (!astronaut) return false;
  return verifyPin(pin, { hash: astronaut.pinHash, salt: astronaut.pinSalt });
}

export async function getSetting<T>(key: string): Promise<T | undefined> {
  const row = await getDb().settings.get(key);
  return row?.value as T | undefined;
}

export async function setSetting(key: string, value: unknown): Promise<void> {
  await getDb().settings.put({ key, value });
}

export async function getLogForDate(
  astronautId: string,
  date: string,
): Promise<DailyLog | undefined> {
  return getDb()
    .logs.where("[astronautId+date]")
    .equals([astronautId, date])
    .first();
}

export interface SaveLogInput {
  astronautId: string;
  date: string;
  isBackdated: boolean;
  measurements: MeasurementFormValues;
  /** Original (pre-rest) readings for any field that triggered the
   * borderline "rest and measure again" prompt this session — see
   * SPEC §17 item 4 and the `DailyLog.firstReadings` doc comment. */
  firstReadings?: Partial<Record<string, number>>;
  mood?: number;
  stress?: number;
  selfHarmThoughts?: boolean;
}

/** Builds the upserted log row (pure, no I/O besides the one read it needs
 * to find an existing row for this date) — does NOT open a transaction, so
 * callers can run it inside their own (SPEC §10: the whole check-in saves
 * in one transaction, not log-then-separately-everything-else). One log
 * per astronaut per date (SPEC §6.1 `[astronautId+date]` compound index):
 * updates in place instead of creating a duplicate. A field left out this
 * time is cleared, not silently kept from a prior save of the same date —
 * this is "Save", not a partial merge. */
async function buildUpsertedLog(input: SaveLogInput): Promise<DailyLog> {
  const existing = await getLogForDate(input.astronautId, input.date);
  const now = new Date().toISOString();

  return {
    id: existing?.id ?? crypto.randomUUID(),
    astronautId: input.astronautId,
    date: input.date,
    isBackdated: input.isBackdated,
    ...input.measurements,
    mood: input.mood,
    stress: input.stress,
    selfHarmThoughts: input.selfHarmThoughts,
    ...(input.firstReadings ? { firstReadings: input.firstReadings } : {}),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    version: (existing?.version ?? 0) + 1,
  };
}

/** Standalone log save (used by nothing in the UI anymore as of C4 — the
 * check-in wizard uses `saveCheckin` below, which saves the log as part of
 * one bigger transaction — but kept as a tested primitive in its own
 * right; see docs/DECISIONS.md.) */
export async function saveLog(input: SaveLogInput): Promise<DailyLog> {
  const db = getDb();
  return db.transaction("rw", db.logs, db.outbox, async () => {
    const log = await buildUpsertedLog(input);
    await db.logs.put(log);
    await enqueueOutbox("daily_log", log.id, "upsert", log);
    return log;
  });
}

function dailyLogToEngineInput(log: DailyLog): DailyLogInput {
  return {
    date: log.date,
    heart_rate: log.heart_rate,
    bp_systolic: log.bp_systolic,
    bp_diastolic: log.bp_diastolic,
    glucose_mgdl: log.glucose_mgdl,
    temperature_c: log.temperature_c,
    spo2: log.spo2,
    sleep_hours: log.sleep_hours,
    sleep_quality: log.sleep_quality,
    mood: log.mood,
    stress: log.stress,
    team_relations: log.team_relations,
    weight_kg: log.weight_kg,
    eva_today: log.eva_today,
    exercise_resistance_min: log.exercise_resistance_min,
    exercise_cardio_min: log.exercise_cardio_min,
    water_ml: log.water_ml,
    radiation_msv: log.radiation_msv,
    selfHarmThoughts: log.selfHarmThoughts,
  };
}

async function getPriorLogsSorted(
  astronautId: string,
  beforeDate: string,
): Promise<DailyLog[]> {
  const logs = await getDb()
    .logs.where("astronautId")
    .equals(astronautId)
    .and((log) => log.date < beforeDate)
    .toArray();
  return logs.sort((a, b) => b.date.localeCompare(a.date)); // most-recent-first
}

/** Builds the `history` array the rule engine needs (most-recent-first,
 * history[0] = the day before `beforeDate`) — SPEC §4.1 trend window needs
 * up to 16 days back (TRD-HR-01's 14-day baseline + the 2 most recent). */
export async function getHistoryForEngine(
  astronautId: string,
  beforeDate: string,
  maxDays = 16,
): Promise<HistoryDay[]> {
  const db = getDb();
  const recentLogs = (await getPriorLogsSorted(astronautId, beforeDate)).slice(
    0,
    maxDays,
  );

  const history: HistoryDay[] = [];
  for (const log of recentLogs) {
    const symptomRows = await db.symptoms
      .where("logId")
      .equals(log.id)
      .toArray();
    history.push({
      date: log.date,
      log: dailyLogToEngineInput(log),
      symptoms: symptomRows.map((s) => ({
        symptom: s.symptom,
        severity: s.severity,
      })) as SymptomInput[],
    });
  }
  return history;
}

export interface PriorCheckin {
  log: DailyLog;
  evaluation: StoredEvaluation | undefined;
}

/** For the "yesterday recap" step (SPEC §8.3 screen 2 step 1): the most
 * recent check-in strictly before `beforeDate`, whatever day that actually
 * was (the astronaut may have skipped days) — or undefined if there is
 * none, in which case the step must show nothing fake. */
export async function getPriorCheckin(
  astronautId: string,
  beforeDate: string,
): Promise<PriorCheckin | undefined> {
  const [log] = await getPriorLogsSorted(astronautId, beforeDate);
  if (!log) return undefined;
  const evaluation = await getDb()
    .evaluations.where("logId")
    .equals(log.id)
    .first();
  return { log, evaluation };
}

export interface FollowupAnswer {
  actionId: string;
  evaluationId: string;
  response: FollowupResponse;
}

export interface SaveCheckinInput {
  astronautId: string;
  date: string;
  isBackdated: boolean;
  measurements: MeasurementFormValues;
  firstReadings?: Partial<Record<string, number>>;
  mood?: number;
  stress?: number;
  selfHarmThoughts: boolean;
  symptoms: SymptomInput[];
  followups: FollowupAnswer[];
  mission: MissionContext;
}

export interface SaveCheckinResult {
  log: DailyLog;
  evaluation: EvaluationResult;
  evaluationId: string;
}

/** The full daily check-in save (SPEC §10): log + symptoms + followups +
 * the rule engine's evaluation + every outbox row, all in ONE transaction —
 * either all of it lands or none of it does. Gamification is explicitly
 * C11's job (see docs/DECISIONS.md), so it's not part of this save. */
export async function saveCheckin(
  input: SaveCheckinInput,
): Promise<SaveCheckinResult> {
  const db = getDb();
  const now = new Date().toISOString();

  return db.transaction(
    "rw",
    [db.logs, db.symptoms, db.followups, db.evaluations, db.outbox],
    async () => {
      // 1. Log (full replace of measurement/mood/stress/safety fields).
      const log = await buildUpsertedLog({
        astronautId: input.astronautId,
        date: input.date,
        isBackdated: input.isBackdated,
        measurements: input.measurements,
        firstReadings: input.firstReadings,
        mood: input.mood,
        stress: input.stress,
        selfHarmThoughts: input.selfHarmThoughts,
      });
      await db.logs.put(log);
      await enqueueOutbox("daily_log", log.id, "upsert", log);

      // 2. Symptoms: replace this log's entries entirely (same full-replace
      // semantics as the log itself — re-saving the same date with fewer
      // symptoms selected means fewer symptoms stored, not a stale leftover).
      const oldSymptoms = await db.symptoms
        .where("logId")
        .equals(log.id)
        .toArray();
      for (const old of oldSymptoms) {
        await db.symptoms.delete(old.id);
        await enqueueOutbox("symptom_entry", old.id, "delete", { id: old.id });
      }
      for (const s of input.symptoms) {
        const row: SymptomEntry = {
          id: crypto.randomUUID(),
          logId: log.id,
          astronautId: input.astronautId,
          date: input.date,
          symptom: s.symptom,
          severity: s.severity,
          createdAt: now,
          updatedAt: now,
          version: 1,
        };
        await db.symptoms.add(row);
        await enqueueOutbox("symptom_entry", row.id, "upsert", row);
      }

      // 3. Advice follow-ups (yesterday recap answers), if any.
      for (const f of input.followups) {
        const row: AdviceFollowup = {
          id: crypto.randomUUID(),
          astronautId: input.astronautId,
          date: input.date,
          actionId: f.actionId,
          evaluationId: f.evaluationId,
          response: f.response,
          createdAt: now,
          updatedAt: now,
          version: 1,
        };
        await db.followups.add(row);
        await enqueueOutbox("advice_followup", row.id, "upsert", row);
      }

      // 4. Rule engine (pure; see lib/rules/engine.ts — no Dexie/UI inside it).
      const history = await getHistoryForEngine(input.astronautId, input.date);
      const evaluation = evaluate({
        log: dailyLogToEngineInput(log),
        symptoms: input.symptoms,
        history,
        mission: input.mission,
      });

      // 5. Store the evaluation with rulesVersion (SPEC §17 item 3).
      const evaluationId = crypto.randomUUID();
      const storedEvaluation: StoredEvaluation = {
        id: evaluationId,
        logId: log.id,
        astronautId: input.astronautId,
        date: input.date,
        overallStatus: evaluation.overall,
        rulesVersion: evaluation.rulesVersion,
        result: evaluation,
        createdAt: now,
      };
      await db.evaluations.put(storedEvaluation);
      await enqueueOutbox(
        "evaluation",
        evaluationId,
        "upsert",
        storedEvaluation,
      );

      return { log, evaluation, evaluationId };
    },
  );
}

/** Latest log for the astronaut, any date — used by the Home dashboard,
 * which shows the latest *real* values even if today's check-in hasn't
 * happened yet (SPEC's own "coloured by the latest real evaluation"
 * framing for the 3D body applies just as well here). */
export async function getLatestLog(
  astronautId: string,
): Promise<DailyLog | undefined> {
  const logs = await getDb()
    .logs.where("astronautId")
    .equals(astronautId)
    .toArray();
  if (logs.length === 0) return undefined;
  return logs.sort((a, b) => b.date.localeCompare(a.date))[0];
}

export async function getLatestEvaluation(
  astronautId: string,
): Promise<StoredEvaluation | undefined> {
  const evaluations = await getDb()
    .evaluations.where("astronautId")
    .equals(astronautId)
    .toArray();
  if (evaluations.length === 0) return undefined;
  return evaluations.sort(
    (a, b) =>
      b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt),
  )[0];
}

/** Most recent `days` logs, oldest-first (left-to-right chronological),
 * for sparklines on the Home dashboard's indicator cards. */
export async function getRecentLogs(
  astronautId: string,
  days = 7,
): Promise<DailyLog[]> {
  const logs = await getDb()
    .logs.where("astronautId")
    .equals(astronautId)
    .toArray();
  return logs
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, days)
    .reverse();
}

/** Symptoms from the astronaut's most recent `days` real logs (SPEC §8.3
 * screen 3 `BodyPartPanel`: "related symptoms reported recently"), newest
 * first. Reuses `getRecentLogs` rather than a calendar-day window, so a
 * backdated or sparse history still returns real reported symptoms. */
export async function getRecentSymptoms(
  astronautId: string,
  days = 7,
): Promise<SymptomEntry[]> {
  const logs = await getRecentLogs(astronautId, days);
  if (logs.length === 0) return [];
  const symptoms = await getDb()
    .symptoms.where("logId")
    .anyOf(logs.map((l) => l.id))
    .toArray();
  return symptoms.sort((a, b) => b.date.localeCompare(a.date));
}

export async function getCompletedActionIds(
  astronautId: string,
  date: string,
): Promise<Set<string>> {
  const rows = await getDb()
    .followups.where("astronautId")
    .equals(astronautId)
    .and((f) => f.date === date)
    .toArray();
  return new Set(
    rows.filter((r) => r.response === "yes").map((r) => r.actionId),
  );
}

/** Toggling a "today's action" checkbox on the Home dashboard reuses the
 * same `followups` mechanism C4 built for the yesterday-recap step
 * (response "yes" = done), rather than inventing a second completion
 * table — see docs/DECISIONS.md. */
export async function setActionCompleted(
  astronautId: string,
  date: string,
  actionId: string,
  evaluationId: string,
  completed: boolean,
): Promise<void> {
  const db = getDb();
  await db.transaction("rw", db.followups, db.outbox, async () => {
    const existing = await db.followups
      .where("astronautId")
      .equals(astronautId)
      .and((f) => f.date === date && f.actionId === actionId)
      .first();
    const now = new Date().toISOString();

    if (completed) {
      const row: AdviceFollowup = {
        id: existing?.id ?? crypto.randomUUID(),
        astronautId,
        date,
        actionId,
        evaluationId,
        response: "yes",
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
        version: (existing?.version ?? 0) + 1,
      };
      await db.followups.put(row);
      await enqueueOutbox("advice_followup", row.id, "upsert", row);
    } else if (existing) {
      await db.followups.delete(existing.id);
      await enqueueOutbox("advice_followup", existing.id, "delete", {
        id: existing.id,
      });
    }
  });
}

export interface LogsRangeResult {
  /** Ascending by date. */
  logs: DailyLog[];
  /** Dates (within the range) that have at least one symptom entry — for
   * the Trends charts' "symptom-day markers" (SPEC §8.3 screen 4). */
  symptomDates: Set<string>;
}

/** Logs for a date range, oldest-first, plus which of those dates had any
 * symptom reported. Used by the Trends charts' range tabs (7/14/30/
 * mission) — the range itself is computed by the caller (mission-day-1
 * for "mission", daysAgo(N-1) for the fixed windows). */
export async function getLogsInRange(
  astronautId: string,
  fromDate: string,
  toDate: string,
): Promise<LogsRangeResult> {
  const db = getDb();
  const logs = (
    await db.logs.where("astronautId").equals(astronautId).toArray()
  )
    .filter((l) => l.date >= fromDate && l.date <= toDate)
    .sort((a, b) => a.date.localeCompare(b.date));

  const symptomDates = new Set<string>();
  if (logs.length > 0) {
    const symptoms = await db.symptoms
      .where("logId")
      .anyOf(logs.map((l) => l.id))
      .toArray();
    for (const s of symptoms) symptomDates.add(s.date);
  }

  return { logs, symptomDates };
}

/** Trend alerts for the astronaut's latest real log (SPEC §8.3 screen 4:
 * "Trend alerts list under the charts") — reuses the exact same pure
 * `evaluateTrends` the check-in save path runs, so the Trends page can
 * never show a different verdict than what was actually saved. */
export async function getLatestTrends(
  astronautId: string,
  mission: MissionContext,
): Promise<TrendAlert[]> {
  const latestLog = await getLatestLog(astronautId);
  if (!latestLog) return [];
  const history = await getHistoryForEngine(astronautId, latestLog.date);
  return evaluateTrends({
    log: dailyLogToEngineInput(latestLog),
    history,
    mission,
  });
}
