"use client";

import { daysAgo, getMissionDate } from "@/lib/time/missionDate";

interface LateEntryDatePickerProps {
  value: string; // YYYY-MM-DD
  onChange: (date: string) => void;
}

/** SPEC §1.1 / §17 item 1: date picker limited to the last 14 days; a date
 * other than today sets `is_backdated`. */
export function LateEntryDatePicker({
  value,
  onChange,
}: LateEntryDatePickerProps) {
  const today = getMissionDate();
  const min = daysAgo(13, today); // last 14 days inclusive of today
  const isBackdated = value !== today;

  return (
    <div className="flex flex-col gap-1">
      <label
        htmlFor="checkin-date"
        className="text-sm font-medium text-zinc-700 dark:text-zinc-300"
      >
        Date
      </label>
      <input
        id="checkin-date"
        type="date"
        min={min}
        max={today}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="min-h-11 w-fit rounded-md border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
      />
      {isBackdated && (
        <p className="text-sm text-amber-700 dark:text-amber-500">
          Late entry — this will be saved as a backdated check-in.
        </p>
      )}
    </div>
  );
}
