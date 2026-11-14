import type { TrendAlert } from "@/lib/rules/types";
import { StatusBadge } from "@/components/status/StatusBadge";

/** SPEC §8.3 screen 4: "Trend alerts list under the charts." */
export function TrendAlertsList({ trends }: { trends: TrendAlert[] }) {
  if (trends.length === 0) {
    return (
      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        No trend alerts right now.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {trends.map((trend) => (
        <li
          key={trend.id}
          className="flex items-start justify-between gap-3 rounded-md border border-border p-3 text-sm"
        >
          <span>{trend.message}</span>
          <StatusBadge status={trend.status} size="sm" />
        </li>
      ))}
    </ul>
  );
}
