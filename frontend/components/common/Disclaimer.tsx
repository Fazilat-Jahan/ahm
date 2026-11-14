/** Literal text from SPEC §15 — shown at onboarding and on result screens
 * (CLAUDE.md §2 rule 9). Do not paraphrase or shorten. */
export const DISCLAIMER_TEXT =
  "This tool supports self-assessment and does not replace a flight surgeon or medical care. Ranges are configurable defaults. If you feel unwell or a result is red or critical, follow your mission medical procedures and contact the flight surgeon.";

export function Disclaimer({ className = "" }: { className?: string }) {
  return (
    <p
      role="note"
      className={`text-sm leading-relaxed text-zinc-600 dark:text-zinc-400 ${className}`}
    >
      {DISCLAIMER_TEXT}
    </p>
  );
}
