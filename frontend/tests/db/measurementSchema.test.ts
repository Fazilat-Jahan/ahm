import { describe, expect, it } from "vitest";
import { measurementSchema } from "@/lib/db/measurementSchema";

describe("measurementSchema", () => {
  it("accepts an empty object (every field is skippable)", () => {
    const result = measurementSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("accepts valid values", () => {
    const result = measurementSchema.safeParse({
      heart_rate: 72,
      bp_systolic: 120,
      bp_diastolic: 80,
      sleep_quality: 4,
      eva_today: true,
    });
    expect(result.success).toBe(true);
  });

  it("rejects an impossible heart rate with a clear message", () => {
    const result = measurementSchema.safeParse({ heart_rate: 999 });
    expect(result.success).toBe(false);
    if (!result.success) {
      const message = result.error.issues[0]?.message;
      expect(message).toContain("Resting heart rate");
      expect(message).toContain("250");
    }
  });

  it("rejects a negative value below the sanity floor", () => {
    const result = measurementSchema.safeParse({ spo2: -5 });
    expect(result.success).toBe(false);
  });

  it("rejects a non-integer slider value", () => {
    const result = measurementSchema.safeParse({ sleep_quality: 3.5 });
    expect(result.success).toBe(false);
  });

  it("has no upper bound on radiation dose (SPEC Appendix A gives none)", () => {
    const result = measurementSchema.safeParse({ radiation_msv: 500 });
    expect(result.success).toBe(true);
  });
});
