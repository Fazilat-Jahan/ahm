"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import {
  parseWeekday,
  reminderFormSchema,
  type ReminderFormValues,
} from "@/lib/db/reminderSchema";
import { createReminder, updateReminder } from "@/lib/db/reminderRepo";
import type { Reminder } from "@/lib/db/schema";
import { WEEKDAY_LABELS } from "@/lib/notifications/defaults";

const inputClass =
  "min-h-11 rounded-md border border-zinc-300 px-3 py-2 text-base dark:border-zinc-700 dark:bg-zinc-900";
const labelClass = "text-sm font-medium text-zinc-700 dark:text-zinc-300";
const errorClass = "text-sm text-red-600 dark:text-red-400";

interface ReminderFormProps {
  astronautId: string;
  /** Present = edit this reminder; absent = add a new one. */
  reminder?: Reminder;
  onDone: () => void;
}

/** SPEC §8.3 screen 6: "add, edit". One form for both. */
export function ReminderForm({
  astronautId,
  reminder,
  onDone,
}: ReminderFormProps) {
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ReminderFormValues>({
    resolver: zodResolver(reminderFormSchema),
    defaultValues: {
      label: reminder?.label ?? "",
      time: reminder?.time ?? "",
      weekday: reminder?.weekday === undefined ? "" : String(reminder.weekday),
    },
  });
  const idPrefix = reminder ? `edit-${reminder.id}` : "new-reminder";

  async function onSubmit(values: ReminderFormValues) {
    try {
      const weekday = parseWeekday(values.weekday);
      if (reminder) {
        await updateReminder(astronautId, reminder.id, {
          label: values.label.trim(),
          time: values.time,
          weekday: weekday ?? null,
        });
      } else {
        await createReminder(astronautId, {
          kind: "custom",
          label: values.label.trim(),
          time: values.time,
          weekday,
          enabled: true,
        });
      }
      onDone();
    } catch {
      setError("root", { message: "Could not save. Please try again." });
    }
  }

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="flex flex-col gap-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800"
      noValidate
    >
      <h2 className="font-medium">
        {reminder ? "Edit reminder" : "New reminder"}
      </h2>

      <div className="flex flex-col gap-1">
        <label className={labelClass} htmlFor={`${idPrefix}-label`}>
          Name
        </label>
        <input
          id={`${idPrefix}-label`}
          className={inputClass}
          {...register("label")}
        />
        {errors.label && <p className={errorClass}>{errors.label.message}</p>}
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="flex flex-col gap-1">
          <label className={labelClass} htmlFor={`${idPrefix}-time`}>
            Time
          </label>
          <input
            id={`${idPrefix}-time`}
            type="time"
            className={inputClass}
            {...register("time")}
          />
          {errors.time && <p className={errorClass}>{errors.time.message}</p>}
        </div>
        <div className="flex flex-col gap-1">
          <label className={labelClass} htmlFor={`${idPrefix}-weekday`}>
            Repeats
          </label>
          <select
            id={`${idPrefix}-weekday`}
            className={inputClass}
            {...register("weekday")}
          >
            <option value="">Every day</option>
            {WEEKDAY_LABELS.map((label, index) => (
              <option key={label} value={String(index)}>
                Every {label}
              </option>
            ))}
          </select>
          {errors.weekday && (
            <p className={errorClass}>{errors.weekday.message}</p>
          )}
        </div>
      </div>

      {errors.root && <p className={errorClass}>{errors.root.message}</p>}

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={isSubmitting}
          className="min-h-11 rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900"
        >
          {reminder ? "Save changes" : "Add reminder"}
        </button>
        <button
          type="button"
          onClick={onDone}
          className="min-h-11 rounded-md border border-zinc-300 px-4 py-2 text-sm dark:border-zinc-700"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
