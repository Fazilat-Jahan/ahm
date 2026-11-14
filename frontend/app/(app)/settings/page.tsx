"use client";

import Link from "next/link";
import {
  Award,
  Bell,
  BookOpen,
  ChevronRight,
  Globe,
  RefreshCw,
  Users,
} from "lucide-react";
import { useLiveQuery } from "dexie-react-hooks";
import { canViewCrew } from "@/lib/crew/overview";
import { getAstronaut } from "@/lib/db/repo";
import { useActiveAstronautStore } from "@/lib/store/activeAstronaut";

/**
 * The "More" tab (SPEC §8.4 bottom nav). It lists only screens that
 * actually exist: Learn and Environment (C10), Rewards (C11), Reminders
 * (C9), Sync and data (C14). No placeholder rows.
 */
const CREW_ROW = {
  href: "/crew",
  icon: Users,
  title: "Crew overview",
  detail: "Every astronaut's status, read-only, and surgeon notes",
} as const;

const ROWS = [
  {
    href: "/learn",
    icon: BookOpen,
    title: "Learn",
    detail: "What each measurement means, and the risks of spaceflight",
  },
  {
    href: "/environment",
    icon: Globe,
    title: "Environment",
    detail: "Where you are now, what to watch for, and tips",
  },
  {
    href: "/rewards",
    icon: Award,
    title: "Rewards",
    detail: "Points, level, streak, badges and the weekly challenge",
  },
  {
    href: "/reminders",
    icon: Bell,
    title: "Reminders",
    detail: "Check-in and measurement reminders, notifications",
  },
  {
    href: "/sync",
    icon: RefreshCw,
    title: "Sync and data",
    detail: "Sync with a server, export and import your data",
  },
] as const;

export default function MorePage() {
  const activeAstronautId = useActiveAstronautStore((s) => s.activeAstronautId);
  const astronaut = useLiveQuery(
    () => (activeAstronautId ? getAstronaut(activeAstronautId) : undefined),
    [activeAstronautId],
  );
  // The Crew overview row is shown only to roles that may open it. The
  // screen itself and its data functions refuse the astronaut role too.
  const rows = canViewCrew(astronaut?.role) ? [CREW_ROW, ...ROWS] : ROWS;
  return (
    <div className="mx-auto flex max-w-lg flex-col gap-6 px-6 py-8">
      <h1 className="text-xl font-semibold">More</h1>
      <ul className="flex flex-col gap-2">
        {rows.map((row) => (
          <li key={row.href}>
            <Link
              href={row.href}
              className="flex min-h-11 items-center gap-3 rounded-lg border border-zinc-200 px-4 py-3 text-sm dark:border-zinc-800"
            >
              <row.icon size={18} aria-hidden="true" />
              <span className="flex-1">
                <span className="block font-medium">{row.title}</span>
                <span className="block text-zinc-600 dark:text-zinc-400">
                  {row.detail}
                </span>
              </span>
              <ChevronRight size={18} aria-hidden="true" />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
