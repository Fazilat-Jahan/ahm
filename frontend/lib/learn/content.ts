import { readFile } from "node:fs/promises";
import path from "node:path";
import { getLearnTopic, type LearnTopic } from "@/config/learn";
import {
  assertLearnSections,
  parseLearnMarkdown,
  type LearnSection,
} from "./parse";

/**
 * Reads one `content/learn/<slug>.md` from disk. Server-only: it runs at
 * build time, when the Learn pages are pre-rendered to static HTML, so
 * the browser never fetches a Markdown file (and the page works offline
 * like any other screen). Also used directly by the unit tests.
 */
export interface LearnContent {
  topic: LearnTopic;
  sections: LearnSection[];
}

export async function loadLearnContent(
  slug: string,
): Promise<LearnContent | undefined> {
  const topic = getLearnTopic(slug);
  if (!topic) return undefined;
  const file = path.join(process.cwd(), "content", "learn", `${topic.slug}.md`);
  const sections = parseLearnMarkdown(await readFile(file, "utf8"));
  assertLearnSections(topic.slug, sections);
  return { topic, sections };
}
