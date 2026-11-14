"use client";

import type { Status } from "@/config/thresholds";
import { getStatusConfig } from "@/components/status/StatusBadge";
import { BODY_PARTS } from "@/config/bodyParts";

interface RegionListProps {
  statuses: Record<string, Status | null>;
  selectedRegionId: string | null;
  onSelect: (id: string) => void;
}

/** CLAUDE.md §2 rule 8 / SPEC §8.3 screen 3: "a RegionList... so keyboard
 * and screen-reader users and low-end devices get the same information" as
 * the 3D canvas — real buttons, not a decorative mirror of it. Works
 * whether or not the 3D canvas rendered at all (also used by the WebGL
 * `Body2DFallback` path). */
export function RegionList({
  statuses,
  selectedRegionId,
  onSelect,
}: RegionListProps) {
  return (
    <ul className="flex flex-col gap-1" aria-label="Body regions">
      {BODY_PARTS.map((region) => {
        const status = statuses[region.id] ?? null;
        const statusConfig = status ? getStatusConfig(status) : null;
        const isSelected = selectedRegionId === region.id;
        return (
          <li key={region.id}>
            <button
              type="button"
              onClick={() => onSelect(region.id)}
              aria-pressed={isSelected}
              className={`flex min-h-11 w-full items-center justify-between gap-2 rounded-md border px-3 py-2 text-left text-sm ${
                isSelected
                  ? "border-zinc-900 dark:border-zinc-100"
                  : "border-zinc-200 dark:border-zinc-800"
              }`}
            >
              <span>{region.label}</span>
              {statusConfig ? (
                <span
                  className="flex items-center gap-1 text-xs"
                  style={{ color: `var(${statusConfig.colorVar})` }}
                >
                  <statusConfig.icon size={14} aria-hidden="true" />
                  {statusConfig.label}
                </span>
              ) : (
                <span className="text-xs text-zinc-500 dark:text-zinc-400">
                  No data yet
                </span>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
