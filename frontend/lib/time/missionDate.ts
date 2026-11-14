/**
 * Single source of truth for "what date/day is it" (CLAUDE.md §5 convention):
 * never call `new Date().toISOString().slice(0,10)` directly in a component.
 *
 * For now this is device-local time. A habitat timezone/mission-clock
 * setting (SPEC §17 item 1) is not modeled yet — every caller goes through
 * this module so that can be added later without touching call sites.
 */

/** Today's local date as YYYY-MM-DD. */
export function getMissionDate(reference: Date = new Date()): string {
  const year = reference.getFullYear();
  const month = String(reference.getMonth() + 1).padStart(2, "0");
  const day = String(reference.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** 1-based mission day: mission start date itself is day 1. */
export function getMissionDay(
  missionStartDate: string,
  today: string = getMissionDate(),
): number {
  const start = new Date(`${missionStartDate}T00:00:00`).getTime();
  const current = new Date(`${today}T00:00:00`).getTime();
  const diffDays = Math.round((current - start) / (24 * 60 * 60 * 1000));
  return diffDays + 1;
}

/** Days-ago date as YYYY-MM-DD, for building a "last 14 days" picker range. */
export function daysAgo(n: number, today: string = getMissionDate()): string {
  const d = new Date(`${today}T00:00:00`);
  d.setDate(d.getDate() - n);
  return getMissionDate(d);
}

/** Whole days from `from` to `to` (both YYYY-MM-DD); negative if `to` is
 * earlier. */
export function diffDays(from: string, to: string): number {
  const a = new Date(`${from}T00:00:00`).getTime();
  const b = new Date(`${to}T00:00:00`).getTime();
  return Math.round((b - a) / (24 * 60 * 60 * 1000));
}

/** The Monday of the week containing `date`, as YYYY-MM-DD. */
export function startOfWeek(date: string): string {
  const d = new Date(`${date}T00:00:00`);
  const sinceMonday = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - sinceMonday);
  return getMissionDate(d);
}
