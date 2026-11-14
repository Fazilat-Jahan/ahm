"use client";

import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { RefreshCw } from "lucide-react";
import { syncNow, useSyncStatusStore } from "@/lib/sync/controller";
import { getSyncConfig, saveSyncConfig } from "@/lib/sync/store";

const inputClass =
  "min-h-11 w-full rounded-md border border-zinc-300 px-3 py-2 text-base dark:border-zinc-700 dark:bg-zinc-900";
const labelClass = "text-sm font-medium text-zinc-700 dark:text-zinc-300";

/**
 * Sync setup on the Crew screen, usable before anyone is unlocked. A new
 * device has no astronauts, so it could never reach the Sync screen (it
 * is behind the PIN); this is how it loads the crew registered on other
 * devices (SPEC §5.1 item 8). It shows only whether sync is connected
 * and when it last worked — no names, no health data.
 */
export function ConnectServerCard() {
  const config = useLiveQuery(async () => (await getSyncConfig()) ?? null, []);
  const phase = useSyncStatusStore((s) => s.phase);
  const lastMessage = useSyncStatusStore((s) => s.lastMessage);
  const [open, setOpen] = useState(false);
  const [serverUrl, setServerUrl] = useState("");
  const [syncKey, setSyncKey] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (config === undefined) return null;

  async function connect() {
    setError(null);
    try {
      // Saving the settings starts a sync by itself (see controller.ts).
      await saveSyncConfig(serverUrl, syncKey);
      setOpen(false);
      setSyncKey("");
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not save the settings.",
      );
    }
  }

  if (config) {
    return (
      <section
        aria-label="Server sync"
        className="flex flex-col gap-2 rounded-lg border border-zinc-200 p-4 text-sm dark:border-zinc-800"
      >
        <p className="break-all">
          <span className="font-medium">Sync server: </span>
          {config.serverUrl}
        </p>
        <p role="status" className="text-zinc-600 dark:text-zinc-400">
          {phase === "syncing"
            ? "Syncing..."
            : (lastMessage ?? "Waiting for the first sync.")}
        </p>
        <button
          type="button"
          onClick={() => void syncNow()}
          disabled={phase === "syncing"}
          className="flex min-h-11 items-center gap-2 self-start rounded-md border border-zinc-300 px-4 py-2 disabled:opacity-60 dark:border-zinc-700"
        >
          <RefreshCw size={16} aria-hidden="true" />
          Sync now
        </button>
      </section>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="min-h-11 self-start text-sm font-medium text-zinc-700 underline dark:text-zinc-300"
      >
        Load crew from a server
      </button>
    );
  }

  return (
    <section
      aria-label="Connect to a sync server"
      className="flex flex-col gap-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800"
    >
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        Optional. Connect this device to the habitat or ground server to load
        astronauts registered on other devices.
      </p>
      <div className="flex flex-col gap-1">
        <label className={labelClass} htmlFor="connect-url">
          Server address
        </label>
        <input
          id="connect-url"
          inputMode="url"
          autoComplete="off"
          placeholder="http://192.168.1.10:8000"
          className={inputClass}
          value={serverUrl}
          onChange={(e) => setServerUrl(e.target.value)}
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className={labelClass} htmlFor="connect-key">
          Sync key
        </label>
        <input
          id="connect-key"
          type="password"
          autoComplete="off"
          className={inputClass}
          value={syncKey}
          onChange={(e) => setSyncKey(e.target.value)}
        />
      </div>
      {error && (
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      )}
      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => void connect()}
          className="min-h-11 rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
        >
          Connect
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="min-h-11 rounded-md border border-zinc-300 px-4 py-2 text-sm dark:border-zinc-700"
        >
          Cancel
        </button>
      </div>
    </section>
  );
}
