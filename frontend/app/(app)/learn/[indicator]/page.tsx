import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { LEARN_TOPICS } from "@/config/learn";
import {
  getIndicatorConfig,
  type Hazard,
  type IndicatorConfig,
  type Status,
} from "@/config/thresholds";
import { RISKS } from "@/content/risks";
import {
  CSA_RADIATION_SOURCE,
  HAZARD_SOURCES,
  RISK_SOURCES,
  uniqueSources,
} from "@/content/sources";
import { HAZARD_LABELS } from "@/lib/db/labels";
import { loadLearnContent } from "@/lib/learn/content";
import { getRangeRows } from "@/lib/learn/parse";
import { SourcesList } from "@/components/common/SourcesList";
import { getStatusConfig } from "@/components/status/StatusBadge";

/** Every Learn page is pre-rendered at build time from
 * `content/learn/*.md`; an unknown slug is a 404, never rendered on
 * demand. */
export const dynamicParams = false;

export function generateStaticParams() {
  return LEARN_TOPICS.map((topic) => ({ indicator: topic.slug }));
}

const WORRY_STATUSES: Status[] = ["yellow", "red", "critical"];

function StatusLabel({ status }: { status: Status }) {
  const config = getStatusConfig(status);
  return (
    <span
      className="inline-flex items-center gap-1 font-medium"
      style={{ color: `var(${config.colorVar})` }}
    >
      <config.icon size={14} aria-hidden="true" />
      {config.label}
    </span>
  );
}

function Prose({ paragraphs }: { paragraphs: string[] }) {
  return (
    <div className="flex flex-col gap-2 text-sm text-zinc-700 dark:text-zinc-300">
      {paragraphs.map((paragraph) => (
        <p key={paragraph}>{paragraph}</p>
      ))}
    </div>
  );
}

/** SPEC §8.3 screen 5: "What it is, why it matters in space (hazard
 * badges), how to measure (numbered steps with an illustration
 * placeholder), normal ranges, when to worry." Prose comes from the .md
 * file; steps, ranges and per-status tips come from
 * `config/thresholds.ts`, so they can never drift from the rule engine. */
export default async function LearnTopicPage({
  params,
}: {
  params: Promise<{ indicator: string }>;
}) {
  const { indicator: slug } = await params;
  const content = await loadLearnContent(slug);
  if (!content) notFound();

  const { topic, sections } = content;
  const [whatItIs, whyInSpace, whenToWorry] = sections;
  const indicators = topic.indicatorIds
    .map((id) => getIndicatorConfig(id))
    .filter((c): c is IndicatorConfig => c !== undefined);
  const hazards = [
    ...new Set(indicators.flatMap((i) => i.hazards)),
  ] as Hazard[];
  const risks = RISKS.filter((r) => topic.riskIds.includes(r.id));
  const sources = uniqueSources([
    ...topic.riskIds.map((id) => RISK_SOURCES[id]),
    ...hazards.map((h) => HAZARD_SOURCES[h]),
    ...(topic.usesCsaRadiationSource ? [CSA_RADIATION_SOURCE] : []),
  ]);

  return (
    <article className="mx-auto flex max-w-lg flex-col gap-6 px-6 py-8">
      <Link
        href="/learn"
        className="flex min-h-11 items-center gap-1 self-start text-sm text-zinc-600 dark:text-zinc-400"
      >
        <ChevronLeft size={16} aria-hidden="true" />
        Learn
      </Link>

      <h1 className="text-xl font-semibold">{topic.title}</h1>

      <section className="flex flex-col gap-2">
        <h2 className="font-medium">{whatItIs.heading}</h2>
        <Prose paragraphs={whatItIs.paragraphs} />
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-medium">{whyInSpace.heading}</h2>
        <ul className="flex flex-wrap gap-1.5" aria-label="Related hazards">
          {hazards.map((hazard) => (
            <li
              key={hazard}
              className="rounded-full border border-zinc-300 px-2 py-0.5 text-xs text-zinc-600 dark:border-zinc-700 dark:text-zinc-400"
            >
              {HAZARD_LABELS[hazard]}
            </li>
          ))}
        </ul>
        <Prose paragraphs={whyInSpace.paragraphs} />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-medium">How to measure</h2>
        {indicators.map((indicator) => (
          <div key={indicator.id} className="flex flex-col gap-2">
            {indicators.length > 1 && (
              <h3 className="text-sm font-medium">{indicator.label}</h3>
            )}
            <ol className="flex list-decimal flex-col gap-1 pl-5 text-sm text-zinc-700 dark:text-zinc-300">
              {indicator.howToMeasure.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </div>
        ))}
        <div
          aria-hidden="true"
          className="flex h-24 items-center justify-center rounded-lg border border-dashed border-zinc-300 text-xs text-zinc-500 dark:border-zinc-700 dark:text-zinc-400"
        >
          Illustration to be added
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-medium">Ranges used by this app</h2>
        {indicators.map((indicator) => (
          <div key={indicator.id} className="flex flex-col gap-1">
            <h3 className="text-sm font-medium">
              {indicator.label} ({indicator.unit})
            </h3>
            <table className="w-full text-left text-sm">
              <thead className="sr-only">
                <tr>
                  <th scope="col">Status</th>
                  <th scope="col">Range</th>
                </tr>
              </thead>
              <tbody>
                {getRangeRows(indicator.bands).map((row) => (
                  <tr
                    key={row.status}
                    className="border-t border-zinc-200 dark:border-zinc-800"
                  >
                    <th scope="row" className="py-2 pr-3 font-normal">
                      <StatusLabel status={row.status} />
                    </th>
                    <td className="py-2">
                      {row.ranges.join(", or ")} {indicator.unit}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          These are starting defaults from general adult clinical references.
          They are not validated space-medicine limits
          {indicators.some((i) => !i.verified)
            ? " and have not yet been checked by a flight surgeon"
            : ""}
          . This app is not a medical device.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-medium">{whenToWorry.heading}</h2>
        <Prose paragraphs={whenToWorry.paragraphs} />
        {indicators.map((indicator) => {
          const rows = WORRY_STATUSES.filter(
            (status) => indicator.tips[status].length > 0,
          );
          if (rows.length === 0) return null;
          return (
            <div key={indicator.id} className="flex flex-col gap-1 text-sm">
              <h3 className="font-medium">
                What the app tells you
                {indicators.length > 1 ? `: ${indicator.label}` : ""}
              </h3>
              <ul className="flex flex-col gap-1">
                {rows.map((status) => (
                  <li key={status}>
                    <StatusLabel status={status} />
                    {": "}
                    {indicator.tips[status].join(" ")}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </section>

      {risks.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="font-medium">Related spaceflight risks</h2>
          <ul className="flex flex-col gap-2">
            {risks.map((risk) => (
              <li key={risk.id}>
                <Link
                  href={`/learn/risks#risk-${risk.id}`}
                  className="flex min-h-11 items-center rounded-lg border border-zinc-200 px-4 py-2 text-sm underline dark:border-zinc-800"
                >
                  Risk {risk.id}: {risk.name}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <SourcesList as="h2" sources={sources} />
    </article>
  );
}
