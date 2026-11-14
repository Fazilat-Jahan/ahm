"use client";

import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { getIndicatorConfig } from "@/config/thresholds";
import {
  getAstronaut,
  getLatestLog,
  getLatestTrends,
  getLogsInRange,
  getRecentLogs,
} from "@/lib/db/repo";
import { computeBaseline } from "@/lib/rules/baseline";
import type { MissionContext } from "@/lib/rules/types";
import { buildMissionContext } from "@/lib/db/missionContext";
import { daysAgo, getMissionDate } from "@/lib/time/missionDate";
import { EmptyState } from "@/components/common/EmptyState";
import { TrendChart, type TrendPoint } from "@/components/charts/TrendChart";
import { BpBand, type BpPoint } from "@/components/charts/BpBand";
import { SleepBars, type SleepMoodPoint } from "@/components/charts/SleepBars";
import {
  ExerciseBars,
  type ExercisePoint,
} from "@/components/charts/ExerciseBars";
import {
  RadiationChart,
  type RadiationPoint,
} from "@/components/charts/RadiationChart";
import { TrendAlertsList } from "@/components/guidance/TrendAlertsList";

const RANGES = [
  { value: "7", label: "7 days" },
  { value: "14", label: "14 days" },
  { value: "30", label: "30 days" },
  { value: "mission", label: "Mission" },
] as const;
type RangeValue = (typeof RANGES)[number]["value"];

const BASELINE_MIN_DAYS = 14;

function baselineNote(definedCount: number, readOnly: boolean): string | null {
  if (definedCount >= BASELINE_MIN_DAYS) return null;
  const remaining = BASELINE_MIN_DAYS - definedCount;
  return `Need ${remaining} more day${remaining === 1 ? "" : "s"} of data to compute ${readOnly ? "a" : "your"} personal baseline.`;
}

export interface AstronautViewProps {
  /** Whose data to show. Every query below is scoped to this id. */
  astronautId: string;
  /** Commander/surgeon drill-down (C15): the same screen with every
   * control that could change data removed. */
  readOnly?: boolean;
}

/** SPEC §8.3 screen 4, for one astronaut. Charts only: there is nothing
 * to edit here, so `readOnly` changes wording, not controls. */
