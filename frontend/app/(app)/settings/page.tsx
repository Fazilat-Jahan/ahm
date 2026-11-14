"use client";

import Link from "next/link";
import { Award, Bell, BookOpen, ChevronRight, Globe } from "lucide-react";

/**
 * The "More" tab (SPEC §8.4 bottom nav). It lists only screens that
 * actually exist: Learn and Environment (C10), Rewards (C11), Reminders
 * (C9). Sync gets a row here when its own chunk lands — no placeholder
 * rows.
 */
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
] as const;

export default function MorePage() {
  return (
    <div className="mx-auto flex max-w-lg flex-col gap-6 px-6 py-8">
      <h1 className="text-xl font-semibold">More</h1>
      <ul className="flex flex-col gap-2">
        {ROWS.map((row) => (
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
