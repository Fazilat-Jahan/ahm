"use client";

import { HomeDashboard } from "@/components/dashboard/HomeDashboard";
import { useActiveAstronautStore } from "@/lib/store/activeAstronaut";

/** SPEC §8.3 screen 1: the active astronaut's own dashboard. */
export default function HomePage() {
  const activeAstronautId = useActiveAstronautStore((s) => s.activeAstronautId);
  if (!activeAstronautId) return null;
  return <HomeDashboard astronautId={activeAstronautId} />;
}
