import type { Reminder, ReminderFireState } from "@/lib/db/schema";
import { getMissionDate } from "@/lib/time/missionDate";

/**
 * SPEC §9 client scheduler — pure time arithmetic only (no Dexie, no
 * timers, no DOM), so every rule here is unit-testable with a fixed `now`.
 * The timers themselves live in `useReminderScheduler.ts`.
 *
 * All times are device-local, the same clock `lib/time/missionDate.ts`
 * uses for "today".
 */

/** SPEC §9: "if the check-in is not done by due + 2 h, show a gentle
 * in-app nudge". */
export const MISSED_CHECKIN_GRACE_MS = 2 * 60 * 60 * 1000;

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function isValidTime(time: string): boolean {
  return TIME_PATTERN.test(time);
}

/** "07:00" + 30 -> "07:30". Wraps past midnight ("23:50" + 30 -> "00:20"). */
export function addMinutesToTime(time: string, minutes: number): string {
  const match = TIME_PATTERN.exec(time);
  if (!match) throw new Error(`Invalid time "${time}" (expected HH:MM).`);
  const dayMinutes = 24 * 60;
  const total =
    (((Number(match[1]) * 60 + Number(match[2]) + minutes) % dayMinutes) +
      dayMinutes) %
    dayMinutes;
  const hh = String(Math.floor(total / 60)).padStart(2, "0");
  const mm = String(total % 60).padStart(2, "0");
  return `${hh}:${mm}`;
}

/** The reminder's occurrence on the calendar day of `day`, or null if it
 * does not occur that day (weekly reminder, different weekday). */
export function occurrenceOn(reminder: Reminder, day: Date): Date | null {
  const match = TIME_PATTERN.exec(reminder.time);
  if (!match) return null;
  if (reminder.weekday !== undefined && reminder.weekday !== day.getDay()) {
    return null;
  }
  return new Date(
    day.getFullYear(),
    day.getMonth(),
    day.getDate(),
    Number(match[1]),
    Number(match[2]),
    0,
    0,
  );
}

/** Next occurrence strictly after `now`, or null for an unusable time. */
export function nextFireTime(reminder: Reminder, now: Date): Date | null {
  // 8 days covers "weekly, and today's occurrence has already passed".
  for (let offset = 0; offset <= 7; offset++) {
    const day = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() + offset,
    );
    const occurrence = occurrenceOn(reminder, day);
    if (occurrence && occurrence.getTime() > now.getTime()) return occurrence;
  }
  return null;
}

/**
 * Today's occurrence if it has already come due. An occurrence from before
 * the reminder was created, edited or re-enabled does not count: adding an
 * "08:00" reminder at 15:00 must not fire it on the spot.
 */
export function dueOccurrenceToday(reminder: Reminder, now: Date): Date | null {
  const occurrence = occurrenceOn(reminder, now);
  if (!occurrence || occurrence.getTime() > now.getTime()) return null;
  const changedAt = Date.parse(reminder.updatedAt);
  // Compare at minute precision: a reminder saved at 08:00:20 for "08:00"
  // (the "2 minutes ahead" case typed late) still counts for that minute.
  if (
    !Number.isNaN(changedAt) &&
    occurrence.getTime() < Math.floor(changedAt / 60_000) * 60_000
  ) {
    return null;
  }
  return occurrence;
}

export interface DueReminder {
  reminder: Reminder;
  dueAt: Date;
}

/** Enabled reminders whose occurrence today has come due and has not
 * fired on this device yet. Disabled reminders never fire. */
export function getDueReminders(
  reminders: readonly Reminder[],
  fireStates: Readonly<Record<string, ReminderFireState | undefined>>,
  now: Date,
): DueReminder[] {
  const due: DueReminder[] = [];
  for (const reminder of reminders) {
    if (!reminder.enabled) continue;
    const dueAt = dueOccurrenceToday(reminder, now);
    if (!dueAt) continue;
    const fired = fireStates[reminder.id];
    if (fired && Date.parse(fired.dueAt) >= dueAt.getTime()) continue;
    due.push({ reminder, dueAt });
  }
  return due.sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime());
}

/** Milliseconds until the earliest next occurrence of any enabled
 * reminder, or null if nothing is scheduled. */
export function msUntilNextFire(
  reminders: readonly Reminder[],
  now: Date,
): number | null {
  let earliest: number | null = null;
  for (const reminder of reminders) {
    if (!reminder.enabled) continue;
    const next = nextFireTime(reminder, now);
    if (!next) continue;
    const ms = next.getTime() - now.getTime();
    if (earliest === null || ms < earliest) earliest = ms;
  }
  return earliest;
}

/**
 * In-app banners to show right now: occurrences that fired today on this
 * device, were not dismissed, and whose reminder is still enabled. A
 * banner from an earlier day is dropped rather than carried over.
 */
export function getActiveBanners(
  reminders: readonly Reminder[],
  fireStates: Readonly<Record<string, ReminderFireState | undefined>>,
  now: Date,
): DueReminder[] {
  const today = getMissionDate(now);
  const banners: DueReminder[] = [];
  for (const reminder of reminders) {
    if (!reminder.enabled) continue;
    const fired = fireStates[reminder.id];
    if (!fired || fired.dismissed) continue;
    const dueAt = new Date(fired.dueAt);
    if (Number.isNaN(dueAt.getTime()) || getMissionDate(dueAt) !== today) {
      continue;
    }
    banners.push({ reminder, dueAt });
  }
  return banners.sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime());
}

/**
 * SPEC §9 missed-reminder nudge: today's check-in reminder came due more
 * than 2 h ago and there is still no check-in for today. Returns the time
 * it was due, or null. With several check-in reminders the earliest one
 * that is overdue wins.
 */
export function getMissedCheckinDueAt(
  reminders: readonly Reminder[],
  hasCheckinToday: boolean,
  now: Date,
): Date | null {
  if (hasCheckinToday) return null;
  let earliest: Date | null = null;
  for (const reminder of reminders) {
    if (!reminder.enabled || reminder.kind !== "checkin") continue;
    const dueAt = dueOccurrenceToday(reminder, now);
    if (!dueAt) continue;
    if (now.getTime() - dueAt.getTime() < MISSED_CHECKIN_GRACE_MS) continue;
    if (!earliest || dueAt.getTime() < earliest.getTime()) earliest = dueAt;
  }
  return earliest;
}

/** "08:30" style label for a Date, device-local, 24 h. */
export function formatTimeOfDay(date: Date): string {
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}
