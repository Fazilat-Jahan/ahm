import type { Status } from "@/config/thresholds";

export const STATUS_RANK: Record<Status, number> = {
  green: 0,
  yellow: 1,
  red: 2,
  critical: 3,
};

export function worst(a: Status, b: Status): Status {
  return STATUS_RANK[a] >= STATUS_RANK[b] ? a : b;
}

/** Picks the lower-severity of two statuses. Used when the SPEC states an
 * ambiguous "A/B" result with no stated differentiator (see DECISIONS.md) —
 * we never invent extra severity beyond what a rule unambiguously states. */
export function milder(a: Status, b: Status): Status {
  return STATUS_RANK[a] <= STATUS_RANK[b] ? a : b;
}
