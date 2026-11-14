import Dexie, { type Table } from "dexie";
import type { Environment } from "@/lib/rules/types";

export const ASTRONAUT_ROLES = [
  "astronaut",
  "commander",
  "surgeon",
  "admin",
] as const;

export type AstronautRole = (typeof ASTRONAUT_ROLES)[number];

export interface Astronaut {
  id: string;
  name: string;
  crewCode: string;
  role: AstronautRole;
  environment: Environment;
  /** Date (YYYY-MM-DD) of the last environment change that moved this
   * astronaut between microgravity and partial gravity (C10). Unset if
   * there has been none. Feeds `MissionContext.daysSinceGravityChange`. */
  gravityChangedOn?: string;
  missionStart: string; // YYYY-MM-DD
  missionEnd?: string;
  pinHash: string;
  pinSalt: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  version: number;
}

export interface OutboxItem {
  seq?: number;
  entity: string;
  entityId: string;
  op: "upsert" | "delete";
  payload: unknown;
  createdAt: string;
}

export interface Setting {
  key: string;
  value: unknown;
}

/**
 * The remaining tables are declared with their SPEC §6.1 indexes now (so the
 * Dexie schema matches the spec in full), but their row shapes are only
 * fleshed out in the chunk that actually writes to them. Until then they're
 * minimal, index-only placeholders — see docs/DECISIONS.md.
 */

/** Fleshed out in C3/C4 for the fields they actually write. */
export interface DailyLog {
  id: string;
  astronautId: string;
  date: string; // YYYY-MM-DD, mission-local
  isBackdated: boolean;
  heart_rate?: number;
  bp_systolic?: number;
  bp_diastolic?: number;
  glucose_mgdl?: number;
  temperature_c?: number;
  spo2?: number;
  sleep_hours?: number;
  sleep_quality?: number;
  exercise_resistance_min?: number;
  exercise_cardio_min?: number;
  water_ml?: number;
  weight_kg?: number;
  radiation_msv?: number;
  team_relations?: number;
  eva_today?: boolean;
  mood?: number;
  stress?: number;
  /** SPEC §4.4 CMB-SAFETY-01: the explicit safety question from the
   * mood/stress step. Never hidden behind a setting. */
  selfHarmThoughts?: boolean;
  /** SPEC §17 item 4: for any field where a borderline (yellow/red)
   * reading triggered a "rest and measure again" re-check, the ORIGINAL
   * reading is kept here (keyed by field id); the field above holds the
   * later, post-rest reading used everywhere else (rule engine, trends). */
  firstReadings?: Partial<Record<string, number>>;
  createdAt: string;
  updatedAt: string;
  version: number;
  [key: string]: unknown;
}

export const SEVERITIES = [1, 2, 3] as const;

export interface SymptomEntry {
  id: string;
  logId: string;
  astronautId: string;
  date: string;
  symptom: string;
  severity: 1 | 2 | 3;
  createdAt: string;
  updatedAt: string;
  version: number;
}

/** Full `EvaluationResult` (lib/rules/types.ts) is kept verbatim in
 * `result` so old results stay explainable after thresholds change later
 * (SPEC §17 item 3) — `overallStatus`/`rulesVersion` are pulled out as
 * their own indexed-adjacent fields purely for quick display/filtering. */
export interface StoredEvaluation {
  id: string;
  logId: string;
  astronautId: string;
  date: string;
  overallStatus: string;
  rulesVersion: string;
  result: unknown;
  createdAt: string;
}

export type FollowupResponse = "yes" | "partly" | "no";

export interface AdviceFollowup {
  id: string;
  astronautId: string;
  date: string; // the date this follow-up was ANSWERED (today), not the
  // date of the action it refers to
  actionId: string;
  evaluationId: string; // the prior evaluation this action came from
  response: FollowupResponse;
  createdAt: string;
  updatedAt: string;
  version: number;
}

/** SPEC §9 default set rows, plus `custom` for reminders the astronaut
 * adds by hand. `checkin` is the only kind with extra behaviour (it is
 * skipped once today's check-in is saved, and drives the missed-check-in
 * nudge). */
export const REMINDER_KINDS = [
  "checkin",
  "glucose",
  "midday",
  "evening",
  "weekly",
  "custom",
] as const;

export type ReminderKind = (typeof REMINDER_KINDS)[number];

/** Fleshed out in C9. */
export interface Reminder {
  id: string;
  astronautId: string;
  kind: ReminderKind;
  label: string;
  /** Device-local time of day, "HH:MM" (24 h). */
  time: string;
  /** Unset = every day. 0 to 6 = once a week on that weekday (0 = Sunday,
   * matching `Date.getDay()`). */
  weekday?: number;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
  version: number;
}

/** Device-local record of the last occurrence of a reminder that fired
 * here (kept in the `settings` table, never synced): stops the same
 * occurrence firing twice (30 s check, second tab, reload) and remembers
 * whether its in-app banner was dismissed. */
export interface ReminderFireState {
  /** ISO timestamp of the occurrence that fired. */
  dueAt: string;
  dismissed: boolean;
}

export interface GameState {
  astronautId: string;
  [key: string]: unknown;
}

export interface SyncMeta {
  key: string;
  lastPulledAt?: string;
  deviceId?: string;
}

/** The losing side of a sync conflict, kept verbatim on this device
 * (SPEC §7.4: "client keeps both ... never lose a health record"). Rows
 * here are never deleted by sync; they are listed on the Sync screen and
 * included in exports. */
export interface SyncConflictRecord {
  id?: number;
  entity: string;
  entityId: string;
  astronautId?: string;
  /** `version`: the same record was changed on two devices.
   * `same_date`: another log for that astronaut and date already existed.
   * `parent_missing`: the record belonged to a log that lost a conflict. */
  kind: "version" | "same_date" | "parent_missing";
  /** The copy stored here: this device's (`local`). */
  loser: "local";
  data: unknown;
  createdAt: string;
}

export class AHMDB extends Dexie {
  astronauts!: Table<Astronaut, string>;
  logs!: Table<DailyLog, string>;
  symptoms!: Table<SymptomEntry, string>;
  evaluations!: Table<StoredEvaluation, string>;
  followups!: Table<AdviceFollowup, string>;
  reminders!: Table<Reminder, string>;
  gamification!: Table<GameState, string>;
  settings!: Table<Setting, string>;
  outbox!: Table<OutboxItem, number>;
  syncMeta!: Table<SyncMeta, string>;
  conflicts!: Table<SyncConflictRecord, number>;

  constructor() {
    super("ahm");
    this.version(1).stores({
      astronauts: "id, &crewCode, name, role",
      logs: "id, astronautId, date, [astronautId+date], updatedAt",
      symptoms: "id, logId, astronautId, date, symptom",
      evaluations: "id, logId, astronautId, date",
      followups: "id, astronautId, date, actionId",
      reminders: "id, astronautId, time, enabled",
      gamification: "astronautId",
      settings: "key",
      outbox: "++seq, entity, entityId, createdAt",
      syncMeta: "key",
    });
    // v2 (C14): the local conflict archive. Adding a store needs no data
    // migration; existing stores and rows are untouched.
    this.version(2).stores({
      conflicts: "++id, entity, entityId, astronautId, createdAt",
    });
  }
}

let dbInstance: AHMDB | null = null;

/** Lazily creates the singleton Dexie instance. Lazy because importing this
 * module must be safe on the server (no `indexedDB` global) — Dexie only
 * opens a connection when something actually calls a table method. */
export function getDb(): AHMDB {
  if (!dbInstance) dbInstance = new AHMDB();
  return dbInstance;
}
