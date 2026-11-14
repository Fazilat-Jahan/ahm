"use client";

import {
  Legend,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { getIndicatorConfig } from "@/config/thresholds";
import { getStatusConfig } from "@/components/status/StatusBadge";

export interface BpPoint {
  date: string;
  systolic: number | undefined;
  diastolic: number | undefined;
}

interface BpBandProps {
  data: BpPoint[];
  /** Personal median baselines (SPEC §17 item 5), shown once there's 14
   * days of data. */
  systolicBaseline?: number;
  diastolicBaseline?: number;
  height?: number;
}

/** SPEC §8.3 screen 4: "BP with sys/dia bands" — one combined chart, both
 * lines, systolic's bands shown as the background (diastolic's bands are
 * narrower and mostly overlap; showing both would just be visual noise). */
export function BpBand({
  data,
  systolicBaseline,
  diastolicBaseline,
  height = 200,
}: BpBandProps) {
  const systolicConfig = getIndicatorConfig("bp_systolic");
  const hasAnyValue = data.some(
    (d) => d.systolic !== undefined || d.diastolic !== undefined,
  );

  if (!hasAnyValue) {
    return (
      <div className="flex h-[200px] items-center justify-center text-sm text-zinc-500 dark:text-zinc-400">
        No blood pressure data in this range.
      </div>
    );
  }

  const values = data
    .flatMap((d) => [d.systolic, d.diastolic])
    .filter((v): v is number => v !== undefined);
  const boundaries =
    systolicConfig?.bands
      .flatMap((b) => [b.min, b.max])
      .filter((v): v is number => v !== undefined) ?? [];
  const all = [...values, ...boundaries];
  const min = Math.min(...all);
  const max = Math.max(...all);
  const padding = (max - min) * 0.15 || 10;
  const yMin = min - padding;
  const yMax = max + padding;

  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <h3 className="text-sm font-medium">Blood pressure</h3>
        {(systolicBaseline !== undefined ||
          diastolicBaseline !== undefined) && (
          <span className="text-xs text-zinc-500 dark:text-zinc-400">
            Your normal: {systolicBaseline ?? "–"}/{diastolicBaseline ?? "–"}{" "}
            mmHg
          </span>
        )}
      </div>
      <ResponsiveContainer width="100%" height={height}>
        <LineChart
          data={data}
          margin={{ top: 4, right: 8, bottom: 4, left: 8 }}
        >
          {systolicConfig?.bands.map((band, i) => (
            <ReferenceArea
              key={i}
              y1={band.min ?? yMin}
              y2={band.max ?? yMax}
              fill={`var(${getStatusConfig(band.status).colorVar})`}
              fillOpacity={0.1}
              strokeOpacity={0}
            />
          ))}
          <XAxis dataKey="date" tick={{ fontSize: 10 }} minTickGap={20} />
          <YAxis domain={[yMin, yMax]} tick={{ fontSize: 10 }} width={32} />
          <Tooltip formatter={(value) => `${value} mmHg`} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          {systolicBaseline !== undefined && (
            <ReferenceLine
              y={systolicBaseline}
              stroke="var(--foreground)"
              strokeDasharray="4 4"
              strokeOpacity={0.6}
            />
          )}
          {diastolicBaseline !== undefined && (
            <ReferenceLine
              y={diastolicBaseline}
              stroke="var(--color-status-yellow)"
              strokeDasharray="4 4"
              strokeOpacity={0.6}
            />
          )}
          <Line
            name="Systolic"
            dataKey="systolic"
            stroke="var(--foreground)"
            strokeWidth={2}
            connectNulls
            dot={{ r: 2.5 }}
          />
          <Line
            name="Diastolic"
            dataKey="diastolic"
            stroke="var(--color-status-yellow)"
            strokeWidth={2}
            connectNulls
            dot={{ r: 2.5 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
