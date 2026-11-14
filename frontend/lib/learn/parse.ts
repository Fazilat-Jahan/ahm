import type { Band, Status } from "@/config/thresholds";

/**
 * Minimal reader for `content/learn/*.md`. The files use a deliberately
 * tiny subset of Markdown — `## Heading` sections made of plain
 * paragraphs — so no Markdown library (and nothing from a CDN) is needed.
 * Pure: no file access here, see `content.ts` for that.
 */
export interface LearnSection {
  heading: string;
  paragraphs: string[];
}

/** Every Learn file must have exactly these sections, in this order
 * (SPEC §8.3 screen 5). "How to measure" and "Ranges" are not in the
 * file: they are rendered from `config/thresholds.ts`. */
export const LEARN_SECTION_HEADINGS = [
  "What it is",
  "Why it matters in space",
  "When to worry",
] as const;

export function parseLearnMarkdown(markdown: string): LearnSection[] {
  const sections: LearnSection[] = [];
  let current: LearnSection | null = null;
  let paragraph: string[] = [];

  const flush = () => {
    if (current && paragraph.length > 0) {
      current.paragraphs.push(paragraph.join(" "));
    }
    paragraph = [];
  };

  for (const rawLine of markdown.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.startsWith("## ")) {
      flush();
      current = { heading: line.slice(3).trim(), paragraphs: [] };
      sections.push(current);
    } else if (line === "") {
      flush();
    } else {
      paragraph.push(line);
    }
  }
  flush();
  return sections;
}

/** Throws with a clear message if a Learn file does not have the
 * required sections — caught at build time and by the unit tests. */
export function assertLearnSections(
  slug: string,
  sections: LearnSection[],
): void {
  const headings = sections.map((s) => s.heading);
  const expected = [...LEARN_SECTION_HEADINGS];
  if (
    headings.length !== expected.length ||
    headings.some((h, i) => h !== expected[i])
  ) {
    throw new Error(
      `content/learn/${slug}.md must have exactly these sections in order: ${expected.join(", ")}. Found: ${headings.join(", ") || "none"}.`,
    );
  }
  for (const section of sections) {
    if (section.paragraphs.length === 0) {
      throw new Error(
        `content/learn/${slug}.md: section "${section.heading}" is empty.`,
      );
    }
  }
}

const STATUS_ORDER: Status[] = ["green", "yellow", "red", "critical"];

/** "50 to 100", "131 or more", "39 or less" — the band exactly as it is
 * in `config/thresholds.ts`, never a second copy of the numbers. */
export function formatBandRange(band: Band): string {
  if (band.min !== undefined && band.max !== undefined) {
    return band.min === band.max
      ? String(band.min)
      : `${band.min} to ${band.max}`;
  }
  if (band.min !== undefined) return `${band.min} or more`;
  if (band.max !== undefined) return `${band.max} or less`;
  return "Any value";
}

export interface RangeRow {
  status: Status;
  ranges: string[];
}

/** Bands grouped by status, green first, for the Ranges table. */
export function getRangeRows(bands: readonly Band[]): RangeRow[] {
  const rows: RangeRow[] = [];
  for (const status of STATUS_ORDER) {
    const ranges = bands
      .filter((b) => b.status === status)
      .sort((a, b) => (a.min ?? -Infinity) - (b.min ?? -Infinity))
      .map(formatBandRange);
    if (ranges.length > 0) rows.push({ status, ranges });
  }
  return rows;
}
