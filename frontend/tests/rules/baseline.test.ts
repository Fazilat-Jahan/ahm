import { describe, expect, it } from "vitest";
import { computeBaseline, median } from "@/lib/rules/baseline";
import { evaluate } from "@/lib/rules/engine";
import type { HistoryDay, MissionContext } from "@/lib/rules/types";

describe("median", () => {
  it("returns undefined for an empty array", () => {
    expect(median([])).toBeUndefined();
  });

  it("returns the middle value for an odd-length array", () => {
    expect(median([3, 1, 2])).toBe(2);
  });

  it("averages the two middle values for an even-length array", () => {
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });

  it("is resistant to a single outlier, unlike a mean", () => {
    // Thirteen 70s and one way-high outlier: a mean would be dragged up
    // (~86.4), the median stays exactly at the typical value.
    const values = [...Array(13).fill(70), 300];
    expect(median(values)).toBe(70);
  });
});

describe("computeBaseline", () => {
  it("needs at least 14 defined days (SPEC §16)", () => {
    const thirteen = Array(13).fill(70);
    expect(computeBaseline(thirteen)).toBeUndefined();
    expect(computeBaseline([...thirteen, 70])).toBe(70);
  });

  it("ignores undefined entries when counting toward the minimum", () => {
    const withGaps = [...Array(14).fill(70), undefined, undefined];
    expect(computeBaseline(withGaps)).toBe(70);
  });
});

describe("TRD-HR-01 uses the median baseline, not the mean", () => {
  function historyDay(date: string, heartRate: number): HistoryDay {
    return { date, log: { date, heart_rate: heartRate }, symptoms: [] };
  }

  const mission: MissionContext = { environment: "station", missionDay: 30 };

  it("fires when recent HR clears median+15, even though mean+15 would NOT be cleared", () => {
    // Baseline window: 13 days at 70bpm + one 300bpm outlier (14 days,
    // exactly the minimum). Median = 70 -> threshold 85. Mean ~= 86.4 ->
    // threshold ~101.4. Recent HR of 90 clears the median threshold but
    // not the mean one — this is the case that would have silently failed
    // to fire under the old mean-based baseline.
    const baselineDays: HistoryDay[] = [
      historyDay("2026-05-29", 300),
      ...Array.from({ length: 13 }, (_, i) =>
        historyDay(`2026-05-${28 - i}`, 70),
      ),
    ];
    const recentDays = [
      historyDay("2026-06-14", 90),
      historyDay("2026-06-13", 90),
    ];

    const result = evaluate({
      log: { date: "2026-06-15", heart_rate: 90 },
      symptoms: [],
      history: [...recentDays, ...baselineDays],
      mission,
    });

    expect(result.trends.map((t) => t.id)).toContain("TRD-HR-01");
  });
});
