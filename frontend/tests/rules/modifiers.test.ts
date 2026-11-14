import { describe, expect, it } from "vitest";
import { applyModifiers } from "@/lib/rules/modifiers";
import type { Flag, MissionContext } from "@/lib/rules/types";

const mission = (missionDay: number): MissionContext => ({
  environment: "station",
  missionDay,
});

function softenableFlag(status: "yellow" | "red" | "critical"): Flag {
  return {
    id: "TEST-SOFTEN-01",
    status,
    message: "test",
    hazard: "gravity",
    causedBySymptoms: ["dizziness"],
  };
}

describe("applyModifiers (mission-phase softening, SPEC §4.4)", () => {
  it("drops a yellow flag caused solely by an early-adaptation symptom within day 1-7", () => {
    const result = applyModifiers(
      { indicators: [], flags: [softenableFlag("yellow")], trends: [] },
      mission(5),
    );
    expect(result.flags).toEqual([]);
  });

  it("does not touch the same flag after day 7", () => {
    const result = applyModifiers(
      { indicators: [], flags: [softenableFlag("yellow")], trends: [] },
      mission(8),
    );
    expect(result.flags).toHaveLength(1);
  });

  it("never softens red, even within day 1-7", () => {
    const result = applyModifiers(
      { indicators: [], flags: [softenableFlag("red")], trends: [] },
      mission(3),
    );
    expect(result.flags).toHaveLength(1);
  });

  it("never softens critical, even within day 1-7", () => {
    const result = applyModifiers(
      { indicators: [], flags: [softenableFlag("critical")], trends: [] },
      mission(3),
    );
    expect(result.flags).toHaveLength(1);
  });

  it("leaves a yellow flag alone if it isn't caused by a softenable symptom", () => {
    const flag: Flag = {
      id: "TEST-OTHER-01",
      status: "yellow",
      message: "test",
      hazard: "gravity",
      causedBySymptoms: ["chest_pain"],
    };
    const result = applyModifiers(
      { indicators: [], flags: [flag], trends: [] },
      mission(3),
    );
    expect(result.flags).toHaveLength(1);
  });
});
