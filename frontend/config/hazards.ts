import type { Hazard } from "./thresholds";

/**
 * The five hazards of human spaceflight (SPEC §2), in our own words, for
 * the Learn screens. `label` matches `HAZARD_LABELS` in lib/db/labels.ts.
 * Sources for each hazard are in `content/sources.ts` (`HAZARD_SOURCES`).
 */
export interface HazardInfo {
  id: Hazard;
  label: string;
  /** What the hazard does to the body or the crew. */
  effect: string;
  /** What this app tracks or does about it. */
  appResponse: string;
}

export const HAZARDS: HazardInfo[] = [
  {
    id: "radiation",
    label: "Space radiation",
    effect:
      "Outside the protection of Earth, radiation can damage cells, change how the immune system works and add to long-term health risk.",
    appResponse:
      "Tracks your dosimeter reading against the mission budget, if you have one, and checks for signs of infection.",
  },
  {
    id: "isolation",
    label: "Isolation & confinement",
    effect:
      "A small crew in a small space for a long time can wear down mood, sleep, concentration and how the crew gets along.",
    appResponse:
      "Daily mood, stress and sleep check, sleep and mood trend alerts, and prompts to talk to a crewmate.",
  },
  {
    id: "distance",
    label: "Distance from Earth",
    effect:
      "The further the crew travels, the longer help takes to arrive, until real-time medical support is not possible.",
    appResponse:
      "Works with no internet, explains every result, and shows clear steps for when to contact the flight surgeon.",
  },
  {
    id: "gravity",
    label: "Altered gravity",
    effect:
      "In microgravity or partial gravity, bones and muscles get less load, body fluid moves toward the head, the heart works differently, and vision and balance can change.",
    appResponse:
      "Tracks heart rate, blood pressure and exercise minutes, and asks about vision, back pain and motion sickness.",
  },
  {
    id: "closed_environment",
    label: "Closed environment",
    effect:
      "The crew shares one sealed habitat: its air, its microbes, its temperature and a limited food supply.",
    appResponse:
      "Tracks blood oxygen, temperature, water intake and glucose, and links headaches to cabin air.",
  },
];

export function getHazardInfo(id: Hazard): HazardInfo | undefined {
  return HAZARDS.find((h) => h.id === id);
}
