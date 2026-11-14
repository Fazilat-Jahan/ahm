import type { Environment } from "@/lib/rules/types";
import type { Hazard } from "@/config/thresholds";
import type { AstronautRole } from "./schema";

export const ENVIRONMENT_LABELS: Record<Environment, string> = {
  spacecraft: "Spacecraft (transit)",
  station: "Space station",
  rover: "Rover",
  moon_base: "Moon base",
  mars_base: "Mars base",
};

/** SPEC §2's own hazard table headings — generic category names, not NASA
 * prose, so reusing them verbatim as UI labels isn't copying source text. */
export const HAZARD_LABELS: Record<Hazard, string> = {
  radiation: "Space radiation",
  isolation: "Isolation & confinement",
  distance: "Distance from Earth",
  gravity: "Altered gravity",
  closed_environment: "Closed environment",
};

export const ROLE_LABELS: Record<AstronautRole, string> = {
  astronaut: "Astronaut",
  commander: "Commander",
  surgeon: "Surgeon",
  admin: "Admin",
};