export function TrendsView({
  astronautId,
  readOnly = false,
}: AstronautViewProps) {
  const activeAstronautId = astronautId;
  const today = getMissionDate();
  const [range, setRange] = useState<RangeValue>("7");

  const astronaut = useLiveQuery(
    () => (activeAstronautId ? getAstronaut(activeAstronautId) : undefined),
    [activeAstronautId],
  );
  const latestLog = useLiveQuery(
    () => (activeAstronautId ? getLatestLog(activeAstronautId) : undefined),
    [activeAstronautId],
  );

  const fromDate =
    range === "mission"
      ? (astronaut?.missionStart ?? today)
      : daysAgo(Number(range) - 1, today);

  const rangeResult = useLiveQuery(
    () =>
      activeAstronautId
        ? getLogsInRange(activeAstronautId, fromDate, today)
        : undefined,
    [activeAstronautId, fromDate, today],
  );
  const baselineWindowLogs = useLiveQuery(
    () =>
      activeAstronautId
        ? getRecentLogs(activeAstronautId, BASELINE_MIN_DAYS)
        : undefined,
    [activeAstronautId],
  );

  const mission = useMemo<MissionContext | undefined>(
    () => (astronaut ? buildMissionContext(astronaut, today) : undefined),
    [astronaut, today],
  );
  const trends = useLiveQuery(
    () =>
      activeAstronautId && mission
        ? getLatestTrends(activeAstronautId, mission)
        : undefined,
    [activeAstronautId, mission],
  );

  if (!activeAstronautId || !astronaut) return null;

  // SPEC §16: "Charts appear after your first check-in." — the one
  // top-level empty state; per-chart "need N more days" notes below are a
  // different, finer-grained case (some data exists, just not enough).
  if (latestLog === undefined) {
    return (
      <div className="mx-auto flex max-w-lg flex-col gap-6 px-6 py-8">
        <h1 className="text-xl font-semibold">Trends</h1>
        <EmptyState
          title={
            readOnly
              ? "No check-ins yet, so there are no charts."
              : "Charts appear after your first check-in."
          }
        />
      </div>
    );
  }

  const logs = rangeResult?.logs ?? [];
  const symptomDates = rangeResult?.symptomDates ?? new Set<string>();

  const hrData: TrendPoint[] = logs.map((l) => ({
    date: l.date,
    value: l.heart_rate,
  }));
  const spo2Data: TrendPoint[] = logs.map((l) => ({
    date: l.date,
    value: l.spo2,
  }));
  const tempData: TrendPoint[] = logs.map((l) => ({
    date: l.date,
    value: l.temperature_c,
  }));
  const glucoseData: TrendPoint[] = logs.map((l) => ({
    date: l.date,
    value: l.glucose_mgdl,
  }));
  const teamData: TrendPoint[] = logs.map((l) => ({
    date: l.date,
    value: l.team_relations,
  }));
  const bpData: BpPoint[] = logs.map((l) => ({
    date: l.date,
    systolic: l.bp_systolic,
    diastolic: l.bp_diastolic,
  }));
  const sleepMoodData: SleepMoodPoint[] = logs.map((l) => ({
    date: l.date,
    sleepHours: l.sleep_hours,
    mood: l.mood,
  }));
  const exerciseData: ExercisePoint[] = logs.map((l) => ({
    date: l.date,
    resistance: l.exercise_resistance_min,
    cardio: l.exercise_cardio_min,
  }));
  const radiationData: RadiationPoint[] = logs.reduce<RadiationPoint[]>(
    (acc, l) => {
      const previous = acc[acc.length - 1]?.cumulativeMsv ?? 0;
      acc.push({
        date: l.date,
        cumulativeMsv: previous + (l.radiation_msv ?? 0),
      });
      return acc;
    },
    [],
  );

  const baselineLogs = baselineWindowLogs ?? [];
  const hrValues = baselineLogs.map((l) => l.heart_rate);
  const sysValues = baselineLogs.map((l) => l.bp_systolic);
  const diaValues = baselineLogs.map((l) => l.bp_diastolic);
  const sleepValues = baselineLogs.map((l) => l.sleep_hours);

  const hrBaseline = computeBaseline(hrValues);
  const sysBaseline = computeBaseline(sysValues);
  const diaBaseline = computeBaseline(diaValues);
  const sleepBaseline = computeBaseline(sleepValues);

  const hrDefinedCount = hrValues.filter((v) => v !== undefined).length;
  const bpDefinedCount = Math.min(
    sysValues.filter((v) => v !== undefined).length,
    diaValues.filter((v) => v !== undefined).length,
  );
  const sleepDefinedCount = sleepValues.filter((v) => v !== undefined).length;

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-8 px-6 py-8">
      <h1 className="text-xl font-semibold">Trends</h1>

      <div className="flex gap-2">
        {RANGES.map((r) => (
          <button
            key={r.value}
            type="button"
            onClick={() => setRange(r.value)}
            aria-pressed={range === r.value}
            className={`min-h-11 flex-1 rounded-md border px-2 text-sm ${
              range === r.value
                ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900"
                : "border-zinc-300 dark:border-zinc-700"
            }`}
          >
            {r.label}
          </button>
        ))}
      </div>

      <section className="flex flex-col gap-1">
        <TrendChart
          label="Heart rate"
          unit=" bpm"
          data={hrData}
          bands={getIndicatorConfig("heart_rate")?.bands ?? []}
          baseline={hrBaseline}
          symptomDates={symptomDates}
        />
        {baselineNote(hrDefinedCount, readOnly) && (
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            {baselineNote(hrDefinedCount, readOnly)}
          </p>
        )}
      </section>

      <section className="flex flex-col gap-1">
        <BpBand
          data={bpData}
          systolicBaseline={sysBaseline}
          diastolicBaseline={diaBaseline}
        />
        {baselineNote(bpDefinedCount, readOnly) && (
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            {baselineNote(bpDefinedCount, readOnly)}
          </p>
        )}
      </section>

      <TrendChart
        label="Blood oxygen (SpO2)"
        unit="%"
        data={spo2Data}
        bands={getIndicatorConfig("spo2")?.bands ?? []}
        symptomDates={symptomDates}
      />

      <TrendChart
        label="Temperature"
        unit="°C"
        data={tempData}
        bands={getIndicatorConfig("temperature_c")?.bands ?? []}
        symptomDates={symptomDates}
      />

      <TrendChart
        label="Fasting glucose"
        unit=" mg/dL"
        data={glucoseData}
        bands={getIndicatorConfig("glucose_mgdl")?.bands ?? []}
        symptomDates={symptomDates}
      />

      <section className="flex flex-col gap-1">
        <SleepBars data={sleepMoodData} sleepBaseline={sleepBaseline} />
        {baselineNote(sleepDefinedCount, readOnly) && (
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            {baselineNote(sleepDefinedCount, readOnly)}
          </p>
        )}
      </section>

      <ExerciseBars data={exerciseData} />

      <RadiationChart
        data={radiationData}
        missionBudgetMsv={mission?.radiationMissionBudgetMsv}
      />

      <TrendChart
        label="Team relations"
        unit="/5"
        data={teamData}
        bands={getIndicatorConfig("team_relations")?.bands ?? []}
        symptomDates={symptomDates}
      />

      <section>
        <h2 className="mb-2 font-medium">Trend alerts</h2>
        <TrendAlertsList trends={trends ?? []} />
      </section>
    </div>
  );
}
