import { AlertOctagon, AlertTriangle, CheckCircle2, Siren } from "lucide-react";
import type { Status } from "@/config/thresholds";

/** Colour + icon + text for every status, never colour alone (CLAUDE.md §2
 * rule 8). Icon mapping and the 4 hex tokens both match SPEC §8.4 exactly
 * (not an approximate Tailwind shade) — defined once in app/globals.css
 * and referenced here via Tailwind's arbitrary-value syntax. Only
 * `critical` pulses: SPEC's "with a pulsing outline" reads as describing
 * the single most urgent state, not all four — a pulsing yellow/green
 * would be visually noisy for a routine result (see docs/DECISIONS.md). */
const STATUS_CONFIG: Record<
  Status,
  { label: string; icon: typeof CheckCircle2; colorVar: string; pulse: boolean }
> = {
  green: {
    label: "Green",
    icon: CheckCircle2,
    colorVar: "--color-status-green",
    pulse: false,
  },
  yellow: {
    label: "Yellow",
    icon: AlertTriangle,
    colorVar: "--color-status-yellow",
    pulse: false,
  },
  red: {
    label: "Red",
    icon: AlertOctagon,
    colorVar: "--color-status-red",
    pulse: false,
  },
  critical: {
    label: "Critical",
    icon: Siren,
    colorVar: "--color-status-critical",
    pulse: true,
  },
};

export function StatusBadge({
  status,
  size = "md",
}: {
  status: Status;
  size?: "sm" | "md" | "lg";
}) {
  const { label, icon: Icon, colorVar, pulse } = STATUS_CONFIG[status];
  const sizeClass =
    size === "lg"
      ? "px-4 py-2 text-base gap-2"
      : size === "sm"
        ? "px-2 py-1 text-xs gap-1"
        : "px-3 py-1.5 text-sm gap-1.5";
  const iconSize = size === "lg" ? 22 : size === "sm" ? 14 : 18;

  return (
    <span
      className={`inline-flex items-center rounded-full border bg-surface font-medium ${sizeClass} ${pulse ? "status-pulse" : ""}`}
      style={{
        color: `var(${colorVar})`,
        borderColor: `var(${colorVar})`,
      }}
    >
      <Icon size={iconSize} aria-hidden="true" />
      {label}
    </span>
  );
}

export function getStatusConfig(status: Status) {
  return STATUS_CONFIG[status];
}
