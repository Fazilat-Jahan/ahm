"use client";

import type { ReactNode } from "react";
import { MEASUREMENTS } from "@/config/measurements";
import { SYMPTOMS, type Severity, type SymptomId } from "@/config/symptoms";
import type { FollowupResponse } from "@/lib/db/schema";
import type { MeasurementFieldValue, WizardStep } from "./wizardTypes";

interface ReviewStepProps {
  date: string;
  followupAnswers: Record<string, FollowupResponse>;
  symptoms: Partial<Record<SymptomId, Severity>>;
  measurementValues: Record<string, MeasurementFieldValue>;
  mood: number | undefined;
  stress: number | undefined;
  selfHarmThoughts: boolean;
  onEdit: (step: WizardStep) => void;
}

function Section({
  title,
  onEdit,
  children,
}: {
  title: string;
  onEdit: () => void;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-md border border-zinc-200 p-4 dark:border-zinc-800">
      <div className="flex items-center justify-between">
        <h3 className="font-medium">{title}</h3>
        <button
          type="button"
          onClick={onEdit}
          className="min-h-11 px-2 text-sm text-zinc-600 underline dark:text-zinc-400"
        >
          Edit
        </button>
      </div>
      {children}
    </div>
  );
}

export function ReviewStep({
  date,
  followupAnswers,
  symptoms,
  measurementValues,
  mood,
  stress,
  selfHarmThoughts,
  onEdit,
}: ReviewStepProps) {
  const symptomEntries = Object.entries(symptoms) as [SymptomId, Severity][];
  const symptomLabel = (id: SymptomId) =>
    SYMPTOMS.find((s) => s.id === id)?.label ?? id;

  const measurementEntries = MEASUREMENTS.flatMap((m) => {
    if (m.kind === "two-number") {
      return m.fields
        .filter((f) => measurementValues[f.id] !== undefined)
        .map((f) => ({
          label: f.label,
          value: `${measurementValues[f.id]}${f.unit}`,
        }));
    }
    const value = measurementValues[m.id];
    if (value === undefined) return [];
    if (m.kind === "toggle")
      return [{ label: m.label, value: value ? "Yes" : "No" }];
    const unit = m.kind === "number" ? m.unit : "";
    return [{ label: m.label, value: `${value}${unit}` }];
  });

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold">Review</h2>
      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        Check-in for {date}
      </p>

      {Object.keys(followupAnswers).length > 0 && (
        <Section title="Yesterday's follow-up" onEdit={() => onEdit("recap")}>
          <ul className="flex flex-col gap-1 text-sm text-zinc-600 dark:text-zinc-400">
            {Object.entries(followupAnswers).map(([actionId, response]) => (
              <li key={actionId} className="capitalize">
                {response}
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section title="Symptoms" onEdit={() => onEdit("symptoms")}>
        {symptomEntries.length === 0 ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            None reported.
          </p>
        ) : (
          <ul className="flex flex-col gap-1 text-sm">
            {symptomEntries.map(([id, severity]) => (
              <li key={id}>
                {symptomLabel(id)} — severity {severity}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Measurements" onEdit={() => onEdit("measurements")}>
        {measurementEntries.length === 0 ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Nothing entered.
          </p>
        ) : (
          <ul className="grid grid-cols-2 gap-1 text-sm">
            {measurementEntries.map((entry) => (
              <li key={entry.label}>
                {entry.label}: {entry.value}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Mood and stress" onEdit={() => onEdit("mood")}>
        <ul className="flex flex-col gap-1 text-sm">
          <li>Mood: {mood ?? "Skipped"}</li>
          <li>Stress: {stress ?? "Skipped"}</li>
          <li>Safety question: {selfHarmThoughts ? "Yes" : "No"}</li>
          <li>
            Team relations: {measurementValues.team_relations ?? "Skipped"}
          </li>
          <li>EVA today: {measurementValues.eva_today ? "Yes" : "No"}</li>
        </ul>
      </Section>
    </div>
  );
}
