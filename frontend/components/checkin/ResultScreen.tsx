"use client";

import { motion, useReducedMotion } from "framer-motion";
import { Disclaimer } from "@/components/common/Disclaimer";
import { ActionList } from "@/components/guidance/ActionList";
import { EscalationCard } from "@/components/guidance/EscalationCard";
import { StatusBadge } from "@/components/status/StatusBadge";
import type { EvaluationResult } from "@/lib/rules/types";

interface ResultScreenProps {
  evaluation: EvaluationResult;
  onDone: () => void;
}

/** SPEC §8.3 screen 2 step 6: animated reveal of status + actions +
 * escalation. CLAUDE.md §2 rule 9: disclaimer always shown here. */
export function ResultScreen({ evaluation, onDone }: ResultScreenProps) {
  const reduceMotion = useReducedMotion();
  const transition = reduceMotion
    ? { duration: 0 }
    : { duration: 0.4, ease: "easeOut" as const };

  return (
    <div className="flex flex-col gap-6">
      <motion.div
        initial={reduceMotion ? false : { opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={transition}
        className="flex flex-col items-center gap-2 py-4"
      >
        <StatusBadge status={evaluation.overall} size="lg" />
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Rules version {evaluation.rulesVersion}
        </p>
      </motion.div>

      <motion.div
        initial={reduceMotion ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...transition, delay: reduceMotion ? 0 : 0.1 }}
      >
        <EscalationCard escalation={evaluation.escalation} />
      </motion.div>

      {evaluation.actions.length > 0 && (
        <div>
          <h2 className="font-medium">What to do now</h2>
          <div className="mt-2">
            <ActionList actions={evaluation.actions} />
          </div>
        </div>
      )}

      {evaluation.explanation.length > 0 && (
        <div>
          <h2 className="font-medium">Why</h2>
          <ul className="mt-2 flex flex-col gap-1 text-sm text-zinc-600 dark:text-zinc-400">
            {evaluation.explanation.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
        </div>
      )}

      <Disclaimer />

      <button
        type="button"
        onClick={onDone}
        className="min-h-11 rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
      >
        Done
      </button>
    </div>
  );
}
