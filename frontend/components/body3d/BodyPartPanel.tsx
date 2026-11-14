"use client";

import Link from "next/link";
import { getIndicatorConfig, type Status } from "@/config/thresholds";
import { getLearnTopicForIndicator, type LearnTopic } from "@/config/learn";
import { SourcesList } from "@/components/common/SourcesList";
import {
  getSymptomLabel,
  isSymptomId,
  type SymptomId,
} from "@/config/symptoms";
import { HAZARD_LABELS } from "@/lib/db/labels";
import type { SymptomEntry } from "@/lib/db/schema";
import type { Action, Escalation, IndicatorResult } from "@/lib/rules/types";
import type { BodyPart } from "@/config/bodyParts";
import { StatusBadge, getStatusConfig } from "@/components/status/StatusBadge";
import { ActionList } from "@/components/guidance/ActionList";
import { EscalationCard } from "@/components/guidance/EscalationCard";

interface BodyPartPanelProps {
  region: BodyPart;
  status: Status | null;
  indicators?: IndicatorResult[];
  recentSymptoms?: SymptomEntry[];
  actions?: Action[];
  escalation?: Escalation | null;
}

/** SPEC §8.3 screen 3's `BodyPartPanel` content, in the spec's own order:
 * function, spaceflight effect + hazard badges, related indicators with
 * this astronaut's real latest values, recent symptoms, "what to do now"
 * (+ escalation if red/critical), links to the Learn pages for its
 * indicators (C10), then the Sources list (SPEC §E.5). */
export function BodyPartPanel({
  region,
  status,
  indicators = [],
  recentSymptoms = [],
  actions = [],
  escalation = null,
}: BodyPartPanelProps) {
  const relatedIndicators = indicators.filter((i) =>
    region.indicators.includes(i.id),
  );
  const relatedSymptoms = recentSymptoms.filter(
    (s): s is SymptomEntry & { symptom: SymptomId } =>
      isSymptomId(s.symptom) && region.symptoms.includes(s.symptom),
  );
  const relatedActions = actions.filter((a) =>
    region.actionCategories.includes(a.category),
  );
  const showEscalation = status === "red" || status === "critical";
  // SPEC panel bullet 6: "Link to the Learn page for the related
  // indicators" (one link per Learn page, even if it covers two
  // indicators, e.g. blood pressure).
  const learnTopics = [
    ...new Map(
      region.indicators
        .map((id) => getLearnTopicForIndicator(id))
        .filter((t): t is LearnTopic => t !== undefined)
        .map((t) => [t.slug, t]),
    ).values(),
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">{region.label}</h2>
        {status && <StatusBadge status={status} size="sm" />}
      </div>

      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        {region.functionText}
      </p>

      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-medium">How spaceflight affects it</h3>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          {region.spaceEffectText}
        </p>
        <div className="flex flex-wrap gap-1.5">
          {region.hazards.map((hazard) => (
            <span
              key={hazard}
              className="rounded-full border border-zinc-300 px-2 py-0.5 text-xs text-zinc-600 dark:border-zinc-700 dark:text-zinc-400"
            >
              {HAZARD_LABELS[hazard]}
            </span>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-medium">Related indicators</h3>
        {region.indicators.length === 0 ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            This region has no direct measurement in the app — see symptoms
            below instead.
          </p>
        ) : relatedIndicators.length > 0 ? (
          <ul className="flex flex-col gap-1 text-sm">
            {relatedIndicators.map((indicator) => {
              const config = getIndicatorConfig(indicator.id);
              const indicatorStatus = getStatusConfig(indicator.status);
              return (
                <li
                  key={indicator.id}
                  className="flex items-center justify-between gap-2"
                >
                  <span>{config?.label ?? indicator.id}</span>
                  <span
                    className="flex items-center gap-1"
                    style={{ color: `var(${indicatorStatus.colorVar})` }}
                  >
                    <indicatorStatus.icon size={14} aria-hidden="true" />
                    {indicator.value}
                    {config?.unit ? ` ${config.unit}` : ""}
                  </span>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            No data yet.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-medium">Recent symptoms</h3>
        {relatedSymptoms.length > 0 ? (
          <ul className="flex flex-col gap-1 text-sm">
            {relatedSymptoms.map((s) => (
              <li
                key={s.id}
                className="flex items-center justify-between gap-2"
              >
                <span>{getSymptomLabel(s.symptom)}</span>
                <span className="text-zinc-500 dark:text-zinc-400">
                  {s.date}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            No symptoms reported recently.
          </p>
        )}
      </div>

      {relatedActions.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-medium">What to do now</h3>
          <ActionList actions={relatedActions} />
        </div>
      )}

      {showEscalation && <EscalationCard escalation={escalation} />}

      {learnTopics.length > 0 && (
        <div className="flex flex-col gap-1">
          <h3 className="text-sm font-medium">Learn more</h3>
          <ul className="flex flex-wrap gap-x-4 text-sm">
            {learnTopics.map((topic) => (
              <li key={topic.slug}>
                <Link
                  href={`/learn/${topic.slug}`}
                  className="flex min-h-11 items-center underline"
                >
                  {topic.title}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      <SourcesList sources={region.sources} />
    </div>
  );
}
