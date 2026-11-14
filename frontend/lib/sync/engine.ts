import type { Table } from "dexie";
import { getDb, type AHMDB, type DailyLog } from "@/lib/db/schema";
import {
  canReachBackend,
  createSyncApi,
  FAILURE_MESSAGES,
  SyncFailure,
  type SyncApi,
  type SyncFailureKind,
} from "./api";
import {
  coalesceBatch,
  PUSH_BATCH_SIZE,
  SYNC_ENTITIES,
  type PullChange,
  type PullResponse,
  type PushConflict,
  type PushItem,
  type SyncEntity,
} from "./protocol";
import {
  addSyncIssue,
  archiveConflict,
  getDeviceId,
  getLastPulledAt,
  getSyncConfig,
  setLastPulledAt,
  setLastSyncedAt,
} from "./store";

/**
 * The sync worker (SPEC §7.4): push the outbox in order, then pull.
 *
 * Guarantees:
 * - The UI never waits on this. It only ever reads and writes Dexie.
 * - An outbox row is removed only after the server has answered for it.
 *   If the answer never arrives the row stays and is sent again; the
 *   server recognises a repeat, so nothing is stored twice.
 * - Pulled changes are written straight to Dexie WITHOUT new outbox rows
 *   (otherwise two devices would echo each other forever).
 * - A conflict never drops data: the copy that does not stay live is
 *   moved to the local `conflicts` archive first.
 */

type AnyTable = Table<Record<string, unknown>, string>;

function tableFor(db: AHMDB, entity: SyncEntity): AnyTable {
  const tables: Record<SyncEntity, unknown> = {
    astronaut: db.astronauts,
    daily_log: db.logs,
    symptom_entry: db.symptoms,
    evaluation: db.evaluations,
    advice_followup: db.followups,
    reminder: db.reminders,
  };
  return tables[entity] as AnyTable;
}

function syncTables(db: AHMDB) {
  return [
    db.astronauts,
    db.logs,
    db.symptoms,
    db.evaluations,
    db.followups,
    db.reminders,
    db.outbox,
    db.conflicts,
    db.settings,
    db.syncMeta,
  ];
}

/** Moves a local log, with its symptoms and evaluations, into the
 * conflict archive and removes it from the live tables. */
async function archiveLogBundle(
  db: AHMDB,
  logId: string,
  fallbackLog?: unknown,
): Promise<void> {
  const log = await db.logs.get(logId);
  await archiveConflict("daily_log", logId, "same_date", log ?? fallbackLog);
  const symptoms = await db.symptoms.where("logId").equals(logId).toArray();
  for (const symptom of symptoms) {
    await archiveConflict("symptom_entry", symptom.id, "same_date", symptom);
  }
  const evaluations = await db.evaluations
    .where("logId")
    .equals(logId)
    .toArray();
  for (const evaluation of evaluations) {
    await archiveConflict("evaluation", evaluation.id, "same_date", evaluation);
  }
  await db.symptoms.where("logId").equals(logId).delete();
  await db.evaluations.where("logId").equals(logId).delete();
  await db.logs.delete(logId);
}

async function resolveConflict(
  db: AHMDB,
  conflict: PushConflict,
  sent: PushItem | undefined,
): Promise<void> {
  const table = tableFor(db, conflict.entity);

  if (conflict.kind === "same_date") {
    // Another log for this astronaut and date is already live on the
    // server. Keep ours in the archive and take the server's.
    await archiveLogBundle(db, conflict.id, sent?.data);
    if (conflict.serverData) {
      await db.logs.put(conflict.serverData as unknown as DailyLog);
    }
    return;
  }

  if (conflict.kind === "parent_missing") {
    // Belongs to a log that lost a same-date conflict.
    const local = await table.get(conflict.id);
    await archiveConflict(
      conflict.entity,
      conflict.id,
      "parent_missing",
      local ?? sent?.data,
    );
    await table.delete(conflict.id);
    return;
  }

  // Version conflict: the server's copy is newer. Ours goes to the
  // archive, the server's becomes the live row here too.
  await archiveConflict(conflict.entity, conflict.id, "version", sent?.data);
  if (conflict.serverDeleted) {
    await table.delete(conflict.id);
  } else if (conflict.serverData) {
    await table.put(conflict.serverData);
  }
}

export interface PushResult {
  pushed: number;
  conflicts: number;
  rejected: number;
}

/**
 * Sends the outbox in batches of 50, oldest first. Throws `SyncFailure`
 * as soon as a batch cannot be delivered; rows of that batch and every
 * later one stay in the outbox untouched.
 */
export async function drainOutbox(
  api: SyncApi,
  deviceId: string,
  batchSize = PUSH_BATCH_SIZE,
): Promise<PushResult> {
  const db = getDb();
  const result: PushResult = { pushed: 0, conflicts: 0, rejected: 0 };

  for (;;) {
    const rows = await db.outbox.orderBy("seq").limit(batchSize).toArray();
    if (rows.length === 0) return result;
    const items = coalesceBatch(rows);
    const seqs = rows
      .map((row) => row.seq)
      .filter((seq): seq is number => seq !== undefined);

    // May throw: nothing below runs, the rows stay queued.
    const response =
      items.length > 0 ? await api.push(deviceId, items) : undefined;

    await db.transaction("rw", syncTables(db), async () => {
      if (response) {
        const sentById = new Map(items.map((item) => [item.id, item]));
        for (const conflict of response.conflicts) {
          await resolveConflict(db, conflict, sentById.get(conflict.id));
        }
        for (const rejected of response.rejected) {
          await addSyncIssue(rejected.entity, rejected.id, rejected.reason);
        }
        result.pushed += response.accepted.length;
        result.conflicts += response.conflicts.length;
        result.rejected += response.rejected.length;
      }
      // Every row of the batch now has an answer (stored, kept as a
      // conflict copy, or refused and reported), so it leaves the outbox.
      await db.outbox.bulkDelete(seqs);
    });
  }
}

