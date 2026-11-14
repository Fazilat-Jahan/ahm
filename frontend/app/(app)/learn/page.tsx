import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { HAZARDS } from "@/config/hazards";
import { LEARN_TOPICS } from "@/config/learn";
import {
  HAZARD_SOURCES,
  HRP_HAZARDS_SOURCE,
  HRP_RISKS_SOURCE,
} from "@/content/sources";
import { SourcesList } from "@/components/common/SourcesList";

const rowClass =
  "flex min-h-11 items-center justify-between gap-3 rounded-lg border border-zinc-200 px-4 py-3 text-sm dark:border-zinc-800";

/** SPEC §8.3 screen 5: Learn. Static reference content only — nothing
 * here is about any one astronaut, so there is no personal data and no
 * empty state. */
export default function LearnPage() {
  return (
    <div className="mx-auto flex max-w-lg flex-col gap-8 px-6 py-8">
      <div>
        <h1 className="text-xl font-semibold">Learn</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          What each measurement means, why it matters in space, and how to take
          it.
        </p>
      </div>

      <section
        aria-labelledby="learn-indicators"
        className="flex flex-col gap-2"
      >
        <h2 id="learn-indicators" className="font-medium">
          Measurements
        </h2>
        <ul className="flex flex-col gap-2">
          {LEARN_TOPICS.map((topic) => (
            <li key={topic.slug}>
              <Link href={`/learn/${topic.slug}`} className={rowClass}>
                <span className="font-medium">{topic.title}</span>
                <ChevronRight size={18} aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="learn-risks" className="flex flex-col gap-2">
        <h2 id="learn-risks" className="font-medium">
          Spaceflight health risks
        </h2>
        <Link href="/learn/risks" className={rowClass}>
          <span>
            <span className="block font-medium">
              Risks of human spaceflight
            </span>
            <span className="block text-zinc-600 dark:text-zinc-400">
              The NASA Human Research Program risk list and how this app relates
              to each one
            </span>
          </span>
          <ChevronRight size={18} aria-hidden="true" className="shrink-0" />
        </Link>
      </section>

      <section aria-labelledby="learn-hazards" className="flex flex-col gap-2">
        <h2 id="learn-hazards" className="font-medium">
          The five hazards of spaceflight
        </h2>
        <ul className="flex flex-col gap-2">
          {HAZARDS.map((hazard) => (
            <li
              key={hazard.id}
              className="flex flex-col gap-1 rounded-lg border border-zinc-200 p-4 text-sm dark:border-zinc-800"
            >
              <h3 className="font-medium">{hazard.label}</h3>
              <p className="text-zinc-600 dark:text-zinc-400">
                {hazard.effect}
              </p>
              <p>
                <span className="font-medium">In this app: </span>
                {hazard.appResponse}
              </p>
            </li>
          ))}
        </ul>
      </section>

      <SourcesList
        as="h2"
        sources={[
          HRP_HAZARDS_SOURCE,
          ...HAZARDS.map((h) => HAZARD_SOURCES[h.id]),
          HRP_RISKS_SOURCE,
        ]}
      />
    </div>
  );
}
