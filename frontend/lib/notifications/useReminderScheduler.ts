"use client";

import { useEffect } from "react";
import { liveQuery } from "dexie";
import { getAstronaut, getLogForDate } from "@/lib/db/repo";
import {
  claimReminderFire,
  getReminderFireStates,
  listAllReminders,
} from "@/lib/db/reminderRepo";
import { getMissionDate } from "@/lib/time/missionDate";
import { showReminderNotification } from "./notify";
import { getDueReminders, msUntilNextFire } from "./scheduler";

/** SPEC §9: "a 30 s interval check against Date.now() (resilient to
 * sleep)". */
const CHECK_INTERVAL_MS = 30_000;
/** `setTimeout` delays above 2^31-1 ms fire immediately; stay well under. */
const MAX_TIMEOUT_MS = 6 * 60 * 60 * 1000;

/**
 * SPEC §9 client scheduler runtime. Mounted once in the app layout, so it
 * runs on every screen — including the locked Crew screen — for every
 * astronaut registered on this device. Works with no network: it only
 * reads Dexie and the device clock.
 *
 * Three triggers lead to the same `check()`: a `setTimeout` aimed at the
 * next occurrence (fires on time), a 30 s interval (catches a timeout lost
 * to device sleep or a clock change), and the tab becoming visible again.
 * A fourth, a Dexie live query, re-aims the timeout whenever reminders are
 * added, edited, toggled or deleted.
 */
export function useReminderScheduler(): void {
  useEffect(() => {
    let stopped = false;
    let running = false;
    let rerun = false;
    let timeout: number | undefined;

    async function fireDue(): Promise<void> {
      const now = new Date();
      const reminders = await listAllReminders();
      const due = getDueReminders(
        reminders,
        await getReminderFireStates(),
        now,
      );
      for (const { reminder, dueAt } of due) {
        // A check-in reminder is pointless once today's check-in is saved:
        // record the occurrence as handled, show nothing.
        const alreadyDone =
          reminder.kind === "checkin" &&
          (await getLogForDate(reminder.astronautId, getMissionDate(now))) !==
            undefined;
        const claimed = await claimReminderFire(
          reminder.id,
          dueAt.toISOString(),
          alreadyDone,
        );
        if (!claimed || alreadyDone) continue;
        // The in-app banner needs nothing more: it is derived from the
        // fire state just written. The system notification is extra.
        const astronaut = await getAstronaut(reminder.astronautId);
        if (!astronaut) continue;
        void showReminderNotification({
          title: `${reminder.label} due`,
          body: `${astronaut.name} · ${astronaut.crewCode}`,
          tag: `ahm-reminder-${reminder.id}`,
        });
      }

      if (stopped) return;
      window.clearTimeout(timeout);
      const ms = msUntilNextFire(reminders, new Date());
      if (ms !== null) {
        timeout = window.setTimeout(
          () => void check(),
          Math.min(ms + 50, MAX_TIMEOUT_MS),
        );
      }
    }

    async function check(): Promise<void> {
      if (stopped) return;
      if (running) {
        rerun = true;
        return;
      }
      running = true;
      try {
        do {
          rerun = false;
          await fireDue();
        } while (rerun && !stopped);
      } catch {
        // IndexedDB briefly unavailable (e.g. during a version upgrade in
        // another tab): the next interval tick simply tries again.
      } finally {
        running = false;
      }
    }

    void check();
    const interval = window.setInterval(() => void check(), CHECK_INTERVAL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void check();
    };
    document.addEventListener("visibilitychange", onVisible);
    const subscription = liveQuery(() => listAllReminders()).subscribe({
      next: () => void check(),
      error: () => undefined,
    });

    return () => {
      stopped = true;
      window.clearTimeout(timeout);
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
      subscription.unsubscribe();
    };
  }, []);
}
