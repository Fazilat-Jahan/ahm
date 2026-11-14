import { describe, expect, it } from "vitest";
import {
  computeCompletenessScore,
  getMissingEssentials,
} from "@/lib/db/completeness";
import type { DailyLog } from "@/lib/db/schema";

const baseLog: DailyLog = {
  id: "1",
  astronautId: "a1",
  date: "2026-06-15",
  isBackdated: false,
  createdAt: "2026-06-15T00:00:00Z",
  updatedAt: "2026-06-15T00:00:00Z",
  version: 1,
};

describe("computeCompletenessScore", () => {
  it("is 0 with no log at all", () => {
    expect(computeCompletenessScore(undefined)).toBe(0);
  });

  it("is 0 for a log with nothing essential filled in", () => {
    expect(computeCompletenessScore(baseLog)).toBe(0);
  });

  it("is 100 when every essential is present", () => {
    const full: DailyLog = {
      ...baseLog,
      heart_rate: 72,
      bp_systolic: 120,
      bp_diastolic: 80,
      glucose_mgdl: 90,
      temperature_c: 36.8,
      spo2: 98,
      sleep_hours: 7,
      mood: 4,
      exercise_resistance_min: 20,
    };
    expect(computeCompletenessScore(full)).toBe(100);
  });

  it("counts blood pressure as incomplete unless both parts are present", () => {
    const halfBp: DailyLog = { ...baseLog, bp_systolic: 120 };
    expect(computeCompletenessScore(halfBp)).toBe(0);
  });

  it("counts exercise complete with either resistance or cardio minutes", () => {
    const cardioOnly: DailyLog = { ...baseLog, exercise_cardio_min: 15 };
    expect(computeCompletenessScore(cardioOnly)).toBe(13); // 1/8 rounded
  });

  it("is a round fraction for partial completion", () => {
    const half: DailyLog = {
      ...baseLog,
      heart_rate: 72,
      spo2: 98,
      mood: 4,
      sleep_hours: 7,
    };
    expect(computeCompletenessScore(half)).toBe(50); // 4/8
  });
});

describe("getMissingEssentials", () => {
  it("lists every essential for an empty log", () => {
    expect(getMissingEssentials(baseLog)).toEqual([
      "Heart rate",
      "Blood pressure",
      "Glucose",
      "Temperature",
      "SpO2",
      "Sleep",
      "Mood",
      "Exercise",
    ]);
  });

  it("excludes items that are present", () => {
    const partial: DailyLog = { ...baseLog, heart_rate: 72 };
    expect(getMissingEssentials(partial)).not.toContain("Heart rate");
  });
});
