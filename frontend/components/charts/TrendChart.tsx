"use client";

import {
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { Band } from "@/config/thresholds";
import { getStatusConfig } from "@/components/status/StatusBadge";

export interface TrendPoint {
  date: string;
  value: number | undefined;
}

interface TrendChartProps {
  label: string;
  unit: string;
  data: TrendPoint[];
  bands: Band[];
  /** Personal median baseline (SPEC §17 item 5), only shown once there's
   * enough data — undefined means "don't draw a baseline line". */
  baseline?: number;
  symptomDates: Set<string>;
  height?: number;
}

function computeDomain(data: TrendPoint[], bands: Band[]): [number, number] {
  const values = data
    .map((d) => d.value)
    .filter((v): v is number => v !== undefined);
  const boundaries = bands
    .flatMap((b) => [b.min, b.max])
    .filter((v): v is number => v !== undefined);
  const all = [...values, ...boundaries];
  if (all.length === 0) return [0, 1];
  const min = Math.min(...all);
  const max = Math.max(...all);
  const padding = (max - min) * 0.15 || Math.abs(max) * 0.1 || 1;
  return [min - padding, max + padding];
}

/** SPEC §8.3 screen 4: "One chart per indicator with coloured threshold
 * bands in the background, personal baseline line, and markers for
 * symptom days." Every point here is a real saved value — nothing
 * generated (SPEC §16). */
export function TrendChart({
  label,
  unit,
  data,
  bands,
  baseline,
  symptomDates,
  height = 180,
}: TrendChartProps) {
  const [yMin, yMax] = computeDomain(data, bands);
  const hasAnyValue = data.some((d) => d.value !== undefined);

  if (!hasAnyValue) {
    return (
      <div className="flex h-[180px] items-center justify-center text-sm text-zinc-500 dark:text-zinc-400">
        No {label.toLowerCase()} data in this range.
      </div>
    );
  }

  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <h3 className="text-sm font-medium">{label}</h3>
        {baseline !== undefined && (
          <span className="text-xs text-zinc-500 dark:text-zinc-400">
            Your normal: {baseline}
            {unit}
          </span>
        )}
      </div>
      <ResponsiveContainer width="100%" height={height}>
        <LineChart
          data={data}
          margin={{ top: 4, right: 8, bottom: 4, left: 8 }}
        >
          {bands.map((band, i) => (
            <ReferenceArea
              key={i}
              y1={band.min ?? yMin}
              y2={band.max ?? yMax}
              fill={`var(${getStatusConfig(band.status).colorVar})`}
              fillOpacity={0.12}
              strokeOpacity={0}
            />
          ))}
          <XAxis dataKey="date" tick={{ fontSize: 10 }} minTickGap={20} />
          <YAxis domain={[yMin, yMax]} tick={{ fontSize: 10 }} width={32} />
          <Tooltip formatter={(value) => [`${value}${unit}`, label]} />
          {baseline !== undefined && (
            <ReferenceLine
              y={baseline}
              stroke="var(--foreground)"
              strokeDasharray="4 4"
              strokeOpacity={0.6}
            />
          )}
          <Line
            dataKey="value"
            stroke="var(--foreground)"
            strokeWidth={2}
            connectNulls
            dot={(props: {
              cx?: number;
              cy?: number;
              payload?: TrendPoint;
            }) => {
              const { cx, cy, payload } = props;
              if (
                cx === undefined ||
                cy === undefined ||
                !payload ||
                payload.value === undefined
              ) {
                return <g key={`dot-${payload?.date}`} />;
              }
              const isSymptomDay = symptomDates.has(payload.date);
              return (
                <circle
                  key={`dot-${payload.date}`}
                  cx={cx}
                  cy={cy}
                  r={isSymptomDay ? 4 : 2.5}
                  fill={
                    isSymptomDay
                      ? "var(--color-status-yellow)"
                      : "var(--foreground)"
                  }
                  stroke={isSymptomDay ? "var(--foreground)" : "none"}
                  strokeWidth={isSymptomDay ? 1 : 0}
                />
              );
            }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
