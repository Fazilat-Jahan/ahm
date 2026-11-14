"use client";

import type { EvaluationResult } from "@/lib/rules/types";
import type { FollowupResponse } from "@/lib/db/schema";
import type { PriorCheckin } from "@/lib/db/repo";
import { StatusBadge } from "@/components/status/StatusBadge";
import { LateEntryDatePicker } from "./LateEntryDatePicker";

const RESPONSES: { value: FollowupResponse; label: string }[] = [
  { value: "yes", label: "Yes" },
  { value: "partly", label: "Partly" },
  { value: "no", label: "No" },
];

interface YesterdayRecapStepProps {
  date: string;
  onDateChange: (date: string) => void;
  /** Fetched by the wizard (not this step) because the wizard also needs
   * the prior evaluation's id to tag follow-up answers when saving — see
   * docs/DECISIONS.md. `undefined` covers both "still loading" and
   * "genuinely no prior check-in"; see the inline note below. */
  prior: PriorCheckin | undefined;
  followupAnswers: Record<string, FollowupResponse>;
  onAnswerChange: (actionId: string, response: FollowupResponse) => void;
}

/** SPEC §8.3 screen 2 step 1. Shows nothing fake when there is no previous
 * log — "No previous check-in yet" is the honest, correct state for a
 * fresh astronaut or the very first check-in, not a placeholder to fill in
 * later (SPEC §16 no-fake-data policy). */
export function YesterdayRecapStep({
  date,
  onDateChange,
  prior,
  followupAnswers,
  onAnswerChange,
}: YesterdayRecapStepProps) {
  const evaluation = prior?.evaluation?.result as EvaluationResult | undefined;
  const actions = evaluation?.actions ?? [];

  return (
    <div className="flex flex-col gap-6">
      <LateEntryDatePicker value={date} onChange={onDateChange} />

      <div>
        <h2 className="text-lg font-semibold">Yesterday</h2>
        {/* useLiveQuery (in the wizard) returns undefined both while
         * loading and when there really is no prior check-in — same
         * ambiguity as ConsentGate (C2) and MeasurementEntryForm's
         * existingLog (C3). Treated the same way here: show the empty
         * state; if real data is coming, it swaps in within a frame, which
         * is an acceptable flash, not a bug. The alternative — a distinct
         * "Loading…" state — would get stuck forever for an astronaut who
         * genuinely has no prior log. */}
        {!prior ? (
          <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
            No previous check-in yet.
          </p>
        ) : (
          <div className="mt-2 flex flex-col gap-4">
            <div className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
              <span>Last check-in: {prior.log.date}</span>
              {evaluation && (
                <StatusBadge status={evaluation.overall} size="sm" />
              )}
            </div>

            {actions.length === 0 ? (
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                No actions were suggested last time.
              </p>
            ) : (
              <div className="flex flex-col gap-3">
                <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  Did you do this?
                </p>
                {actions.map((action) => (
                  <div
                    key={action.id}
                    className="flex flex-col gap-2 rounded-md border border-zinc-200 p-3 dark:border-zinc-800"
                  >
                    <p className="text-sm">{action.text}</p>
                    <div className="flex gap-2">
                      {RESPONSES.map((r) => (
                        <button
                          key={r.value}
                          type="button"
                          onClick={() => onAnswerChange(action.id, r.value)}
                          aria-pressed={followupAnswers[action.id] === r.value}
                          className={`min-h-11 flex-1 rounded-md border px-3 py-2 text-sm ${
                            followupAnswers[action.id] === r.value
                              ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900"
                              : "border-zinc-300 dark:border-zinc-700"
                          }`}
                        >
                          {r.label}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
