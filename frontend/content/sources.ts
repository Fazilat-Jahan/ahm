import type { Hazard } from "@/config/thresholds";

/**
 * Reference links from SPEC Appendix E (E.1 hazards, E.2 per-risk pages).
 * Used for the "Sources" list SPEC §E.5 requires on body-region panels
 * (C8) and, later, Learn pages and risk cards (C10).
 *
 * These are links only: nothing is fetched from them at runtime, and no
 * NASA text is copied into the app. All explanatory text elsewhere is
 * written in our own words.
 */
export interface SourceLink {
  label: string;
  url: string;
}

export const HAZARD_SOURCES: Record<Hazard, SourceLink> = {
  radiation: {
    label: "NASA HRP: Space radiation hazard",
    url: "https://www.nasa.gov/hrp/hazard-space-radiation/",
  },
  isolation: {
    label: "NASA HRP: Isolation and confinement hazard",
    url: "https://www.nasa.gov/hrp/hazard-isolation-and-confinement/",
  },
  distance: {
    label: "NASA HRP: Distance from Earth hazard",
    url: "https://www.nasa.gov/hrp/hazard-distance-from-earth/",
  },
  gravity: {
    label: "NASA HRP: Gravity fields hazard",
    url: "https://www.nasa.gov/hrp/hazard-gravity-fields/",
  },
  closed_environment: {
    label: "NASA HRP: Hostile/closed environments hazard",
    url: "https://www.nasa.gov/hrp/hazard-hostile-closed-environments/",
  },
};

/** Keyed by the risk number in SPEC §2.1 / `content/risks.ts`. */
export const RISK_SOURCES: Record<number, SourceLink> = {
  1: {
    label: "NASA: Risk of altered immune system responses",
    url: "https://www.nasa.gov/reference/risk-of-altered-immune-system-responses/",
  },
  2: {
    label: "NASA: Risk of altered sensorimotor and vestibular function",
    url: "https://www.nasa.gov/reference/risk-of-altered-sensorimotor-and-vestibular-function/",
  },
  3: {
    label: "NASA: Risk of cardiovascular adaptations",
    url: "https://www.nasa.gov/reference/risk-of-cardiovascular-adaptations/",
  },
  4: {
    label: "NASA: Risk of decompression sickness",
    url: "https://www.nasa.gov/reference/risk-of-decompression-sickness/",
  },
  5: {
    label: "NASA: Risk of host-microorganism interactions",
    url: "https://www.nasa.gov/reference/risk-of-host-microorganism-interactions/",
  },
  6: {
    label: "NASA: Risk of hypoxia",
    url: "https://www.nasa.gov/reference/risk-of-hypoxia/",
  },
  7: {
    label: "NASA: Risk of inadequate food and nutrition",
    url: "https://www.nasa.gov/reference/risk-of-inadequate-food-and-nutrition/",
  },
  8: {
    label: "NASA: Risk of injury and compromised performance from EVA",
    url: "https://www.nasa.gov/reference/risk-of-injury-and-compromised-performance-from-extravehicular-activity-eva/",
  },
  9: {
    label:
      "NASA: Risk of reduced cardiorespiratory and musculoskeletal fitness",
    url: "https://www.nasa.gov/reference/risk-of-reduced-cardiorespiratory-and-musculoskeletal-fitness/",
  },
  10: {
    label: "NASA: Risk of spaceflight associated neuro-ocular syndrome (SANS)",
    url: "https://www.nasa.gov/reference/risk-of-spaceflight-associated-neuro-ocular-syndrome-sans/",
  },
  11: {
    label: "NASA: Risk of spaceflight-induced bone changes",
    url: "https://www.nasa.gov/reference/risk-of-spaceflight-induced-bone-changes/",
  },
  12: {
    label: "NASA: Risk of behavioral conditions and psychiatric disorders",
    url: "https://www.nasa.gov/reference/risk-of-behavioral-conditions-and-psychiatric-disorders/",
  },
  13: {
    label: "NASA: Risk of inadequate teamwork",
    url: "https://www.nasa.gov/reference/risk-of-inadequate-teamwork/",
  },
  14: {
    label: "NASA: Risk from inadequate sleep and irregular schedules",
    url: "https://www.nasa.gov/reference/risk-from-inadequate-sleep-and-irregular-schedules/",
  },
  15: {
    label: "NASA: Risk of injury from dynamic loads",
    url: "https://www.nasa.gov/reference/risk-of-injury-from-dynamic-loads/",
  },
  16: {
    label: "NASA: Risk of radiation-induced cancers",
    url: "https://www.nasa.gov/reference/risk-of-radiation-induced-cancers/",
  },
  17: {
    label: "NASA: Risk of inadequate systems operations support",
    url: "https://www.nasa.gov/reference/risk-of-inadequate-systems-operations-support/",
  },
};

/** SPEC Appendix E.1 overview pages. */
export const HRP_HAZARDS_SOURCE: SourceLink = {
  label: "NASA HRP: Five hazards of human spaceflight",
  url: "https://www.nasa.gov/hrp/hazards/",
};

export const HRP_RISKS_SOURCE: SourceLink = {
  label: "NASA HRP: Risks of human spaceflight (overview)",
  url: "https://www.nasa.gov/hrp/risks/",
};

/** SPEC Appendix E.3. */
export const CSA_RADIATION_SOURCE: SourceLink = {
  label: "Canadian Space Agency: Monitoring radiation for astronaut health",
  url: "https://www.asc-csa.gc.ca/eng/news/articles/2026/2026-02-26-monitoring-radiation-astronaut-health.asp",
};

/** De-duplicates by URL, keeping first-seen order. */
export function uniqueSources(sources: readonly SourceLink[]): SourceLink[] {
  const seen = new Set<string>();
  return sources.filter((s) => {
    if (seen.has(s.url)) return false;
    seen.add(s.url);
    return true;
  });
}
