"use client";

import { TrendsView } from "@/components/charts/TrendsView";
import { useActiveAstronautStore } from "@/lib/store/activeAstronaut";

/** SPEC §8.3 screen 4: the active astronaut's own trends. */
export default function TrendsPage() {
  const activeAstronautId = useActiveAstronautStore((s) => s.activeAstronautId);
  if (!activeAstronautId) return null;
  return <TrendsView astronautId={activeAstronautId} />;
}
