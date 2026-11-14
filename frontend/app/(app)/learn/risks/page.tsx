import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { getLearnTopicForIndicator } from "@/config/learn";
import { RISKS } from "@/content/risks";
import {
  getRiskContactGuidance,
  getRiskInputLabel,
  RISK_COVERAGE_LABELS,
  RISK_CREW_ACTIONS,
} from "@/content/riskGuidance";
import { HRP_RISKS_SOURCE, RISK_SOURCES } from "@/content/sources";
import { HAZARD_LABELS } from "@/lib/db/labels";
import { SourcesList } from "@/components/common/SourcesList";

/** SPEC §8.3 screen 5 / §2.1: every NASA HRP risk, each with a short
 * explanation in our own words, the hazard behind it, the inputs in this
 * app that relate to it, what the crew can do, when to contact the flight
 * surgeon, and its source link. */
export default function RisksPage() {
  return (
    <div className="mx-auto flex max-w-lg flex-col gap-6 px-6 py-8">
      <Link
        href="/learn"
        className="flex min-h-11 items-center gap-1 self-start text-sm text-zinc-600 dark:text-zinc-400"
      >
        <ChevronLeft size={16} aria-hidden="true" />
        Learn
      </Link>

      <div>
        <h1 className="text-xl font-semibold">Risks of human spaceflight</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          The NASA Human Research Program lists these health and performance
          risks. Each card says, in our own words, what the risk is and how this
          app relates to it.
        </p>
      </div>

      <ol className="flex flex-col gap-4">
        {RISKS.map((risk) => {
          const learnLinks = new Map<string, string>();
          for (const input of risk.trackedVia) {
            const topic = getLearnTopicForIndicator(input);
            if (topic) learnLinks.set(topic.slug, topic.title);
          }
          return (
            <li
              key={risk.id}
              id={`risk-${risk.id}`}
              className="flex scroll-mt-4 flex-col gap-3 rounded-lg border border-zinc-200 p-4 text-sm dark:border-zinc-800"
            >
              <div className="flex flex-col gap-1">
                <h2 className="text-base font-medium">
                  {risk.id}. {risk.name}
                </h2>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  {RISK_COVERAGE_LABELS[risk.coverage]}
                </p>
              </div>

              <p className="text-zinc-700 dark:text-zinc-300">{risk.summary}</p>

              <div className="flex flex-col gap-1">
                <h3 className="font-medium">Hazards behind it</h3>
                <ul className="flex flex-wrap gap-1.5">
                  {risk.hazards.map((hazard) => (
                    <li
                      key={hazard}
                      className="rounded-full border border-zinc-300 px-2 py-0.5 text-xs text-zinc-600 dark:border-zinc-700 dark:text-zinc-400"
                    >
                      {HAZARD_LABELS[hazard]}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="flex flex-col gap-1">
                <h3 className="font-medium">Inputs in this app</h3>
                {risk.trackedVia.length > 0 ? (
                  <p className="text-zinc-700 dark:text-zinc-300">
                    {risk.trackedVia.map(getRiskInputLabel).join(", ")}
                  </p>
                ) : (
                  <p className="text-zinc-500 dark:text-zinc-400">
                    None. This app does not track this risk.
                  </p>
                )}
                {risk.ruleIds.length > 0 && (
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    Rules: {risk.ruleIds.join(", ")}
                  </p>
                )}
                {learnLinks.size > 0 && (
                  <ul className="flex flex-wrap gap-x-4">
                    {[...learnLinks].map(([slug, title]) => (
                      <li key={slug}>
                        <Link
                          href={`/learn/${slug}`}
                          className="flex min-h-11 items-center underline"
                        >
                          Learn: {title}
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="flex flex-col gap-1">
                <h3 className="font-medium">What the crew can do</h3>
                <p className="text-zinc-700 dark:text-zinc-300">
                  {RISK_CREW_ACTIONS[risk.id]}
                </p>
              </div>

              <div className="flex flex-col gap-1">
                <h3 className="font-medium">
                  When to contact the flight surgeon
                </h3>
                <p className="text-zinc-700 dark:text-zinc-300">
                  {getRiskContactGuidance(risk)}
                </p>
              </div>

              <SourcesList sources={[RISK_SOURCES[risk.id]]} />
            </li>
          );
        })}
      </ol>

      <SourcesList
        as="h2"
        sources={[HRP_RISKS_SOURCE, ...RISKS.map((r) => RISK_SOURCES[r.id])]}
      />
    </div>
  );
}
