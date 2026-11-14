import { describe, expect, it } from "vitest";
import { evaluate, RULES_VERSION } from "@/lib/rules/engine";
import type { EvalInput, Status } from "@/lib/rules/types";
import vectorsFile from "../../../shared/rule-test-vectors.json";

interface Vector {
  name: string;
  input: EvalInput;
  expect: {
    overall?: Status;
    indicatorStatuses?: Record<string, Status>;
    flagIds: string[];
    trendIds: string[];
    escalationLevel?: "none" | "self_care" | "contact_surgeon" | "emergency";
  };
}

const vectors = vectorsFile.vectors as unknown as Vector[];

describe(`rule engine vectors (rules v${RULES_VERSION})`, () => {
  it("loaded a non-trivial number of vectors", () => {
    expect(vectors.length).toBeGreaterThan(50);
  });

  for (const vector of vectors) {
    it(vector.name, () => {
      const result = evaluate(vector.input);

      if (vector.expect.overall) {
        expect(result.overall).toBe(vector.expect.overall);
      }

      if (vector.expect.indicatorStatuses) {
        for (const [id, status] of Object.entries(
          vector.expect.indicatorStatuses,
        )) {
          const indicator = result.indicators.find((i) => i.id === id);
          expect(
            indicator,
            `expected indicator "${id}" to be present`,
          ).toBeDefined();
          expect(indicator?.status, `indicator "${id}"`).toBe(status);
        }
      }

      expect(result.flags.map((f) => f.id).sort()).toEqual(
        [...vector.expect.flagIds].sort(),
      );
      expect(result.trends.map((t) => t.id).sort()).toEqual(
        [...vector.expect.trendIds].sort(),
      );

      if (vector.expect.escalationLevel) {
        expect(result.escalation?.level).toBe(vector.expect.escalationLevel);
      }

      // Every status shown must carry a rule id + value (CLAUDE.md §2 rule 5).
      for (const indicator of result.indicators) {
        expect(indicator.ruleId).toBeTruthy();
        expect(indicator.value).not.toBeUndefined();
      }

      // Guidance content rules (SPEC §4.5): no action exceeds 140 chars,
      // never mentions a drug dose.
      for (const action of result.actions) {
        expect(action.text.length).toBeLessThanOrEqual(140);
      }
      expect(result.actions.length).toBeLessThanOrEqual(4);
    });
  }
});

describe("drug-advice guardrail", () => {
  it("never mentions milligrams/dosing anywhere in guidance text", () => {
    for (const vector of vectors) {
      const result = evaluate(vector.input);
      const allText = [
        ...result.actions.map((a) => a.text),
        result.escalation?.text ?? "",
        ...result.explanation,
      ].join(" ");
      // Matches an actual drug-dosing pattern (e.g. "400mg") or a named
      // drug, but NOT the legitimate non-drug uses of "dose" in this app
      // (radiation dose, glucose, dosimeter).
      expect(allText.toLowerCase()).not.toMatch(
        /\d+\s*mg\b|\bibuprofen\b|\bacetaminophen\b|\bparacetamol\b|\baspirin\b|\bmedication dose\b|\bdrug dose\b/,
      );
    }
  });
});
