import { describe, expect, it } from "vitest";
import {
  isBorderline,
  resolveBorderlineTargets,
  statusForIndicator,
} from "@/components/checkin/borderline";
import { getMeasurementConfig } from "@/config/measurements";

describe("statusForIndicator / isBorderline", () => {
  it("flags a yellow heart rate as borderline", () => {
    const status = statusForIndicator("heart_rate", 105);
    expect(status).toBe("yellow");
    expect(isBorderline(status)).toBe(true);
  });

  it("does not flag a green heart rate", () => {
    const status = statusForIndicator("heart_rate", 72);
    expect(isBorderline(status)).toBe(false);
  });

  it("does not flag critical as borderline (handled separately)", () => {
    const status = statusForIndicator("heart_rate", 140);
    expect(status).toBe("critical");
    expect(isBorderline(status)).toBe(false);
  });

  it("returns undefined when the value is missing", () => {
    expect(statusForIndicator("heart_rate", undefined)).toBeUndefined();
  });
});

describe("resolveBorderlineTargets", () => {
  it("checks each BP sub-field independently", () => {
    const bp = getMeasurementConfig("blood_pressure")!;
    const targets = resolveBorderlineTargets(bp, {
      bp_systolic: 150,
      bp_diastolic: 70,
    });
    expect(targets).toEqual([
      { fieldId: "bp_systolic", indicatorId: "bp_systolic", value: 150 },
      { fieldId: "bp_diastolic", indicatorId: "bp_diastolic", value: 70 },
    ]);
  });

  it("exercise has no indicatorId: minutes already logged can't be re-measured", () => {
    const exercise = getMeasurementConfig("exercise")!;
    const targets = resolveBorderlineTargets(exercise, {
      exercise_resistance_min: 10,
      exercise_cardio_min: 10,
    });
    expect(targets).toEqual([]);
  });

  it("returns nothing for a plain number field with no value entered", () => {
    const hr = getMeasurementConfig("heart_rate")!;
    expect(resolveBorderlineTargets(hr, {})).toEqual([]);
  });

  it("returns nothing for a card with no indicatorId (e.g. weight)", () => {
    const weight = getMeasurementConfig("weight_kg")!;
    expect(resolveBorderlineTargets(weight, { weight_kg: 70 })).toEqual([]);
  });
});
