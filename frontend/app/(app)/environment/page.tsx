"use client";

import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Check } from "lucide-react";
import {
  ADAPTATION_RULE_DAYS,
  ENVIRONMENT_CONFIGS,
  isGravityChange,
} from "@/config/environments";
import { getSymptomLabel } from "@/config/symptoms";
import { HAZARD_SOURCES, uniqueSources } from "@/content/sources";
import { HAZARD_LABELS } from "@/lib/db/labels";
import { buildMissionContext } from "@/lib/db/missionContext";
import { changeAstronautEnvironment, getAstronaut } from "@/lib/db/repo";
import { ENVIRONMENTS, type Environment } from "@/lib/rules/types";
import { isWithinAdaptationWindow } from "@/lib/rules/modifiers";
import { useActiveAstronautStore } from "@/lib/store/activeAstronaut";
import { getMissionDate } from "@/lib/time/missionDate";
import { SourcesList } from "@/components/common/SourcesList";

/**
 * SPEC §8.3 screen 8 / §12: choose the environment; see its emphasis and
 * tip pack. The choice is the astronaut's own (manual input) and is saved
 * for the active astronaut only. A change between microgravity and
 * partial gravity is recorded as a gravity change, which the rule engine
 * uses for its adaptation window (SPEC §4.4).
 */
