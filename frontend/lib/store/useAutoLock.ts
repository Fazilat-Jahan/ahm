"use client";

import { useEffect } from "react";
import { useActiveAstronautStore } from "./activeAstronaut";

/**
 * Not yet user-configurable (SPEC §8.3 screen 0 says "configurable") — a
 * Settings screen to adjust this is deferred to a later chunk; see
 * docs/DECISIONS.md.
 */
export const AUTO_LOCK_MS = 5 * 60 * 1000;
const CHECK_INTERVAL_MS = 15_000;
const ACTIVITY_EVENTS = ["pointerdown", "keydown", "touchstart"] as const;

/** Locks the active astronaut after `AUTO_LOCK_MS` of inactivity. */
export function useAutoLock(enabled: boolean): void {
  const touch = useActiveAstronautStore((s) => s.touch);
  const lock = useActiveAstronautStore((s) => s.lock);

  useEffect(() => {
    if (!enabled) return;

    const handleActivity = () => touch();
    for (const event of ACTIVITY_EVENTS) {
      window.addEventListener(event, handleActivity);
    }

    const interval = window.setInterval(() => {
      const { lastActivityAt } = useActiveAstronautStore.getState();
      if (Date.now() - lastActivityAt >= AUTO_LOCK_MS) lock();
    }, CHECK_INTERVAL_MS);

    return () => {
      for (const event of ACTIVITY_EVENTS) {
        window.removeEventListener(event, handleActivity);
      }
      window.clearInterval(interval);
    };
  }, [enabled, touch, lock]);
}
