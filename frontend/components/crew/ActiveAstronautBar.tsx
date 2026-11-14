"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { getDb } from "@/lib/db/schema";
import { getMissionDay } from "@/lib/time/missionDate";
import { useActiveAstronautStore } from "@/lib/store/activeAstronaut";

/** SPEC §8.3 screen 0: visible on every screen once unlocked. */
export function ActiveAstronautBar() {
  const activeId = useActiveAstronautStore((s) => s.activeAstronautId);
  const lock = useActiveAstronautStore((s) => s.lock);
  const astronaut = useLiveQuery(
    () => (activeId ? getDb().astronauts.get(activeId) : undefined),
    [activeId],
  );

  if (!astronaut) return null;

  const missionDay = getMissionDay(astronaut.missionStart);

  return (
    <div className="flex items-center justify-between gap-3 border-b border-zinc-200 px-4 py-2 text-sm dark:border-zinc-800">
      <span className="truncate font-medium">
        {astronaut.name} · {astronaut.crewCode} · Mission day {missionDay}
      </span>
      <button
        type="button"
        onClick={lock}
        className="min-h-11 shrink-0 px-2 text-zinc-600 underline dark:text-zinc-400"
      >
        Switch astronaut
      </button>
    </div>
  );
}
