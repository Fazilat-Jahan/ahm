import type { ReminderKind } from "@/lib/db/schema";
import { addMinutesToTime } from "./scheduler";

/**
 * SPEC §9 "Default reminder set (created at onboarding, editable)".
 *
 * Nothing here is a pre-made schedule: every time comes from what the
 * astronaut typed in the reminder setup form (their wake time, the times
 * they picked, which rows they switched on). The only fixed parts are the
 * row names and "+30 min after waking" for the daily check-in, both taken
 * from the SPEC table.
 */

/** SPEC §9 table: "Wake time + 30 min | Daily check-in". */
export const CHECKIN_OFFSET_AFTER_WAKE_MIN = 30;

export const DEFAULT_REMINDER_LABELS: Record<
  Exclude<ReminderKind, "custom">,
  string
> = {
  checkin: "Daily check-in",
  glucose: "Fasting glucose measurement",
  midday: "Hydration and exercise",
  evening: "Log exercise and mood, sleep prep",
  weekly: "Weekly weight and vision self-test",
};

export const WEEKDAY_LABELS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

/** What the astronaut chose in the setup form. */
export interface ReminderSetupChoices {
  wakeTime: string;
  checkinEnabled: boolean;
  glucoseEnabled: boolean;
  glucoseTime?: string;
  middayEnabled: boolean;
  middayTime?: string;
  eveningEnabled: boolean;
  eveningTime?: string;
  weeklyEnabled: boolean;
  weeklyWeekday?: number;
  weeklyTime?: string;
}

export interface ReminderDraft {
  kind: ReminderKind;
  label: string;
  time: string;
  weekday?: number;
  enabled: boolean;
}

/** Turns the setup answers into reminder rows. Rows that were left
 * switched off are not created at all. */
export function buildDefaultReminders(
  choices: ReminderSetupChoices,
): ReminderDraft[] {
  const drafts: ReminderDraft[] = [];
  if (choices.checkinEnabled) {
    drafts.push({
      kind: "checkin",
      label: DEFAULT_REMINDER_LABELS.checkin,
      time: addMinutesToTime(choices.wakeTime, CHECKIN_OFFSET_AFTER_WAKE_MIN),
      enabled: true,
    });
  }
  if (choices.glucoseEnabled && choices.glucoseTime) {
    drafts.push({
      kind: "glucose",
      label: DEFAULT_REMINDER_LABELS.glucose,
      time: choices.glucoseTime,
      enabled: true,
    });
  }
  if (choices.middayEnabled && choices.middayTime) {
    drafts.push({
      kind: "midday",
      label: DEFAULT_REMINDER_LABELS.midday,
      time: choices.middayTime,
      enabled: true,
    });
  }
  if (choices.eveningEnabled && choices.eveningTime) {
    drafts.push({
      kind: "evening",
      label: DEFAULT_REMINDER_LABELS.evening,
      time: choices.eveningTime,
      enabled: true,
    });
  }
  if (
    choices.weeklyEnabled &&
    choices.weeklyTime &&
    choices.weeklyWeekday !== undefined
  ) {
    drafts.push({
      kind: "weekly",
      label: DEFAULT_REMINDER_LABELS.weekly,
      time: choices.weeklyTime,
      weekday: choices.weeklyWeekday,
      enabled: true,
    });
  }
  return drafts;
}
