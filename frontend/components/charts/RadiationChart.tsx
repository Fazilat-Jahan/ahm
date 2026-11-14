"use client";

import {
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export interface RadiationPoint {
  date: string;
  /** Cumulative mSv, summed across the displayed range (not full-mission
   * to date — no mission started before this range is assumed). */
  cumulativeMsv: number;
}

/** SPEC §8.3 screen 4: "cumulative radiation vs budget". No mission
 * radiation budget is configured anywhere in the app yet (that's an
 * environment-screen concern, C10) — shown honestly rather than inventing
 * a number; the cumulative line still renders from real dosimeter
 * readings once any exist. */
export function RadiationChart({
  data,
  missionBudgetMsv,
  height = 160,
}: {
  data: RadiationPoint[];
  missionBudgetMsv?: number;
  height?: number;
}) {
  const hasAnyValue = data.some((d) => d.cumulativeMsv > 0);

  if (!hasAnyValue) {
    return (
      <div className="flex h-[160px] items-center justify-center text-sm text-zinc-500 dark:text-zinc-400">
        No radiation dose logged in this range.
      </div>
    );
  }

  return (
    <div>
      <h3 className="mb-1 text-sm font-medium">Cumulative radiation</h3>
      {missionBudgetMsv === undefined && (
        <p className="mb-1 text-xs text-zinc-500 dark:text-zinc-400">
          Mission radiation budget not configured yet.
        </p>
      )}
      <ResponsiveContainer width="100%" height={height}>
        <LineChart
          data={data}
          margin={{ top: 4, right: 8, bottom: 4, left: 8 }}
        >
          <XAxis dataKey="date" tick={{ fontSize: 10 }} minTickGap={20} />
          <YAxis tick={{ fontSize: 10 }} width={32} />
          <Tooltip formatter={(value) => `${Number(value).toFixed(2)} mSv`} />
          {missionBudgetMsv !== undefined && (
            <ReferenceLine
              y={missionBudgetMsv}
              stroke="var(--color-status-red)"
              strokeDasharray="4 4"
              label={{
                value: "Budget",
                fontSize: 10,
                position: "insideTopRight",
              }}
            />
          )}
          <Line
            dataKey="cumulativeMsv"
            stroke="var(--foreground)"
            strokeWidth={2}
            dot={{ r: 2.5 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
