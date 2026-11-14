/**
 * Learn topics (SPEC §8.3 screen 5). One topic = one `/learn/<slug>` page
 * and one `content/learn/<slug>.md` file.
 *
 * The .md file holds only prose (what it is, why it matters in space,
 * when to worry). Everything that must stay in step with the rule engine
 * — how-to-measure steps, ranges, per-status tips, hazards — is read from
 * `config/thresholds.ts` through `indicatorIds`, never retyped in content.
 */
export interface LearnTopic {
  slug: string;
  title: string;
  /** `config/thresholds.ts` indicator ids shown on this page. */
  indicatorIds: string[];
  /** SPEC §2.1 risk numbers this topic relates to (drives Sources). */
  riskIds: number[];
  /** Adds the CSA radiation-monitoring source (SPEC Appendix E.3). */
  usesCsaRadiationSource?: boolean;
}

export const LEARN_TOPICS: LearnTopic[] = [
  {
    slug: "heart-rate",
    title: "Resting heart rate",
    indicatorIds: ["heart_rate"],
    riskIds: [3],
  },
  {
    slug: "blood-pressure",
    title: "Blood pressure",
    indicatorIds: ["bp_systolic", "bp_diastolic"],
    riskIds: [3],
  },
  {
    slug: "glucose",
    title: "Fasting blood glucose",
    indicatorIds: ["glucose_mgdl"],
    riskIds: [7],
  },
  {
    slug: "temperature",
    title: "Body temperature",
    indicatorIds: ["temperature_c"],
    riskIds: [1, 5],
  },
  {
    slug: "blood-oxygen",
    title: "Blood oxygen (SpO2)",
    indicatorIds: ["spo2"],
    riskIds: [6],
  },
  {
    slug: "sleep",
    title: "Sleep",
    indicatorIds: ["sleep_hours"],
    riskIds: [14, 12],
  },
  { slug: "mood", title: "Mood", indicatorIds: ["mood"], riskIds: [12] },
  {
    slug: "exercise",
    title: "Exercise",
    indicatorIds: ["exercise_minutes"],
    riskIds: [9, 11],
  },
  {
    slug: "hydration",
    title: "Hydration / water intake",
    indicatorIds: ["water_ml"],
    riskIds: [7],
  },
  {
    slug: "radiation",
    title: "Radiation dose",
    indicatorIds: ["radiation_dose_pct"],
    riskIds: [16],
    usesCsaRadiationSource: true,
  },
  {
    slug: "team-relations",
    title: "Team relations",
    indicatorIds: ["team_relations"],
    riskIds: [13],
  },
];

export function getLearnTopic(slug: string): LearnTopic | undefined {
  return LEARN_TOPICS.find((t) => t.slug === slug);
}

/** The Learn page that covers a given indicator, if any. */
export function getLearnTopicForIndicator(
  indicatorId: string,
): LearnTopic | undefined {
  return LEARN_TOPICS.find((t) => t.indicatorIds.includes(indicatorId));
}
