import { RULES_VERSION, type Status } from "@/config/thresholds";
import { evaluateBands } from "./bands";
import { evaluateCombos } from "./combos";
import { buildGuidance } from "./guidance";
import { applyModifiers } from "./modifiers";
import { worst } from "./status";
import { evaluateTrends } from "./trends";
import type { EvalInput, EvaluationResult } from "./types";

export { RULES_VERSION };
export type { EvalInput, EvaluationResult };

/**
 * Pure rule-engine entry point (SPEC §4.1 / Appendix B). No UI, Dexie, or
 * network imports anywhere in lib/rules — this must run identically on the
 * client and (once ported) on the server.
 */
export function evaluate(input: EvalInput): EvaluationResult {
  const indicators = evaluateBands(input.log, input.mission); // 1. per-indicator banding

  const flags = evaluateCombos({
    // 2 + 3. symptom rules and combination rules are both expressed as
    // "flags" here — SPEC's catalogue (§4.4) doesn't define any pure
    // single-symptom rule independent of a combination, so step 2 has no
    // separate implementation (see DECISIONS.md).
    log: input.log,
    symptoms: input.symptoms,
    history: input.history,
    mission: input.mission,
    indicators,
    crewSignals: input.crewSignals,
  });

  const trends = evaluateTrends({
    log: input.log,
    history: input.history,
    mission: input.mission,
  }); // 4. trend rules

  const adjusted = applyModifiers({ indicators, flags, trends }, input.mission); // 5. modifiers

  const overall = [
    ...adjusted.indicators,
    ...adjusted.flags,
    ...adjusted.trends,
  ].reduce<Status>((acc, x) => worst(acc, x.status), "green"); // 6. overall status = worst status

  const { actions, escalation, explanation } = buildGuidance(
    adjusted,
    overall,
    input,
  ); // 7. guidance

  return {
    overall,
    indicators: adjusted.indicators,
    flags: adjusted.flags,
    trends: adjusted.trends,
    actions,
    escalation,
    explanation,
    rulesVersion: RULES_VERSION,
  };
}
