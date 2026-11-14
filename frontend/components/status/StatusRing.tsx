"use client";

import { motion, useReducedMotion } from "framer-motion";
import type { Status } from "@/config/thresholds";
import { getStatusConfig } from "./StatusBadge";

const SIZE = 160;
const STROKE = 14;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/** SPEC §8.3 screen 1: "Large overall status ring (animated, colour + icon
 * + label)". Grey/empty when there's no evaluation yet (SPEC §16 Home
 * empty state: "no status ring value"). */
export function StatusRing({ status }: { status: Status | null }) {
  const reduceMotion = useReducedMotion();

  if (!status) {
    return (
      <div className="flex flex-col items-center gap-2">
        <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            fill="none"
            stroke="var(--border)"
            strokeWidth={STROKE}
          />
        </svg>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">No data yet</p>
      </div>
    );
  }

  const { label, icon: Icon, colorVar, pulse } = getStatusConfig(status);

  return (
    <div className="flex flex-col items-center gap-2">
      <div
        className={`relative ${pulse ? "status-pulse" : ""}`}
        style={{ color: `var(${colorVar})` }}
      >
        <svg
          width={SIZE}
          height={SIZE}
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          className="-rotate-90"
        >
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            fill="none"
            stroke="var(--border)"
            strokeWidth={STROKE}
          />
          <motion.circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            fill="none"
            stroke="currentColor"
            strokeWidth={STROKE}
            strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE}
            initial={reduceMotion ? false : { strokeDashoffset: CIRCUMFERENCE }}
            animate={{ strokeDashoffset: 0 }}
            transition={
              reduceMotion
                ? { duration: 0 }
                : { duration: 0.8, ease: "easeOut" }
            }
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1">
          <Icon size={36} aria-hidden="true" />
        </div>
      </div>
      <p
        className="text-lg font-semibold"
        style={{ color: `var(${colorVar})` }}
      >
        {label}
      </p>
    </div>
  );
}
