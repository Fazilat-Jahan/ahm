"use client";

import { SYMPTOMS, type Severity, type SymptomId } from "@/config/symptoms";

interface SymptomsStepProps {
  symptoms: Partial<Record<SymptomId, Severity>>;
  onChange: (symptoms: Partial<Record<SymptomId, Severity>>) => void;
}

const SEVERITY_LABEL: Record<Severity, string> = {
  1: "Mild",
  2: "Moderate",
  3: "Severe",
}; // cycles 1 -> 2 -> 3 -> cleared on the next tap

/** SPEC §8.3 screen 2 step 2: "tap to select; tap again to set severity 1
 * to 3"; "None today" big button. */
export function SymptomsStep({ symptoms, onChange }: SymptomsStepProps) {
  function cycle(id: SymptomId) {
    const current = symptoms[id];
    const next = { ...symptoms };
    if (current === undefined) next[id] = 1;
    else if (current === 1) next[id] = 2;
    else if (current === 2) next[id] = 3;
    else delete next[id];
    onChange(next);
  }

  const hasAny = Object.keys(symptoms).length > 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Symptoms</h2>
        <button
          type="button"
          onClick={() => onChange({})}
          className={`min-h-11 rounded-md border px-4 text-sm font-medium ${
            !hasAny
              ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900"
              : "border-zinc-300 dark:border-zinc-700"
          }`}
        >
          None today
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {SYMPTOMS.map((symptom) => {
          const severity = symptoms[symptom.id];
          const selected = severity !== undefined;
          return (
            <button
              key={symptom.id}
              type="button"
              onClick={() => cycle(symptom.id)}
              aria-pressed={selected}
              className={`flex min-h-11 flex-col items-start gap-0.5 rounded-md border p-3 text-left text-sm ${
                selected
                  ? "border-zinc-900 bg-zinc-50 dark:border-zinc-100 dark:bg-zinc-900"
                  : "border-zinc-200 dark:border-zinc-800"
              }`}
            >
              <span>{symptom.label}</span>
              {selected && (
                <span className="text-xs text-zinc-500 dark:text-zinc-400">
                  {SEVERITY_LABEL[severity]}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
