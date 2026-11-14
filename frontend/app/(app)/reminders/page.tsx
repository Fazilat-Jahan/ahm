"use client";

import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Pencil, Trash2 } from "lucide-react";
import {
  deleteReminder,
  getReminderSetupState,
  listReminders,
  updateReminder,
} from "@/lib/db/reminderRepo";
import type { Reminder } from "@/lib/db/schema";
import { WEEKDAY_LABELS } from "@/lib/notifications/defaults";
import { formatTimeOfDay, nextFireTime } from "@/lib/notifications/scheduler";
import { getMissionDate } from "@/lib/time/missionDate";
import { useNow } from "@/lib/time/useNow";
import { useActiveAstronautStore } from "@/lib/store/activeAstronaut";
import { NotificationPermissionCard } from "@/components/reminders/NotificationPermissionCard";
import { ReminderForm } from "@/components/reminders/ReminderForm";
import { ReminderSetupForm } from "@/components/reminders/ReminderSetupForm";

function describeRepeat(reminder: Reminder): string {
  return reminder.weekday === undefined
    ? "Every day"
    : `Every ${WEEKDAY_LABELS[reminder.weekday] ?? "week"}`;
}

function describeNext(reminder: Reminder, now: Date): string {
  if (!reminder.enabled) return "Off";
  const next = nextFireTime(reminder, now);
  if (!next) return "Not scheduled";
  const day =
    getMissionDate(next) === getMissionDate(now)
      ? "today"
      : WEEKDAY_LABELS[next.getDay()];
  return `Next: ${day} ${formatTimeOfDay(next)}`;
}

/** SPEC §8.3 screen 6: "Reminders: list, add, edit, enable/disable;
 * default set created at onboarding." Only the active astronaut's own
 * reminders; their Name · ID is in the global `ActiveAstronautBar`. */
export default function RemindersPage() {
  const activeAstronautId = useActiveAstronautStore((s) => s.activeAstronautId);
  const now = useNow();
  const reminders = useLiveQuery(
    () => (activeAstronautId ? listReminders(activeAstronautId) : undefined),
    [activeAstronautId],
  );
  // `null` = loaded, no setup choice made yet (distinct from "still loading").
  const setupState = useLiveQuery(
    async () =>
      activeAstronautId
        ? ((await getReminderSetupState(activeAstronautId)) ?? null)
        : undefined,
    [activeAstronautId],
  );
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  if (
    !activeAstronautId ||
    reminders === undefined ||
    setupState === undefined
  ) {
    return null;
  }

  const needsSetup = reminders.length === 0 && setupState === null;

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-6 px-6 py-8">
      <h1 className="text-xl font-semibold">Reminders</h1>

      <NotificationPermissionCard />

      {needsSetup ? (
        <ReminderSetupForm astronautId={activeAstronautId} />
      ) : (
        <>
          {reminders.length === 0 ? (
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              No reminders yet. Add one below.
            </p>
          ) : (
            <ul className="flex flex-col gap-3" aria-label="Your reminders">
              {reminders.map((reminder) =>
                editingId === reminder.id ? (
                  <li key={reminder.id}>
                    <ReminderForm
                      astronautId={activeAstronautId}
                      reminder={reminder}
                      onDone={() => setEditingId(null)}
                    />
                  </li>
                ) : (
                  <li
                    key={reminder.id}
                    className="flex flex-col gap-2 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium">{reminder.label}</p>
                        <p className="text-sm text-zinc-600 dark:text-zinc-400">
                          {reminder.time} · {describeRepeat(reminder)}
                        </p>
                        <p className="text-xs text-zinc-500 dark:text-zinc-400">
                          {describeNext(reminder, now)}
                        </p>
                      </div>
                      <label className="flex min-h-11 shrink-0 items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          className="h-5 w-5"
                          checked={reminder.enabled}
                          onChange={(e) =>
                            void updateReminder(
                              activeAstronautId,
                              reminder.id,
                              { enabled: e.target.checked },
                            )
                          }
                          aria-label={`${reminder.label}: reminder on`}
                        />
                        {reminder.enabled ? "On" : "Off"}
                      </label>
                    </div>
                    {confirmDeleteId === reminder.id ? (
                      <div className="flex flex-wrap items-center gap-3 text-sm">
                        <span>Delete this reminder?</span>
                        <button
                          type="button"
                          onClick={() => {
                            setConfirmDeleteId(null);
                            void deleteReminder(activeAstronautId, reminder.id);
                          }}
                          className="min-h-11 rounded-md border border-zinc-300 px-3 font-medium dark:border-zinc-700"
                        >
                          Yes, delete
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(null)}
                          className="min-h-11 rounded-md border border-zinc-300 px-3 dark:border-zinc-700"
                        >
                          Keep
                        </button>
                      </div>
                    ) : (
                      <div className="flex gap-3">
                        <button
                          type="button"
                          onClick={() => {
                            setAdding(false);
                            setEditingId(reminder.id);
                          }}
                          aria-label={`Edit reminder: ${reminder.label}`}
                          className="flex min-h-11 items-center gap-2 rounded-md border border-zinc-300 px-3 text-sm dark:border-zinc-700"
                        >
                          <Pencil size={14} aria-hidden="true" />
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(reminder.id)}
                          aria-label={`Delete reminder: ${reminder.label}`}
                          className="flex min-h-11 items-center gap-2 rounded-md border border-zinc-300 px-3 text-sm dark:border-zinc-700"
                        >
                          <Trash2 size={14} aria-hidden="true" />
                          Delete
                        </button>
                      </div>
                    )}
                  </li>
                ),
              )}
            </ul>
          )}

          {adding ? (
            <ReminderForm
              astronautId={activeAstronautId}
              onDone={() => setAdding(false)}
            />
          ) : (
            <button
              type="button"
              onClick={() => {
                setEditingId(null);
                setAdding(true);
              }}
              className="min-h-11 rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
            >
              Add reminder
            </button>
          )}
        </>
      )}
    </div>
  );
}
