import { z } from "zod";

const timeString = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Enter a time (hours and minutes).");

const optionalTime = z.string().optional();

/** Add / edit one reminder. `weekday` is "" for every day, or "0".."6". */
export const reminderFormSchema = z.object({
  label: z
    .string()
    .trim()
    .min(1, "Give the reminder a name.")
    .max(60, "Keep the name under 60 characters."),
  time: timeString,
  weekday: z
    .string()
    .regex(/^[0-6]?$/, "Pick a day of the week, or every day."),
});

export type ReminderFormValues = z.infer<typeof reminderFormSchema>;

/** Form string -> stored value. */
export function parseWeekday(value: string): number | undefined {
  return value === "" ? undefined : Number(value);
}

const TIMED_ROWS = [
  ["glucoseEnabled", "glucoseTime"],
  ["middayEnabled", "middayTime"],
  ["eveningEnabled", "eveningTime"],
  ["weeklyEnabled", "weeklyTime"],
] as const;

/** SPEC §9 default-set setup: the astronaut's own choices. */
export const reminderSetupSchema = z
  .object({
    /** Only needed for the daily check-in (wake time + 30 min). */
    wakeTime: z.string(),
    checkinEnabled: z.boolean(),
    glucoseEnabled: z.boolean(),
    glucoseTime: optionalTime,
    middayEnabled: z.boolean(),
    middayTime: optionalTime,
    eveningEnabled: z.boolean(),
    eveningTime: optionalTime,
    weeklyEnabled: z.boolean(),
    weeklyWeekday: z.string().regex(/^[0-6]?$/),
    weeklyTime: optionalTime,
  })
  .superRefine((data, ctx) => {
    if (data.checkinEnabled && !timeString.safeParse(data.wakeTime).success) {
      ctx.addIssue({
        code: "custom",
        path: ["wakeTime"],
        message: "Enter your wake time, or switch off the daily check-in.",
      });
    }
    for (const [enabledKey, timeKey] of TIMED_ROWS) {
      if (!data[enabledKey]) continue;
      if (!timeString.safeParse(data[timeKey]).success) {
        ctx.addIssue({
          code: "custom",
          path: [timeKey],
          message: "Pick a time for this reminder, or switch it off.",
        });
      }
    }
    if (data.weeklyEnabled && data.weeklyWeekday === "") {
      ctx.addIssue({
        code: "custom",
        path: ["weeklyWeekday"],
        message: "Pick a day of the week.",
      });
    }
    const anyEnabled =
      data.checkinEnabled ||
      data.glucoseEnabled ||
      data.middayEnabled ||
      data.eveningEnabled ||
      data.weeklyEnabled;
    if (!anyEnabled) {
      ctx.addIssue({
        code: "custom",
        path: ["checkinEnabled"],
        message: "Switch on at least one reminder, or choose Skip.",
      });
    }
  });

export type ReminderSetupFormValues = z.infer<typeof reminderSetupSchema>;
