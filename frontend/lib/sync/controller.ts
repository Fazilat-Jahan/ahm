import { liveQuery } from "dexie";
import { create } from "zustand";
import { getDb } from "@/lib/db/schema";
import { runSync, type SyncOutcome, type SyncSummary } from "./engine";
import { backoffDelayMs } from "./protocol";

/**
 * Decides WHEN to sync (SPEC §7.4 client side). One instance per page,
 * started by the app layout. It runs in the background and only ever
 * reports through `useSyncStatusStore`; no screen waits for it.
 *
 * Triggers: app start, the browser coming back online, the tab becoming
 * visible, a new outbox row (shortly after a save: "triggerSyncSoon"),
 * and a slow idle timer. After a failed attempt the next one is delayed
 * 2 s, 4 s, 8 s ... up to 5 minutes; a success resets the delay.
 */

/** With nothing failing and nothing new, check in this often. */
const IDLE_INTERVAL_MS = 5 * 60 * 1000;
/** Wait this long after a save so a whole check-in goes in one batch. */
const SOON_DELAY_MS = 1500;

export type SyncPhase = "idle" | "syncing";

interface SyncStatusState {
  phase: SyncPhase;
  /** Outcome of the most recent attempt, if any. */
  lastOutcome: SyncOutcome | null;
  lastMessage: string | null;
  /** Failed attempts in a row since the last success. */
  failures: number;
  /** When the next automatic attempt is due (ISO), if one is scheduled. */
  nextAttemptAt: string | null;
}

export const useSyncStatusStore = create<SyncStatusState>(() => ({
  phase: "idle",
  lastOutcome: null,
  lastMessage: null,
  failures: 0,
  nextAttemptAt: null,
}));

/** Outcomes that mean "try again later with a growing delay". */
function isRetryable(outcome: SyncOutcome): boolean {
  return (
    outcome === "unreachable" ||
    outcome === "server" ||
    outcome === "local_error"
  );
}

let timer: ReturnType<typeof setTimeout> | undefined;
let started = false;
let stopListening: (() => void) | undefined;

function schedule(delayMs: number): void {
  if (timer !== undefined) clearTimeout(timer);
  useSyncStatusStore.setState({
    nextAttemptAt: new Date(Date.now() + delayMs).toISOString(),
  });
  timer = setTimeout(() => void syncNow(), delayMs);
}

/** Runs a sync now (also what the "Sync now" button calls). Never
 * throws; resolves with what happened. */
export async function syncNow(): Promise<SyncSummary> {
  if (timer !== undefined) clearTimeout(timer);
  timer = undefined;
  useSyncStatusStore.setState({ phase: "syncing", nextAttemptAt: null });

  const summary = await runSync();

  const failures = isRetryable(summary.outcome)
    ? useSyncStatusStore.getState().failures + 1
    : 0;
  useSyncStatusStore.setState({
    phase: "idle",
    lastOutcome: summary.outcome,
    lastMessage: summary.message,
    failures,
  });

  if (!started) return summary;
  if (summary.outcome === "ok") {
    schedule(IDLE_INTERVAL_MS);
  } else if (isRetryable(summary.outcome)) {
    schedule(backoffDelayMs(failures));
  }
  // not_configured / auth / disabled: retrying on a timer cannot help.
  // The next attempt comes from a settings change or "Sync now".
  return summary;
}

function syncSoon(): void {
  if (useSyncStatusStore.getState().phase === "syncing") return;
  // Do not shorten a backoff wait just because another row was saved.
  if (useSyncStatusStore.getState().failures > 0 && timer !== undefined) return;
  schedule(SOON_DELAY_MS);
}

/** Starts the background sync. Safe to call more than once. */
export function startSync(): void {
  if (started || typeof window === "undefined") return;
  started = true;

  const onOnline = () => {
    // The link is back: forget the backoff and try straight away.
    useSyncStatusStore.setState({ failures: 0 });
    void syncNow();
  };
  const onVisible = () => {
    if (document.visibilityState === "visible") syncSoon();
  };
  window.addEventListener("online", onOnline);
  document.addEventListener("visibilitychange", onVisible);

  // New outbox rows -> sync soon. Sync settings changed -> try now.
  let lastPending = -1;
  const outbox = liveQuery(() => getDb().outbox.count()).subscribe({
    next: (count) => {
      if (lastPending !== -1 && count > lastPending) syncSoon();
      lastPending = count;
    },
    error: () => undefined,
  });
  let lastConfig: string | undefined;
  const config = liveQuery(async () => {
    const db = getDb();
    const [url, key] = await Promise.all([
      db.settings.get("sync:serverUrl"),
      db.settings.get("sync:key"),
    ]);
    return `${String(url?.value ?? "")}|${String(key?.value ?? "")}`;
  }).subscribe({
    next: (value) => {
      if (lastConfig !== undefined && value !== lastConfig) {
        useSyncStatusStore.setState({ failures: 0 });
        void syncNow();
      }
      lastConfig = value;
    },
    error: () => undefined,
  });

  stopListening = () => {
    window.removeEventListener("online", onOnline);
    document.removeEventListener("visibilitychange", onVisible);
    outbox.unsubscribe();
    config.unsubscribe();
  };

  void syncNow();
}

export function stopSync(): void {
  if (!started) return;
  started = false;
  if (timer !== undefined) clearTimeout(timer);
  timer = undefined;
  stopListening?.();
  stopListening = undefined;
}
