"use client";

import { useEffect, useState } from "react";
import { Wifi, WifiOff } from "lucide-react";

/** SPEC §5.1 item 6: "visible offline/online badge. Offline is a normal
 * state, not an error." No sync exists yet (C14), so "last synced" is
 * honestly described as not set up rather than a fabricated timestamp. */
export function OfflineBadge() {
  // Lazy initializer, not an effect: this is a plain read of the current
  // value, not a setState call, so there's nothing for the effect below to
  // race against on first render.
  const [online, setOnline] = useState(() =>
    typeof navigator === "undefined" ? true : navigator.onLine,
  );

  useEffect(() => {
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  return (
    <span className="inline-flex items-center gap-1.5 text-sm text-zinc-500 dark:text-zinc-400">
      {online ? (
        <Wifi size={16} aria-hidden="true" />
      ) : (
        <WifiOff size={16} aria-hidden="true" />
      )}
      {online ? "Online" : "Offline"}
      <span className="text-zinc-400 dark:text-zinc-600">
        · Sync not set up yet
      </span>
    </span>
  );
}
