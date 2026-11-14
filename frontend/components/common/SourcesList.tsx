import type { SourceLink } from "@/content/sources";

interface SourcesListProps {
  sources: readonly SourceLink[];
  /** Heading level: `h2` on a page footer, `h3` inside a panel. */
  as?: "h2" | "h3";
}

/**
 * SPEC §E.5: "every Learn page, risk card and body-region panel has a
 * Sources list with the exact links used." Plain links that open in a new
 * tab and need internet; the app itself fetches nothing from them.
 */
export function SourcesList({ sources, as: Heading = "h3" }: SourcesListProps) {
  if (sources.length === 0) return null;
  return (
    <div className="flex flex-col gap-1">
      <Heading className="text-sm font-medium">Sources</Heading>
      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        Background reading. These links need an internet connection; the text
        here is our own summary, not NASA wording.
      </p>
      <ul className="flex flex-col text-sm">
        {sources.map((source) => (
          <li key={source.url}>
            <a
              href={source.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex min-h-11 items-center underline"
            >
              {source.label}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