export default function EnvironmentPage() {
  const activeAstronautId = useActiveAstronautStore((s) => s.activeAstronautId);
  const astronaut = useLiveQuery(
    () => (activeAstronautId ? getAstronaut(activeAstronautId) : undefined),
    [activeAstronautId],
  );
  const [pending, setPending] = useState<Environment | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!activeAstronautId || !astronaut) return null;

  const today = getMissionDate();
  const current = ENVIRONMENT_CONFIGS[astronaut.environment];
  const selected = pending ?? astronaut.environment;
  const selectedConfig = ENVIRONMENT_CONFIGS[selected];
  const hasChange = selected !== astronaut.environment;
  const willChangeGravity =
    hasChange && isGravityChange(astronaut.environment, selected);
  const mission = buildMissionContext(astronaut, today);
  const inAdaptationWindow = isWithinAdaptationWindow(
    mission,
    ADAPTATION_RULE_DAYS,
  );

  async function save() {
    if (!activeAstronautId || !hasChange) return;
    setSaving(true);
    setError(null);
    try {
      await changeAstronautEnvironment(activeAstronautId, selected, today);
      setPending(null);
    } catch {
      setError("Could not save. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-6 px-6 py-8">
      <div>
        <h1 className="text-xl font-semibold">Environment</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Where you are living and working now. It sets what this app asks you
          to watch for.
        </p>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 font-medium">Your environment</legend>
        {ENVIRONMENTS.map((id) => {
          const config = ENVIRONMENT_CONFIGS[id];
          const isSelected = selected === id;
          return (
            <label
              key={id}
              className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border px-4 py-3 text-sm ${
                isSelected
                  ? "border-zinc-900 dark:border-zinc-100"
                  : "border-zinc-200 dark:border-zinc-800"
              }`}
            >
              <input
                type="radio"
                name="environment"
                value={id}
                checked={isSelected}
                onChange={() => setPending(id)}
                className="h-5 w-5"
              />
              <span className="flex-1">
                <span className="block font-medium">{config.label}</span>
                <span className="block text-zinc-600 dark:text-zinc-400">
                  {config.gravity}
                </span>
              </span>
              {astronaut.environment === id && (
                <span className="flex items-center gap-1 text-xs text-zinc-600 dark:text-zinc-400">
                  <Check size={14} aria-hidden="true" />
                  Current
                </span>
              )}
            </label>
          );
        })}
      </fieldset>

      {hasChange && (
        <div className="flex flex-col gap-3 rounded-lg border border-zinc-300 p-4 text-sm dark:border-zinc-700">
          <p>
            Change from <span className="font-medium">{current.label}</span> to{" "}
            <span className="font-medium">{selectedConfig.label}</span>?
          </p>
          {willChangeGravity && (
            <p className="text-zinc-600 dark:text-zinc-400">
              This is a change of gravity. For the next {ADAPTATION_RULE_DAYS}{" "}
              days the app treats nausea with dizziness as likely adaptation
              (rule CMB-SAM-01), as it does at the start of a mission.
            </p>
          )}
          {error && <p className="text-red-600 dark:text-red-400">{error}</p>}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => void save()}
              disabled={saving}
              className="min-h-11 rounded-md bg-zinc-900 px-4 py-2 font-medium text-white disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900"
            >
              Save environment
            </button>
            <button
              type="button"
              onClick={() => setPending(null)}
              className="min-h-11 rounded-md border border-zinc-300 px-4 py-2 dark:border-zinc-700"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <section
        aria-labelledby="environment-focus"
        className="flex flex-col gap-4 rounded-lg border border-zinc-200 p-4 text-sm dark:border-zinc-800"
      >
        <div>
          <h2 id="environment-focus" className="text-base font-medium">
            {selectedConfig.label}
          </h2>
          <p className="text-zinc-600 dark:text-zinc-400">
            {selectedConfig.gravity}
            {hasChange ? " · preview, not saved yet" : ""}
          </p>
        </div>

        <div className="flex flex-col gap-1">
          <h3 className="font-medium">What matters most here</h3>
          <ul className="flex list-disc flex-col gap-1 pl-5 text-zinc-700 dark:text-zinc-300">
            {selectedConfig.emphasis.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <ul className="mt-1 flex flex-wrap gap-1.5" aria-label="Main hazards">
            {selectedConfig.hazards.map((hazard) => (
              <li
                key={hazard}
                className="rounded-full border border-zinc-300 px-2 py-0.5 text-xs text-zinc-600 dark:border-zinc-700 dark:text-zinc-400"
              >
                {HAZARD_LABELS[hazard]}
              </li>
            ))}
          </ul>
        </div>

        <div className="flex flex-col gap-1">
          <h3 className="font-medium">Tips</h3>
          <ul className="flex list-disc flex-col gap-1 pl-5 text-zinc-700 dark:text-zinc-300">
            {selectedConfig.tips.map((tip) => (
              <li key={tip}>{tip}</li>
            ))}
          </ul>
        </div>

        <div className="flex flex-col gap-1">
          <h3 className="font-medium">Symptoms to log if you notice them</h3>
          <p className="text-zinc-700 dark:text-zinc-300">
            {selectedConfig.watchSymptoms.map(getSymptomLabel).join(", ")}
          </p>
        </div>
      </section>

      {!hasChange && (
        <section
          aria-labelledby="environment-rules"
          className="flex flex-col gap-1 rounded-lg border border-zinc-200 p-4 text-sm dark:border-zinc-800"
        >
          <h2 id="environment-rules" className="font-medium">
            How this affects your results
          </h2>
          {inAdaptationWindow ? (
            <p className="text-zinc-700 dark:text-zinc-300">
              Adaptation window is active
              {mission.daysSinceGravityChange !== undefined &&
              mission.daysSinceGravityChange <= ADAPTATION_RULE_DAYS
                ? ` (day ${mission.daysSinceGravityChange} since your gravity change on ${astronaut.gravityChangedOn})`
                : ` (mission day ${mission.missionDay})`}
              . Nausea with dizziness is treated as likely adaptation (rule
              CMB-SAM-01, yellow).
            </p>
          ) : (
            <p className="text-zinc-700 dark:text-zinc-300">
              No adaptation window is active.
              {astronaut.gravityChangedOn
                ? ` Last gravity change: ${astronaut.gravityChangedOn}.`
                : ""}
            </p>
          )}
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Early-adaptation softening only ever applies to yellow results. Red
            and critical results are never softened, in any environment.
          </p>
        </section>
      )}

      <SourcesList
        as="h2"
        sources={uniqueSources(
          selectedConfig.hazards.map((h) => HAZARD_SOURCES[h]),
        )}
      />
    </div>
  );
}
