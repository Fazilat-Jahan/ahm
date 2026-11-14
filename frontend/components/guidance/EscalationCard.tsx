import type { Escalation, EscalationLevel } from "@/lib/rules/types";

const LEVEL_COLOR_VAR: Record<EscalationLevel, string | null> = {
  none: null,
  self_care: "--color-status-yellow",
  contact_surgeon: "--color-status-red",
  emergency: "--color-status-critical",
};

const LEVEL_HEADING: Record<EscalationLevel, string> = {
  none: "",
  self_care: "Self-care",
  contact_surgeon: "Contact the flight surgeon",
  emergency: "Emergency",
};

/** SPEC §8.3 screen 1: "Escalation card pinned at top if red/critical";
 * CLAUDE.md §2 rule 9: red/critical always shows an escalation block.
 * Shared by the result screen (C4) and the Home dashboard (C5) so the
 * styling/text can't drift between them. */
export function EscalationCard({
  escalation,
}: {
  escalation: Escalation | null;
}) {
  if (!escalation || escalation.level === "none") return null;

  const colorVar = LEVEL_COLOR_VAR[escalation.level];
  const isEmergency = escalation.level === "emergency";

  return (
    <div
      role={isEmergency ? "alert" : undefined}
      className={`rounded-md border p-4 ${isEmergency ? "status-pulse" : ""}`}
      style={{
        borderColor: colorVar ? `var(${colorVar})` : "var(--border)",
        backgroundColor: colorVar
          ? `color-mix(in srgb, var(${colorVar}) 12%, var(--surface))`
          : "var(--surface)",
      }}
    >
      <p
        className="font-medium"
        style={{ color: colorVar ? `var(${colorVar})` : undefined }}
      >
        {LEVEL_HEADING[escalation.level]}
      </p>
      <p className="mt-1 text-sm">{escalation.text}</p>
    </div>
  );
}
