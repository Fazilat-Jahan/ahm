import { getDb, type SyncConflictRecord } from "@/lib/db/schema";
import { normalizeServerUrl, type SyncEntity } from "./protocol";

/**
 * Sync settings and bookkeeping kept on this device (Dexie `settings` and
 * `syncMeta`). None of it is health data and none of it is synced.
 */

const KEY_SERVER_URL = "sync:serverUrl";
const KEY_SYNC_KEY = "sync:key";
const KEY_LAST_SYNCED = "sync:lastSyncedAt";
const KEY_ERRORS = "sync:errors";
const META_KEY = "main";
const MAX_ERRORS = 50;

export interface SyncConfig {
  serverUrl: string;
  syncKey: string;
}

export interface SyncIssue {
  at: string;
  entity: string;
  id: string;
  reason: string;
}

async function getValue<T>(key: string): Promise<T | undefined> {
  return (await getDb().settings.get(key))?.value as T | undefined;
}

/** Null until both a server address and a sync key have been entered. */
export async function getSyncConfig(): Promise<SyncConfig | null> {
  const [serverUrl, syncKey] = await Promise.all([
    getValue<string>(KEY_SERVER_URL),
    getValue<string>(KEY_SYNC_KEY),
  ]);
  if (!serverUrl || !syncKey) return null;
  return { serverUrl, syncKey };
}

/** Throws if the address is not a usable http(s) URL. */
export async function saveSyncConfig(
  serverUrl: string,
  syncKey: string,
): Promise<SyncConfig> {
  const normalized = normalizeServerUrl(serverUrl);
  if (!normalized) {
    throw new Error("Enter the server address like http://192.168.1.10:8000");
  }
  const key = syncKey.trim();
  if (!key) throw new Error("Enter the sync key.");
  const db = getDb();
  await db.transaction("rw", db.settings, async () => {
    await db.settings.put({ key: KEY_SERVER_URL, value: normalized });
    await db.settings.put({ key: KEY_SYNC_KEY, value: key });
  });
  return { serverUrl: normalized, syncKey: key };
}

/** Turns sync off on this device. Local data and the outbox are kept. */
export async function clearSyncConfig(): Promise<void> {
  const db = getDb();
  await db.transaction("rw", db.settings, async () => {
    await db.settings.delete(KEY_SERVER_URL);
    await db.settings.delete(KEY_SYNC_KEY);
  });
}

/** A stable id for this device, created the first time it is needed. */
export async function getDeviceId(): Promise<string> {
  const db = getDb();
  return db.transaction("rw", db.syncMeta, async () => {
    const meta = await db.syncMeta.get(META_KEY);
    if (meta?.deviceId) return meta.deviceId;
    const deviceId = crypto.randomUUID();
    await db.syncMeta.put({ ...meta, key: META_KEY, deviceId });
    return deviceId;
  });
}

export async function getLastPulledAt(): Promise<string | undefined> {
  return (await getDb().syncMeta.get(META_KEY))?.lastPulledAt;
}

/** Call inside the transaction that applied the pulled changes. */
export async function setLastPulledAt(serverTime: string): Promise<void> {
  const db = getDb();
  const meta = await db.syncMeta.get(META_KEY);
  await db.syncMeta.put({ ...meta, key: META_KEY, lastPulledAt: serverTime });
}

export async function getLastSyncedAt(): Promise<string | undefined> {
  return getValue<string>(KEY_LAST_SYNCED);
}

export async function setLastSyncedAt(at: string): Promise<void> {
  await getDb().settings.put({ key: KEY_LAST_SYNCED, value: at });
}

export async function getPendingCount(): Promise<number> {
  return getDb().outbox.count();
}

export async function listSyncIssues(): Promise<SyncIssue[]> {
  return (await getValue<SyncIssue[]>(KEY_ERRORS)) ?? [];
}

/** Records a record the server refused, newest first, capped. Call
 * inside a transaction that includes `settings`. */
export async function addSyncIssue(
  entity: string,
  id: string,
  reason: string,
): Promise<void> {
  const issues = await listSyncIssues();
  issues.unshift({ at: new Date().toISOString(), entity, id, reason });
  await getDb().settings.put({
    key: KEY_ERRORS,
    value: issues.slice(0, MAX_ERRORS),
  });
}

export async function clearSyncIssues(): Promise<void> {
  await getDb().settings.delete(KEY_ERRORS);
}

export async function archiveConflict(
  entity: SyncEntity,
  entityId: string,
  kind: SyncConflictRecord["kind"],
  data: unknown,
): Promise<void> {
  if (data === undefined || data === null) return;
  const astronautId =
    entity === "astronaut"
      ? entityId
      : ((data as { astronautId?: string }).astronautId ?? undefined);
  await getDb().conflicts.add({
    entity,
    entityId,
    astronautId,
    kind,
    loser: "local",
    data,
    createdAt: new Date().toISOString(),
  });
}

/** Conflict copies kept on this device, newest first. `astronautId`
 * limits the list to one astronaut. */
export async function listConflicts(
  astronautId?: string,
): Promise<SyncConflictRecord[]> {
  const db = getDb();
  const rows = astronautId
    ? await db.conflicts.where("astronautId").equals(astronautId).toArray()
    : await db.conflicts.toArray();
  return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
