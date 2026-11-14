"use client";

import type { ReactNode } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Disclaimer } from "@/components/common/Disclaimer";
import { getDb } from "@/lib/db/schema";
import { setSetting } from "@/lib/db/repo";

const CONSENT_KEY = "consentAcknowledgedAt";

/** SPEC §13: "Consent text at onboarding explaining what is stored and who
 * can see it." Shown once, before the Crew screen is usable at all.
 *
 * `useLiveQuery` returns `undefined` both while the first read is still in
 * flight and when the key is genuinely absent — there's no separate
 * "loading" signal. We treat both the same (show the gate); if consent was
 * already given, the live query resolves within a frame and swaps to
 * `children`, which is an acceptable one-frame flash, not a bug. */
export function ConsentGate({ children }: { children: ReactNode }) {
  const consentedAt = useLiveQuery(() => getDb().settings.get(CONSENT_KEY));

  if (consentedAt) return <>{children}</>;

  return (
    <div className="flex flex-col items-center gap-6 px-6 py-10 text-center">
      <h1 className="text-xl font-semibold">Before you start</h1>
      <Disclaimer className="max-w-md" />
      <p className="max-w-md text-sm text-zinc-600 dark:text-zinc-400">
        Your health data is stored on this device only, unless this app is
        connected to a habitat or ground sync server. Each astronaut can see
        only their own data; commander and surgeon roles can see all crew
        members&apos; data, read-only.
      </p>
      <button
        type="button"
        onClick={() => setSetting(CONSENT_KEY, new Date().toISOString())}
        className="min-h-11 rounded-md bg-zinc-900 px-6 py-2 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
      >
        I understand
      </button>
    </div>
  );
}
