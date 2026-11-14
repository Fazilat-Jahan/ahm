"use client";

import { BodyView } from "@/components/body3d/BodyView";
import { useActiveAstronautStore } from "@/lib/store/activeAstronaut";

/** SPEC §8.3 screen 3: the active astronaut's own body map. */
export default function BodyPage() {
  const activeAstronautId = useActiveAstronautStore((s) => s.activeAstronautId);
  if (!activeAstronautId) return null;
  return <BodyView astronautId={activeAstronautId} />;
}
