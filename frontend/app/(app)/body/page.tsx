"use client";

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { getLatestEvaluation, getRecentSymptoms } from "@/lib/db/repo";
import type { Status } from "@/config/thresholds";
import type { EvaluationResult } from "@/lib/rules/types";
import { useActiveAstronautStore } from "@/lib/store/activeAstronaut";
import { useBodySelectionStore } from "@/lib/store/bodySelection";
import { getRegionStatus } from "@/lib/body/regionStatus";
import { isWebGLAvailable } from "@/lib/body/webgl";
import { BODY_PARTS } from "@/config/bodyParts";
import { RegionList } from "@/components/body3d/RegionList";
import { Body2DFallback } from "@/components/body3d/Body2DFallback";
import { CanvasErrorBoundary } from "@/components/body3d/CanvasErrorBoundary";
import { BodyPartPanel } from "@/components/body3d/BodyPartPanel";

const Body3D = dynamic(
  () => import("@/components/body3d/Body3D").then((m) => m.Body3D),
  { ssr: false },
);

const RECENT_SYMPTOM_DAYS = 7;

/** SPEC §8.3 screen 3. The active astronaut's name/ID already show in the
 * global `ActiveAstronautBar` (C2), so this screen doesn't repeat it. */
export default function BodyPage() {
  const activeAstronautId = useActiveAstronautStore((s) => s.activeAstronautId);
  const latestEvaluationRow = useLiveQuery(
    () =>
      activeAstronautId ? getLatestEvaluation(activeAstronautId) : undefined,
    [activeAstronautId],
  );
  const recentSymptoms = useLiveQuery(
    () =>
      activeAstronautId
        ? getRecentSymptoms(activeAstronautId, RECENT_SYMPTOM_DAYS)
        : undefined,
    [activeAstronautId],
  );
  const selectedRegionId = useBodySelectionStore((s) => s.selectedRegionId);
  const hoveredRegionId = useBodySelectionStore((s) => s.hoveredRegionId);
  const select = useBodySelectionStore((s) => s.select);
  const hover = useBodySelectionStore((s) => s.hover);

  // Lazy initializer, not an effect (same pattern as OfflineBadge): a plain
  // read of the current value on first render, nothing to race against.
  const [webglAvailable] = useState(() => isWebGLAvailable());
  const [resetToken, setResetToken] = useState(0);

  const evaluation = latestEvaluationRow?.result as
    EvaluationResult | undefined;

  const statuses = useMemo(() => {
    const map: Record<string, Status | null> = {};
    for (const region of BODY_PARTS) {
      map[region.id] = getRegionStatus(
        evaluation?.indicators,
        region.indicators,
      );
    }
    return map;
  }, [evaluation]);

  if (!activeAstronautId) return null;

  const selectedRegion =
    BODY_PARTS.find((r) => r.id === selectedRegionId) ?? null;

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-6 px-6 py-8">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Body</h1>
        <button
          type="button"
          onClick={() => setResetToken((t) => t + 1)}
          className="min-h-11 rounded-md border border-zinc-300 px-3 text-sm dark:border-zinc-700"
        >
          Reset view
        </button>
      </div>

      {webglAvailable ? (
        <CanvasErrorBoundary
          fallback={
            <Body2DFallback
              statuses={statuses}
              selectedRegionId={selectedRegionId}
              hoveredRegionId={hoveredRegionId}
              onSelect={select}
              onHoverChange={hover}
            />
          }
        >
          <div className="h-80 overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800">
            <Body3D statuses={statuses} resetToken={resetToken} />
          </div>
        </CanvasErrorBoundary>
      ) : (
        <Body2DFallback
          statuses={statuses}
          selectedRegionId={selectedRegionId}
          hoveredRegionId={hoveredRegionId}
          onSelect={select}
          onHoverChange={hover}
        />
      )}

      <section className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
        {!evaluation ? (
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            No data yet. Complete a check-in to see this region&apos;s status.
          </p>
        ) : selectedRegion ? (
          <BodyPartPanel
            region={selectedRegion}
            status={statuses[selectedRegion.id] ?? null}
            indicators={evaluation.indicators}
            recentSymptoms={recentSymptoms ?? []}
            actions={evaluation.actions}
            escalation={evaluation.escalation}
          />
        ) : (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Tap a region to see its status.
          </p>
        )}
      </section>

      <RegionList
        statuses={statuses}
        selectedRegionId={selectedRegionId}
        onSelect={select}
      />
    </div>
  );
}
