"use client";

import { useState } from "react";
import type { Status } from "@/config/thresholds";
import { Sparkline } from "@/components/charts/Sparkline";
import { getStatusConfig } from "./StatusBadge";

interface IndicatorCardProps {
  label: string;
  unit: string;
  value: number | string | undefined;
  status: Status | undefined;
  sparklineValues: number[];
  ruleId?: string;
  message?: string;
}

/** SPEC §8.3 screen 1: "indicator cards (value, unit, colour, tiny
 * sparkline, tap -> detail)". There's no indicator detail page yet (that's
 * Learn/Trends territory, later chunks), so "detail" here expands the
 * card in place to show the real rule id + message already carried on
 * the stored evaluation — honest, not a placeholder link to nowhere. */
export function IndicatorCard({
  label,
  unit,
  value,
  status,
  sparklineValues,
  ruleId,
  message,
}: IndicatorCardProps) {
  const [expanded, setExpanded] = useState(false);
  const config = status ? getStatusConfig(status) : null;
  const Icon = config?.icon;

  return (
    <button
      type="button"
      onClick={() => setExpanded((e) => !e)}
      aria-expanded={expanded}
      className="flex min-h-11 flex-col gap-1 rounded-md border border-border bg-surface p-3 text-left"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm text-zinc-500 dark:text-zinc-400">
          {label}
        </span>
        {Icon && (
          <Icon
            size={16}
            aria-hidden="true"
            style={{ color: `var(${config!.colorVar})` }}
          />
        )}
      </div>
      <div className="flex items-end justify-between gap-2">
        <span
          className="text-2xl font-semibold"
          style={config ? { color: `var(${config.colorVar})` } : undefined}
        >
          {value !== undefined ? `${value}${unit}` : "No data"}
        </span>
        {sparklineValues.length >= 2 && (
          <Sparkline
            values={sparklineValues}
            colorVar={config?.colorVar ?? "--foreground"}
          />
        )}
      </div>
      {expanded && (
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          {ruleId && message
            ? `${ruleId}: ${message}`
            : "No data yet for this indicator."}
        </p>
      )}
    </button>
  );
}