function sameContent(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

async function applyChange(
  db: AHMDB,
  entity: SyncEntity,
  change: PullChange,
): Promise<boolean> {
  const table = tableFor(db, entity);

  // A local change to this record is still waiting to be pushed: leave it
  // alone. The push decides (and keeps both copies if they differ).
  const pending = await db.outbox.where("entityId").equals(change.id).count();
  if (pending > 0) return false;

  const local = await table.get(change.id);

  if (change.deleted) {
    if (!local) return false;
    await table.delete(change.id);
    return true;
  }

  if (!local && entity === "daily_log") {
    const data = change.data as unknown as DailyLog;
    const sameDate = await db.logs
      .where("[astronautId+date]")
      .equals([data.astronautId, data.date])
      .first();
    if (sameDate && sameDate.id !== change.id) {
      // A different local log for that date: the server's stays live,
      // ours is kept in the archive (same rule as on push).
      await archiveLogBundle(db, sameDate.id);
    }
  }

  if (local) {
    const localVersion =
      typeof local.version === "number" ? local.version : 1;
    if (change.version < localVersion) return false; // local is newer
    if (change.version === localVersion && sameContent(local, change.data)) {
      return false; // already have exactly this
    }
    // Higher version, or equal version with different content: SPEC
    // §7.4 "if equal ... prefer server".
  }

  try {
    await table.put(change.data);
    return true;
  } catch {
    // E.g. a crew ID that already exists here under another identity.
    await addSyncIssue(
      entity,
      change.id,
      entity === "astronaut"
        ? "This crew ID already exists on this device as a different astronaut."
        : "This record from the server could not be stored on this device.",
    );
    return false;
  }
}

/** Applies a pull response and advances the pull cursor, in one
 * transaction: either all of it lands or none of it does. */
export async function applyPull(response: PullResponse): Promise<number> {
  const db = getDb();
  let applied = 0;
  await db.transaction("rw", syncTables(db), async () => {
    // SYNC_ENTITIES is parent-first: astronauts, logs, then the rest.
    for (const entity of SYNC_ENTITIES) {
      for (const change of response.changes[entity] ?? []) {
        if (await applyChange(db, entity, change)) applied += 1;
      }
    }
    await setLastPulledAt(response.serverTime);
  });
  return applied;
}

export async function pullChanges(api: SyncApi): Promise<number> {
  return applyPull(await api.pull(await getLastPulledAt()));
}

export type SyncOutcome =
  | "ok"
  | "not_configured"
  | SyncFailureKind
  | "local_error";

export interface SyncSummary extends PushResult {
  outcome: SyncOutcome;
  pulled: number;
  message: string;
}

export interface RunSyncOptions {
  /** Injected for tests. */
  fetchImpl?: typeof fetch;
  isOnline?: () => boolean;
}

let inFlight: Promise<SyncSummary> | null = null;

async function runSyncOnce(options: RunSyncOptions): Promise<SyncSummary> {
  const empty = { pushed: 0, conflicts: 0, rejected: 0, pulled: 0 };
  const config = await getSyncConfig();
  if (!config) {
    return {
      ...empty,
      outcome: "not_configured",
      message: "Sync is not set up on this device.",
    };
  }

  const reachable = await canReachBackend(config.serverUrl, {
    fetchImpl: options.fetchImpl,
    isOnline: options.isOnline,
  });
  if (!reachable) {
    return {
      ...empty,
      outcome: "unreachable",
      message: FAILURE_MESSAGES.unreachable,
    };
  }

  const api = createSyncApi({
    baseUrl: config.serverUrl,
    syncKey: config.syncKey,
    fetchImpl: options.fetchImpl,
  });
  let pushResult: PushResult = { pushed: 0, conflicts: 0, rejected: 0 };
  try {
    pushResult = await drainOutbox(api, await getDeviceId());
    const pulled = await pullChanges(api);
    await setLastSyncedAt(new Date().toISOString());
    return {
      ...pushResult,
      pulled,
      outcome: "ok",
      message:
        pushResult.conflicts > 0
          ? "Synced. Some records differed between devices; both versions were kept."
          : "Synced.",
    };
  } catch (error) {
    if (error instanceof SyncFailure) {
      return {
        ...pushResult,
        pulled: 0,
        outcome: error.kind,
        message: error.message,
      };
    }
    return {
      ...pushResult,
      pulled: 0,
      outcome: "local_error",
      message:
        "Sync could not finish on this device. Your data is unchanged; it will try again.",
    };
  }
}

/** One sync run: push, then pull. Never throws. If a run is already in
 * progress, returns that run instead of starting a second one. */
export function runSync(options: RunSyncOptions = {}): Promise<SyncSummary> {
  if (!inFlight) {
    inFlight = runSyncOnce(options).finally(() => {
      inFlight = null;
    });
  }
  return inFlight;
}
