/**
 * Personal baselines (SPEC §17 item 5): "after 14 days, compute per-user
 * baselines (median HR, BP, sleep) and use them in trend rules; show 'vs
 * your normal'." Median, not mean — pure and exported so both the rule
 * engine (`trends.ts`'s `TRD-HR-01`) and the Trends charts (C6) compute it
 * the same way.
 */
export function median(values: number[]): number | undefined {
  if (values.length === 0) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

/** Median of the given values if there are at least `minDays` of them
 * (SPEC §16: "personal baselines need 14 logs"), else undefined. */
export function computeBaseline(
  values: (number | undefined)[],
  minDays = 14,
): number | undefined {
  const defined = values.filter((v): v is number => v !== undefined);
  if (defined.length < minDays) return undefined;
  return median(defined);
}
