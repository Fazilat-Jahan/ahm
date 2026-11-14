"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, useWatch } from "react-hook-form";
import {
  reminderSetupSchema,
  type ReminderSetupFormValues,
} from "@/lib/db/reminderSchema";
import { createReminders, setReminderSetupState } from "@/lib/db/reminderRepo";
import {
  buildDefaultReminders,
  CHECKIN_OFFSET_AFTER_WAKE_MIN,
  DEFAULT_REMINDER_LABELS,
  WEEKDAY_LABELS,
} from "@/lib/notifications/defaults";

const inputClass =
  "min-h-11 rounded-md border border-zinc-300 px-3 py-2 text-base dark:border-zinc-700 dark:bg-zinc-900";
const labelClass = "text-sm font-medium text-zinc-700 dark:text-zinc-300";
const errorClass = "text-sm text-red-600 dark:text-red-400";
const rowClass =
  "flex flex-col gap-2 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800";
const checkClass = "flex min-h-11 items-center gap-3 text-sm font-medium";

/**
 * SPEC §9 "Default reminder set (created at onboarding, editable)". The
 * set is built only from what is entered here: no time is pre-filled, so
 * no reminder exists that the astronaut did not choose.
 */
export function ReminderSetupForm({ astronautId }: { astronautId: string }) {
  const {
    register,
    handleSubmit,
    control,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ReminderSetupFormValues>({
    resolver: zodResolver(reminderSetupSchema),
    defaultValues: {
      wakeTime: "",
      checkinEnabled: true,
      glucoseEnabled: false,
      glucoseTime: "",
      middayEnabled: false,
      middayTime: "",
      eveningEnabled: false,
      eveningTime: "",
      weeklyEnabled: false,
      weeklyWeekday: "",
      weeklyTime: "",
    },
  });

  const glucoseEnabled = useWatch({ control, name: "glucoseEnabled" });
  const middayEnabled = useWatch({ control, name: "middayEnabled" });
  const eveningEnabled = useWatch({ control, name: "eveningEnabled" });
  const weeklyEnabled = useWatch({ control, name: "weeklyEnabled" });

  async function onSubmit(values: ReminderSetupFormValues) {
    try {
      const drafts = buildDefaultReminders({
        wakeTime: values.wakeTime,
        checkinEnabled: values.checkinEnabled,
        glucoseEnabled: values.glucoseEnabled,
        glucoseTime: values.glucoseTime,
        middayEnabled: values.middayEnabled,
        middayTime: values.middayTime,
        eveningEnabled: values.eveningEnabled,
        eveningTime: values.eveningTime,
        weeklyEnabled: values.weeklyEnabled,
        weeklyWeekday:
          values.weeklyWeekday === ""
            ? undefined
            : Number(values.weeklyWeekday),
        weeklyTime: values.weeklyTime,
      });
      await createReminders(astronautId, drafts);
      await setReminderSetupState(astronautId, "done");
    } catch {
      setError("root", { message: "Could not save. Please try again." });
    }
  }

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="flex flex-col gap-4"
      noValidate
    >
      <div>
        <h2 className="font-medium">Set up your reminders</h2>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Choose which reminders you want and when. You can change, add or
          remove them later.
        </p>
      </div>

      <div className="flex flex-col gap-1">
        <label className={labelClass} htmlFor="wakeTime">
          When do you usually wake up?
        </label>
        <input
          id="wakeTime"
          type="time"
          className={`${inputClass} self-start`}
          {...register("wakeTime")}
        />
        {errors.wakeTime && (
          <p className={errorClass}>{errors.wakeTime.message}</p>
        )}
      </div>

      <div className={rowClass}>
        <label className={checkClass}>
          <input
            type="checkbox"
            className="h-5 w-5"
            {...register("checkinEnabled")}
          />
          {DEFAULT_REMINDER_LABELS.checkin}
        </label>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          {CHECKIN_OFFSET_AFTER_WAKE_MIN} minutes after your wake time. Symptoms
          and measurements.
        </p>
        {errors.checkinEnabled && (
          <p className={errorClass}>{errors.checkinEnabled.message}</p>
        )}
      </div>

      <div className={rowClass}>
        <label className={checkClass}>
          <input
            type="checkbox"
            className="h-5 w-5"
            {...register("glucoseEnabled")}
          />
          {DEFAULT_REMINDER_LABELS.glucose}
        </label>
        {glucoseEnabled && (
          <div className="flex flex-col gap-1">
            <label className={labelClass} htmlFor="glucoseTime">
              Time
            </label>
            <input
              id="glucoseTime"
              type="time"
              className={`${inputClass} self-start`}
              {...register("glucoseTime")}
            />
            {errors.glucoseTime && (
              <p className={errorClass}>{errors.glucoseTime.message}</p>
            )}
          </div>
        )}
      </div>

      <div className={rowClass}>
        <label className={checkClass}>
          <input
            type="checkbox"
            className="h-5 w-5"
            {...register("middayEnabled")}
          />
          {DEFAULT_REMINDER_LABELS.midday}
        </label>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          A mid-day nudge to drink water and exercise.
        </p>
        {middayEnabled && (
          <div className="flex flex-col gap-1">
            <label className={labelClass} htmlFor="middayTime">
              Time
            </label>
            <input
              id="middayTime"
              type="time"
              className={`${inputClass} self-start`}
              {...register("middayTime")}
            />
            {errors.middayTime && (
              <p className={errorClass}>{errors.middayTime.message}</p>
            )}
          </div>
        )}
      </div>

      <div className={rowClass}>
        <label className={checkClass}>
          <input
            type="checkbox"
            className="h-5 w-5"
            {...register("eveningEnabled")}
          />
          {DEFAULT_REMINDER_LABELS.evening}
        </label>
        {eveningEnabled && (
          <div className="flex flex-col gap-1">
            <label className={labelClass} htmlFor="eveningTime">
              Time
            </label>
            <input
              id="eveningTime"
              type="time"
              className={`${inputClass} self-start`}
              {...register("eveningTime")}
            />
            {errors.eveningTime && (
              <p className={errorClass}>{errors.eveningTime.message}</p>
            )}
          </div>
        )}
      </div>

      <div className={rowClass}>
        <label className={checkClass}>
          <input
            type="checkbox"
            className="h-5 w-5"
            {...register("weeklyEnabled")}
          />
          {DEFAULT_REMINDER_LABELS.weekly}
        </label>
        {weeklyEnabled && (
          <div className="flex flex-wrap gap-3">
            <div className="flex flex-col gap-1">
              <label className={labelClass} htmlFor="weeklyWeekday">
                Day
              </label>
              <select
                id="weeklyWeekday"
                className={inputClass}
                {...register("weeklyWeekday")}
              >
                <option value="">Choose a day</option>
                {WEEKDAY_LABELS.map((label, index) => (
                  <option key={label} value={String(index)}>
                    {label}
                  </option>
                ))}
              </select>
              {errors.weeklyWeekday && (
                <p className={errorClass}>{errors.weeklyWeekday.message}</p>
              )}
            </div>
            <div className="flex flex-col gap-1">
              <label className={labelClass} htmlFor="weeklyTime">
                Time
              </label>
              <input
                id="weeklyTime"
                type="time"
                className={inputClass}
                {...register("weeklyTime")}
              />
              {errors.weeklyTime && (
                <p className={errorClass}>{errors.weeklyTime.message}</p>
              )}
            </div>
          </div>
        )}
      </div>

      {errors.root && <p className={errorClass}>{errors.root.message}</p>}

      <div className="flex flex-wrap gap-3">
        <button
          type="submit"
          disabled={isSubmitting}
          className="min-h-11 rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900"
        >
          Create reminders
        </button>
        <button
          type="button"
          onClick={() => void setReminderSetupState(astronautId, "skipped")}
          className="min-h-11 rounded-md border border-zinc-300 px-4 py-2 text-sm dark:border-zinc-700"
        >
          Skip, I will add my own
        </button>
      </div>
    </form>
  );
}
