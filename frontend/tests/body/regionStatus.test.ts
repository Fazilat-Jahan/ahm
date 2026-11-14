import { describe, expect, it } from "vitest";
import { getRegionStatus } from "@/lib/body/regionStatus";
import type { IndicatorResult } from "@/lib/rules/types";

function indicator(
  id: string,
  status: IndicatorResult["status"],
): IndicatorResult {
  return { id, value: 0, status, ruleId: "TEST", message: "" };
}

describe("getRegionStatus", () => {
  it("returns null when there are no indicators yet", () => {
    expect(getRegionStatus(undefined, ["heart_rate"])).toBeNull();
  });

  it("returns null when the region has no mapped indicator ids", () => {
    expect(getRegionStatus([indicator("heart_rate", "red")], [])).toBeNull();
  });

  it("returns null when none of the evaluation's indicators map to this region", () => {
    const indicators = [indicator("spo2", "red")];
    expect(
      getRegionStatus(indicators, ["heart_rate", "bp_systolic"]),
    ).toBeNull();
  });

  it("returns the single matching indicator's status", () => {
    const indicators = [
      indicator("heart_rate", "yellow"),
      indicator("spo2", "red"),
    ];
    expect(getRegionStatus(indicators, ["heart_rate"])).toBe("yellow");
  });

  it("returns the worst of several matching indicators", () => {
    const indicators = [
      indicator("heart_rate", "yellow"),
      indicator("bp_systolic", "critical"),
      indicator("bp_diastolic", "green"),
    ];
    expect(
      getRegionStatus(indicators, [
        "heart_rate",
        "bp_systolic",
        "bp_diastolic",
      ]),
    ).toBe("critical");
  });
});
