"use client";

import { useEffect, useState } from "react";

/**
 * The current time as React state, refreshed on an interval — for screens
 * whose content depends on the clock itself and not only on saved data
 * (e.g. "the check-in reminder was due more than 2 h ago"). Without this
 * such a screen would stay frozen at whatever time it first rendered.
 */
export function useNow(intervalMs = 30_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const interval = window.setInterval(() => setNow(new Date()), intervalMs);
    return () => window.clearInterval(interval);
  }, [intervalMs]);
  return now;
}
