"use client";

import {
  Bar,
  BarChart,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export interface ExercisePoint {
  date: string;
  resistance: number | undefined;
  cardio: number | undefined;
}

/** SPEC §8.3 screen 4: "exercise stacked bars (resistance/cardio)". */
export function ExerciseBars({
  data,
  height = 180,
}: {
  data: ExercisePoint[];
  height?: number;
}) {
  const hasAnyValue = data.some(
    (d) => d.resistance !== undefined || d.cardio !== undefined,
  );

  if (!hasAnyValue) {
    return (
      <div className="flex h-[180px] items-center justify-center text-sm text-zinc-500 dark:text-zinc-400">
        No exercise data in this range.
      </div>
    );
  }

  return (
    <div>
      <h3 className="mb-1 text-sm font-medium">Exercise (minutes)</h3>
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data} margin={{ top: 4, right: 8, bottom: 4, left: 8 }}>
          <XAxis dataKey="date" tick={{ fontSize: 10 }} minTickGap={20} />
          <YAxis tick={{ fontSize: 10 }} width={32} />
          <Tooltip />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Bar
            name="Resistance"
            dataKey="resistance"
            stackId="exercise"
            fill="var(--foreground)"
            fillOpacity={0.6}
          />
          <Bar
            name="Cardio"
            dataKey="cardio"
            stackId="exercise"
            fill="var(--color-status-yellow)"
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
