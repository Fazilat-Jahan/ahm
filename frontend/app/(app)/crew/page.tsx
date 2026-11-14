import { CrewScreen } from "@/components/crew/CrewScreen";

/** Dedicated route for the Crew screen (SPEC §8.2 folder structure). In
 * practice, the (app) layout already falls back to <CrewScreen /> on every
 * route whenever no astronaut is unlocked, so this is mostly reached by a
 * deliberate link (e.g. the commander/surgeon crew overview in a later
 * chunk) rather than the lock fallback itself. */
export default function CrewPage() {
  return <CrewScreen />;
}
