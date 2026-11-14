import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  ADAPTATION_RULE_DAYS,
  ADAPTATION_SOFTEN_DAYS,
  ADAPTATION_SOFTEN_SYMPTOMS,
} from "@/config/environments";
import { RULES_VERSION, THRESHOLDS } from "@/config/thresholds";
import { evaluate } from "@/lib/rules/engine";
import type { EvalInput } from "@/lib/rules/types";
import vectorsFile from "../../../shared/rule-test-vectors.json";

/**
 * Keeps the Python rule engine (C13) in step with this one.
 *
 * Two generated files, both checked here so they can never go stale:
 *
 * 1. `backend/app/services/rule_engine/thresholds.json` — a mirror of
 *    `config/thresholds.ts` (plus the mission-phase constants from
 *    `config/environments.ts`). The Python engine reads its bands, labels
 *    and tips from it; `config/thresholds.ts` stays the single place a
 *    value is edited.
 * 2. `shared/rule-engine-golden.json` — this engine's COMPLETE output for
 *    every shared vector (messages, actions, explanation, everything).
 *    The Python tests require an exact match, which is much stricter than
 *    the statuses and rule ids the vectors themselves list.
 *
 * After changing a threshold or a rule, regenerate both with:
 *
 *   AHM_WRITE_PARITY=1 npx vitest run tests/rules/serverParity.test.ts
 *
 * then run `pytest` in backend/. Test data only: never imported by app code.
 */
const ROOT = path.resolve(process.cwd(), "..");
const THRESHOLDS_JSON = path.join(
  ROOT,
  "backend",
  "app",
  "services",
  "rule_engine",
  "thresholds.json",
);
const GOLDEN_JSON = path.join(ROOT, "shared", "rule-engine-golden.json");
const WRITE = process.env.AHM_WRITE_PARITY === "1";

interface Vector {
  name: string;
  input: EvalInput;
}

const vectors = vectorsFile.vectors as unknown as Vector[];

/** Through JSON, so `undefined` fields disappear exactly as they do in
 * the files. */
function plain<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

const thresholdsMirror = plain({
  generatedFrom:
    "frontend/config/thresholds.ts and frontend/config/environments.ts — do not edit by hand; see frontend/tests/rules/serverParity.test.ts",
  rulesVersion: RULES_VERSION,
  adaptation: {
    ruleDays: ADAPTATION_RULE_DAYS,
    softenDays: ADAPTATION_SOFTEN_DAYS,
    softenSymptoms: ADAPTATION_SOFTEN_SYMPTOMS,
  },
  indicators: THRESHOLDS,
});

const golden = plain({
  generatedFrom:
    "frontend/lib/rules/engine.ts run over shared/rule-test-vectors.json — do not edit by hand; see frontend/tests/rules/serverParity.test.ts",
  rulesVersion: RULES_VERSION,
  results: vectors.map((vector) => ({
    name: vector.name,
    result: evaluate(vector.input),
  })),
});

function write(file: string, value: unknown): void {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function read(file: string): unknown {
  return JSON.parse(readFileSync(file, "utf8"));
}

describe("server parity files", () => {
  if (WRITE) {
    write(THRESHOLDS_JSON, thresholdsMirror);
    write(GOLDEN_JSON, golden);
  }

  it("backend thresholds.json mirrors config/thresholds.ts exactly", () => {
    expect(existsSync(THRESHOLDS_JSON), THRESHOLDS_JSON).toBe(true);
    expect(read(THRESHOLDS_JSON)).toEqual(thresholdsMirror);
  });

  it("the golden file holds this engine's current output for every vector", () => {
    expect(existsSync(GOLDEN_JSON), GOLDEN_JSON).toBe(true);
    expect(read(GOLDEN_JSON)).toEqual(golden);
    expect(golden.results).toHaveLength(vectors.length);
  });
});
