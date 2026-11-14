"use client";

import {
  Bar,
  ComposedChart,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export interface SleepMoodPoint {
  date: string;
  sleepHours: number | undefined;
  mood: number | undefined;
}

interface SleepBarsProps {
  data: SleepMoodPoint[];
  /** Personal median sleep baseline (SPEC §17 item 5), shown once there's
   * 14 days of data. */
  sleepBaseline?: number;
  height?: number;
}

/** SPEC §8.3 screen 4: "sleep + mood overlay" — sleep hours as bars, mood
 * (1-5) as an overlaid line on a secondary axis. */
export function SleepBars({
  data,
  sleepBaseline,
  height = 200,
}: SleepBarsProps) {
  const hasAnyValue = data.some(
    (d) => d.sleepHours !== undefined || d.mood !== undefined,
  );

  if (!hasAnyValue) {
    return (
      <div className="flex h-[200px] items-center justify-center text-sm text-zinc-500 dark:text-zinc-400">
        No sleep/mood data in this range.
      </div>
    );
  }

  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <h3 className="text-sm font-medium">Sleep and mood</h3>
        {sleepBaseline !== undefined && (
          <span className="text-xs text-zinc-500 dark:text-zinc-400">
            Your normal: {sleepBaseline}h
          </span>
        )}
      </div>
      <ResponsiveContainer width="100%" height={height}>
        <ComposedChart
          data={data}
          margin={{ top: 4, right: 8, bottom: 4, left: 8 }}
        >
          <XAxis dataKey="date" tick={{ fontSize: 10 }} minTickGap={20} />
          <YAxis
            yAxisId="sleep"
            domain={[0, 12]}
            tick={{ fontSize: 10 }}
            width={32}
          />
          <YAxis
            yAxisId="mood"
            orientation="right"
            domain={[1, 5]}
            tick={{ fontSize: 10 }}
            width={24}
          />
          <Tooltip />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          {sleepBaseline !== undefined && (
            <ReferenceLine
              yAxisId="sleep"
              y={sleepBaseline}
              stroke="var(--foreground)"
              strokeDasharray="4 4"
              strokeOpacity={0.6}
            />
          )}
          <Bar
            yAxisId="sleep"
            name="Sleep (h)"
            dataKey="sleepHours"
            fill="var(--foreground)"
            fillOpacity={0.3}
            barSize={10}
          />
          <Line
            yAxisId="mood"
            name="Mood"
            dataKey="mood"
            stroke="var(--color-status-yellow)"
            strokeWidth={2}
            connectNulls
            dot={{ r: 2.5 }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
