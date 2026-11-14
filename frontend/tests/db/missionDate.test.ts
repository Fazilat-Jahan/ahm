import { describe, expect, it } from "vitest";
import { daysAgo, getMissionDate, getMissionDay } from "@/lib/time/missionDate";

describe("getMissionDate", () => {
  it("formats a given date as YYYY-MM-DD", () => {
    expect(getMissionDate(new Date(2026, 5, 15))).toBe("2026-06-15");
  });
});

describe("getMissionDay", () => {
  it("mission start date itself is day 1", () => {
    expect(getMissionDay("2026-06-01", "2026-06-01")).toBe(1);
  });

  it("counts forward", () => {
    expect(getMissionDay("2026-06-01", "2026-06-15")).toBe(15);
  });
});

describe("daysAgo", () => {
  it("subtracts days from a reference date", () => {
    expect(daysAgo(14, "2026-06-15")).toBe("2026-06-01");
  });
});
