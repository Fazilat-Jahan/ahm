"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { listReminderBanners } from "@/lib/db/reminderRepo";
import { useActiveAstronautStore } from "@/lib/store/activeAstronaut";
import { useNow } from "@/lib/time/useNow";

/** SPEC §8.4 layout: "bottom nav (Home, Check-in, Body, Trends, More)".
 * More opens `/settings`, a short menu of the remaining screens (Learn,
 * Environment, Reminders — see that page). `match` lists the routes that keep
 * the tab highlighted. */
const TABS = [
  { label: "Home", href: "/", match: ["/"] },
  { label: "Check-in", href: "/checkin", match: ["/checkin"] },
  { label: "Body", href: "/body", match: ["/body"] },
  { label: "Trends", href: "/trends", match: ["/trends"] },
  {
    label: "More",
    href: "/settings",
    match: [
      "/settings",
      "/reminders",
      "/learn",
      "/environment",
      "/rewards",
      "/sync",
      "/crew",
    ],
  },
] as const;

export function BottomNav() {
  const pathname = usePathname();
  const activeAstronautId = useActiveAstronautStore((s) => s.activeAstronautId);
  const now = useNow();
  // SPEC §9 fallback "badge on app open": how many of the active
  // astronaut's reminders are due and not yet dismissed.
  const dueCount = useLiveQuery(
    async () =>
      activeAstronautId
        ? (await listReminderBanners(now, activeAstronautId)).length
        : 0,
    [activeAstronautId, now],
  );

  return (
    <nav className="fixed inset-x-0 bottom-0 flex border-t border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
      {TABS.map((tab) => {
        const isCurrent = (tab.match as readonly string[]).some(
          (m) => pathname === m || (m !== "/" && pathname.startsWith(`${m}/`)),
        );
        const showBadge = tab.href === "/settings" && (dueCount ?? 0) > 0;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={isCurrent ? "page" : undefined}
            className={`min-h-11 flex-1 py-3 text-center text-sm ${
              isCurrent ? "font-semibold" : "text-zinc-500 dark:text-zinc-400"
            }`}
          >
            {tab.label}
            {showBadge && (
              <span className="ml-1 inline-flex min-w-5 items-center justify-center rounded-full bg-zinc-900 px-1 text-xs font-semibold text-white dark:bg-zinc-100 dark:text-zinc-900">
                {dueCount}
                <span className="sr-only"> reminders due</span>
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
