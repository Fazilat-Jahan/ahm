import type { OutboxItem } from "@/lib/db/schema";

/**
 * Sync wire format (SPEC §7.4) and the small pure helpers around it.
 * No Dexie, no fetch, no timers in this file.
 */

export const SYNC_ENTITIES = [
  "astronaut",
  "daily_log",
  "symptom_entry",
  "evaluation",
  "advice_followup",
  "reminder",
  "surgeon_note",
  // Sent to the server only; the server never sends audit entries back.
  "audit_entry",
] as const;

export type SyncEntity = (typeof SYNC_ENTITIES)[number];

export function isSyncEntity(value: string): value is SyncEntity {
  return (SYNC_ENTITIES as readonly string[]).includes(value);
}

/** SPEC §7.4: "push outbox in order (batches of 50)". */
export const PUSH_BATCH_SIZE = 50;

export interface PushItem {
  entity: SyncEntity;
  id: string;
  op: "upsert" | "delete";
  version: number;
  updatedAt: string;
  data?: Record<string, unknown>;
}

export interface PushConflict {
  id: string;
  entity: SyncEntity;
  kind: "version" | "same_date" | "parent_missing";
  serverVersion: number | null;
  serverData: Record<string, unknown> | null;
  serverDeleted: boolean;
}

export interface PushRejected {
  id: string;
  entity: SyncEntity;
  reason: string;
}

export interface PushResponse {
  accepted: string[];
  conflicts: PushConflict[];
  rejected: PushRejected[];
  serverTime: string;
}

export interface PullChange {
  id: string;
  version: number;
  updatedAt: string;
  deleted: boolean;
  data: Record<string, unknown>;
}

export interface PullResponse {
  serverTime: string;
  changes: Partial<Record<SyncEntity, PullChange[]>>;
}

/** One outbox row as a push item. The record is sent exactly as it was
 * saved (the outbox row holds a snapshot), so the server stores, and
 * later returns, the same object. */
export function toPushItem(row: OutboxItem): PushItem | null {
  if (!isSyncEntity(row.entity)) return null;
  const payload = (row.payload ?? {}) as Record<string, unknown>;
  const version = typeof payload.version === "number" ? payload.version : 1;
  const updatedAt =
    (typeof payload.updatedAt === "string" && payload.updatedAt) ||
    (typeof payload.createdAt === "string" && payload.createdAt) ||
    row.createdAt;
  if (row.op === "delete") {
    return {
      entity: row.entity,
      id: row.entityId,
      op: "delete",
      version,
      updatedAt: row.createdAt,
    };
  }
  return {
    entity: row.entity,
    id: row.entityId,
    op: "upsert",
    version,
    updatedAt,
    data: payload,
  };
}

/**
 * Collapses a batch so each record appears once, as its LATEST outbox
 * row (a later snapshot already contains everything an earlier one did,
 * and a delete after an upsert is just a delete). Order of first
 * appearance is kept, so parents still go before children.
 */
export function coalesceBatch(rows: readonly OutboxItem[]): PushItem[] {
  const latest = new Map<string, PushItem>();
  const order: string[] = [];
  for (const row of rows) {
    const item = toPushItem(row);
    if (!item) continue;
    const key = `${item.entity}:${item.id}`;
    if (!latest.has(key)) order.push(key);
    latest.set(key, item);
  }
  return order.map((key) => latest.get(key) as PushItem);
}

/**
 * Retry delay after `failures` failed attempts in a row (SPEC §7.4:
 * "retry with exponential backoff (max 5 min)"): 2 s, 4 s, 8 s ... capped
 * at 5 minutes. Deterministic on purpose: no random jitter.
 */
export const BACKOFF_BASE_MS = 2_000;
export const BACKOFF_MAX_MS = 5 * 60 * 1000;

export function backoffDelayMs(failures: number): number {
  if (failures <= 0) return 0;
  const exponent = Math.min(failures - 1, 20);
  return Math.min(BACKOFF_BASE_MS * 2 ** exponent, BACKOFF_MAX_MS);
}

/** "http://192.168.1.10:8000/" -> "http://192.168.1.10:8000". Returns
 * null for anything that is not an http(s) address. */
export function normalizeServerUrl(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    const path = url.pathname.replace(/\/+$/, "").replace(/\/api\/v1$/, "");
    return `${url.origin}${path}`;
  } catch {
    return null;
  }
}
