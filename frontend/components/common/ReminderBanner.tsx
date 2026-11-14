"use client";

import Link from "next/link";
import { Bell, X } from "lucide-react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  dismissReminderBanner,
  listReminderBanners,
} from "@/lib/db/reminderRepo";
import { formatTimeOfDay } from "@/lib/notifications/scheduler";
import { useActiveAstronautStore } from "@/lib/store/activeAstronaut";
import { useNow } from "@/lib/time/useNow";

/**
 * SPEC §9 fallback: "an in-app banner and a badge on app open: 'Daily
 * check-in due'". Always shown for a fired reminder, whether or not a
 * system notification also went out — so reminders work with
 * notifications blocked, unsupported, or never asked for.
 *
 * Unlocked: only the active astronaut's reminders, with Dismiss. Locked
 * (Crew screen): every due reminder with its owner's Name · ID and no
 * Dismiss — it names who has something due, never any health value.
 */
export function ReminderBanner() {
  const activeAstronautId = useActiveAstronautStore((s) => s.activeAstronautId);
  const now = useNow();
  const banners = useLiveQuery(
    () => listReminderBanners(now, activeAstronautId ?? undefined),
    [activeAstronautId, now],
  );

  if (!banners || banners.length === 0) return null;

  return (
    <ul
      aria-label="Reminders due"
      className="flex flex-col gap-2 border-b border-zinc-200 px-4 py-2 dark:border-zinc-800"
    >
      {banners.map(({ reminder, dueAt, astronaut }) => (
        <li
          key={reminder.id}
          role="status"
          className="flex items-center gap-3 rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700"
        >
          <Bell size={18} aria-hidden="true" className="shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="font-medium">{reminder.label} due</p>
            <p className="truncate text-xs text-zinc-600 dark:text-zinc-400">
              {astronaut.name} · {astronaut.crewCode} · due{" "}
              {formatTimeOfDay(dueAt)}
            </p>
          </div>
          {activeAstronautId && reminder.kind === "checkin" && (
            <Link
              href="/checkin"
              className="flex min-h-11 shrink-0 items-center rounded-md border border-zinc-300 px-3 text-sm font-medium dark:border-zinc-700"
            >
              Start
            </Link>
          )}
          {activeAstronautId && (
            <button
              type="button"
              onClick={() => void dismissReminderBanner(reminder.id)}
              aria-label={`Dismiss reminder: ${reminder.label}`}
              className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-md"
            >
              <X size={18} aria-hidden="true" />
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}
