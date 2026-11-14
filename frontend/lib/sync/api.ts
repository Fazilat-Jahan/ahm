import type {
  PullResponse,
  PushItem,
  PushResponse,
} from "./protocol";

/**
 * The only place the app talks to the backend. Every call is optional
 * background work: nothing in the UI waits on it, and every failure is a
 * normal, typed outcome (offline is a normal state, not an error).
 */

export type SyncFailureKind =
  /** No answer: offline, server down, wrong address, or timed out. */
  | "unreachable"
  /** The server answered 401: wrong or missing sync key. */
  | "auth"
  /** The server answered 503: sync is switched off there. */
  | "disabled"
  /** Any other unexpected answer. */
  | "server";

export class SyncFailure extends Error {
  constructor(
    public readonly kind: SyncFailureKind,
    message: string,
  ) {
    super(message);
    this.name = "SyncFailure";
  }
}

export const FAILURE_MESSAGES: Record<SyncFailureKind, string> = {
  unreachable:
    "The server cannot be reached. Your data is safe on this device and will sync when the link is back.",
  auth: "The server did not accept the sync key. Check the key on the Sync screen.",
  disabled: "Sync is switched off on the server (no sync key is set there).",
  server: "The server gave an unexpected answer. Sync will try again.",
};

type FetchLike = typeof fetch;

export interface ReachabilityOptions {
  timeoutMs?: number;
  fetchImpl?: FetchLike;
  /** Injected for tests; defaults to `navigator.onLine`. */
  isOnline?: () => boolean;
}

/** SPEC Appendix D: "do not trust navigator.onLine alone" — a device can
 * be on Wi-Fi with no route to the server. Reachable means `GET /health`
 * answered OK within the timeout. Never throws. */
export async function canReachBackend(
  baseUrl: string,
  options: ReachabilityOptions = {},
): Promise<boolean> {
  const {
    timeoutMs = 2500,
    fetchImpl = fetch,
    isOnline = () => (typeof navigator === "undefined" ? true : navigator.onLine),
  } = options;
  if (!isOnline()) return false;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(`${baseUrl}/api/v1/health`, {
      signal: controller.signal,
      cache: "no-store",
    });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export interface SyncApi {
  push(deviceId: string, items: PushItem[]): Promise<PushResponse>;
  pull(since?: string): Promise<PullResponse>;
}

export interface SyncApiOptions {
  baseUrl: string;
  syncKey: string;
  fetchImpl?: FetchLike;
  timeoutMs?: number;
}

export function createSyncApi({
  baseUrl,
  syncKey,
  fetchImpl = fetch,
  timeoutMs = 20_000,
}: SyncApiOptions): SyncApi {
  async function request<T>(path: string, init: RequestInit): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response: Response;
    try {
      response = await fetchImpl(`${baseUrl}/api/v1${path}`, {
        ...init,
        cache: "no-store",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          "X-Sync-Key": syncKey,
        },
      });
    } catch {
      throw new SyncFailure("unreachable", FAILURE_MESSAGES.unreachable);
    } finally {
      clearTimeout(timer);
    }
    if (response.status === 401) {
      throw new SyncFailure("auth", FAILURE_MESSAGES.auth);
    }
    if (response.status === 503) {
      throw new SyncFailure("disabled", FAILURE_MESSAGES.disabled);
    }
    if (!response.ok) {
      throw new SyncFailure("server", FAILURE_MESSAGES.server);
    }
    try {
      return (await response.json()) as T;
    } catch {
      throw new SyncFailure("server", FAILURE_MESSAGES.server);
    }
  }

  return {
    push: (deviceId, items) =>
      request<PushResponse>("/sync/push", {
        method: "POST",
        body: JSON.stringify({ deviceId, items }),
      }),
    pull: (since) =>
      request<PullResponse>(
        since
          ? `/sync/pull?since=${encodeURIComponent(since)}`
          : "/sync/pull",
        { method: "GET" },
      ),
  };
}
