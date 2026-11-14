import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { BADGES, POINTS } from "@/config/badges";
import { getGameActionRecords, getGameSummary } from "@/lib/db/gameRepo";
import {
  registerAstronaut,
  saveCheckin,
  setActionCompleted,
} from "@/lib/db/repo";
import { getDb } from "@/lib/db/schema";
import {
  computeGameSummary,
  computeRuns,
  getLevel,
  getLevelThreshold,
  getMeasurementPoints,
  type GameLog,
} from "@/lib/gamification/engine";
import { daysAgo, diffDays, startOfWeek } from "@/lib/time/missionDate";

const TODAY = "2026-11-14"; // a Saturday

/** `n` consecutive check-in days ending on `end`. */
function days(n: number, end = TODAY, extra: Partial<GameLog> = {}): GameLog[] {
  return Array.from({ length: n }, (_, i) => ({
    date: daysAgo(n - 1 - i, end),
    ...extra,
  }));
}

const summary = (
  logs: GameLog[],
  actions = [] as { date: string; kind: "completed" | "answered" }[],
) => computeGameSummary({ logs, actions, today: TODAY });

describe("date helpers", () => {
  it("diffDays and startOfWeek (Monday)", () => {
    expect(diffDays("2026-11-12", "2026-11-14")).toBe(2);
    expect(startOfWeek("2026-11-14")).toBe("2026-11-09");
    expect(startOfWeek("2026-11-09")).toBe("2026-11-09");
    expect(startOfWeek("2026-11-15")).toBe("2026-11-09");
  });
});

describe("empty state", () => {
  it("no check-ins: 0 points, level 1, no streak, no badges", () => {
    const s = summary([]);
    expect(s.points).toBe(0);
    expect(s.level).toBe(1);
    expect(s.checkinCount).toBe(0);
    expect(s.streak).toMatchObject({ current: 0, longest: 0, status: "none" });
    expect(s.badges.every((b) => !b.earned && b.progress === 0)).toBe(true);
    expect(s.weeklyChallenge.progress).toBe(0);
  });
});

describe("points", () => {
  it("a check-in with nothing measured earns the check-in points only", () => {
    expect(summary([{ date: TODAY }]).points).toBe(POINTS.checkin);
  });

  it("each measurement card earns 5; BP and exercise count once each", () => {
    expect(getMeasurementPoints({ date: TODAY, heart_rate: 70 })).toBe(5);
    expect(
      getMeasurementPoints({ date: TODAY, bp_systolic: 120, bp_diastolic: 80 }),
    ).toBe(5);
    expect(
      getMeasurementPoints({
        date: TODAY,
        exercise_resistance_min: 30,
        exercise_cardio_min: 30,
      }),
    ).toBe(5);
  });

  it("measurement points are capped at 40 a day", () => {
    const full: GameLog = {
      date: TODAY,
      heart_rate: 70,
      bp_systolic: 120,
      bp_diastolic: 80,
      glucose_mgdl: 90,
      temperature_c: 36.8,
      spo2: 98,
      sleep_hours: 8,
      exercise_resistance_min: 60,
      exercise_cardio_min: 60,
      water_ml: 2500,
      weight_kg: 70,
      radiation_msv: 0.5,
    };
    expect(getMeasurementPoints(full)).toBe(40);
    expect(summary([full]).points).toBe(60);
  });

  it("completed actions earn 10, follow-up answers earn 5", () => {
    const s = summary(
      [{ date: TODAY }],
      [
        { date: TODAY, kind: "completed" },
        { date: TODAY, kind: "completed" },
        { date: TODAY, kind: "answered" },
      ],
    );
    expect(s.breakdown.actionsCompleted).toBe(20);
    expect(s.breakdown.followupsAnswered).toBe(5);
    expect(s.points).toBe(45);
  });

  it("7-day streak bonus: 50 per full 7 days in a run", () => {
    expect(summary(days(6)).breakdown.streakBonuses).toBe(0);
    expect(summary(days(7)).breakdown.streakBonuses).toBe(50);
    expect(summary(days(14)).breakdown.streakBonuses).toBe(100);
    expect(summary(days(7)).points).toBe(7 * 20 + 50);
  });

  it("levels follow floor(sqrt(points/50)) + 1", () => {
    expect(getLevel(0)).toBe(1);
    expect(getLevel(49)).toBe(1);
    expect(getLevel(50)).toBe(2);
    expect(getLevel(199)).toBe(2);
    expect(getLevel(200)).toBe(3);
    expect(getLevelThreshold(3)).toBe(200);
    const s = summary(days(3));
    expect(s.level).toBe(2);
    expect(s.levelFloor).toBe(50);
    expect(s.nextLevelAt).toBe(200);
  });
});

describe("guardrails", () => {
  it("the value of a measurement never changes the points (no reward for extremes)", () => {
    const normal = summary([
      { date: TODAY, sleep_hours: 8, exercise_cardio_min: 60, heart_rate: 70 },
    ]);
    const unsafe = summary([
      {
        date: TODAY,
        sleep_hours: 0,
        exercise_cardio_min: 600,
        heart_rate: 190,
      },
    ]);
    expect(unsafe.points).toBe(normal.points);
  });

  it("extreme exercise earns no more badge progress than reaching the mark", () => {
    const atMark = summary(days(3, TODAY, { exercise_cardio_min: 60 }));
    const extreme = summary(days(3, TODAY, { exercise_cardio_min: 600 }));
    const badge = (s: typeof atMark) =>
      s.badges.find((b) => b.id === "bone_guardian")?.progress;
    expect(badge(extreme)).toBe(badge(atMark));
  });

  it("skipping sleep earns nothing: no weekly progress, no Iron Sleeper progress", () => {
    const s = summary(days(5, TODAY, { sleep_hours: 3 }));
    expect(s.weeklyChallenge.progress).toBe(0);
    expect(s.badges.find((b) => b.id === "iron_sleeper")?.progress).toBe(0);
  });

  it("the engine input has no symptoms and no status at all", () => {
    // Extra fields a caller might pass by accident are simply ignored.
    const plain = summary([{ date: TODAY, heart_rate: 70 }]);
    const withExtras = summary([
      {
        date: TODAY,
        heart_rate: 70,
        ...({
          symptoms: ["chest_pain"],
          overallStatus: "critical",
          selfHarmThoughts: true,
        } as object),
      },
    ]);
    expect(withExtras).toEqual(plain);
  });

  it("no badge or text is about symptoms or status", () => {
    for (const badge of BADGES) {
      expect(`${badge.name} ${badge.description}`).not.toMatch(
        /symptom|green|red|critical|healthy/i,
      );
    }
  });
});

describe("streak and freeze", () => {
  it("counts consecutive days ending today", () => {
    expect(summary(days(4)).streak).toMatchObject({
      current: 4,
      longest: 4,
      status: "active",
    });
  });

  it("today not done yet does not break the streak", () => {
    const s = summary(days(4, daysAgo(1, TODAY)));
    expect(s.streak).toMatchObject({ current: 4, status: "active" });
  });

  it("one missed day is covered by the freeze", () => {
    const logs = [...days(3, daysAgo(2, TODAY)), { date: TODAY }];
    const s = summary(logs);
    expect(s.streak).toMatchObject({ current: 4, status: "active" });
    expect(s.streak.freezeAvailable).toBe(false);
  });

  it("two missed days in a row end the run", () => {
    const logs = [...days(3, daysAgo(3, TODAY)), { date: TODAY }];
    expect(summary(logs).streak).toMatchObject({ current: 1, longest: 3 });
  });

  it("only one freeze per 14 days", () => {
    // check-in, miss, check-in, miss, check-in: second miss is not covered
    const dates = [4, 2, 0].map((n) => ({ date: daysAgo(n, TODAY) }));
    expect(summary(dates).streak).toMatchObject({ current: 1, longest: 2 });
  });

  it("a second freeze works once 14 days have passed", () => {
    const { runs, freezeDates } = computeRuns([
      "2026-10-01",
      "2026-10-03", // 10-02 frozen
      ...Array.from({ length: 13 }, (_, i) => daysAgo(-(i + 1), "2026-10-03")),
      "2026-10-18", // 10-17 missed, 15 days after 10-02 -> frozen
    ]);
    expect(freezeDates).toEqual(["2026-10-02", "2026-10-17"]);
    expect(runs).toHaveLength(1);
    expect(runs[0].length).toBe(16);
  });

  it("yesterday missed with a freeze ready shows as frozen, not lost", () => {
    const s = summary(days(5, daysAgo(2, TODAY)));
    expect(s.streak).toMatchObject({ current: 5, status: "frozen" });
  });

  it("two days missed with today still open is a lost streak", () => {
    const s = summary(days(5, daysAgo(3, TODAY)));
    expect(s.streak).toMatchObject({ current: 0, longest: 5, status: "none" });
  });
});

describe("badges and weekly challenge", () => {
  const badge = (logs: GameLog[], id: string) =>
    summary(logs).badges.find((b) => b.id === id);

  it("First Orbit on the first check-in", () => {
    expect(badge([{ date: TODAY }], "first_orbit")?.earned).toBe(true);
  });

  it("Iron Sleeper needs 7 nights of 7 h or more", () => {
    expect(
      badge(days(6, TODAY, { sleep_hours: 7 }), "iron_sleeper"),
    ).toMatchObject({ earned: false, progress: 6, target: 7 });
    expect(
      badge(days(7, TODAY, { sleep_hours: 7 }), "iron_sleeper")?.earned,
    ).toBe(true);
    expect(
      badge(days(7, TODAY, { sleep_hours: 6.9 }), "iron_sleeper")?.progress,
    ).toBe(0);
  });

  it("Bone Guardian sums resistance and cardio, 14 days of 60 min", () => {
    const logs = days(14, TODAY, {
      exercise_resistance_min: 30,
      exercise_cardio_min: 30,
    });
    expect(badge(logs, "bone_guardian")?.earned).toBe(true);
    expect(
      badge(days(14, TODAY, { exercise_cardio_min: 59 }), "bone_guardian")
        ?.progress,
    ).toBe(0);
  });

  it("Hydration Hero uses the green band from config/thresholds.ts", () => {
    expect(
      badge(days(7, TODAY, { water_ml: 2000 }), "hydration_hero")?.earned,
    ).toBe(true);
    expect(
      badge(days(7, TODAY, { water_ml: 1999 }), "hydration_hero")?.progress,
    ).toBe(0);
  });

  it("Calm Mind: 7 days with mood 4 or 5", () => {
    expect(badge(days(7, TODAY, { mood: 4 }), "calm_mind")?.earned).toBe(true);
    expect(badge(days(7, TODAY, { mood: 3 }), "calm_mind")?.progress).toBe(0);
  });

  it("Full Spectrum needs every MVP indicator in one day", () => {
    const full: GameLog = {
      date: TODAY,
      heart_rate: 70,
      bp_systolic: 120,
      bp_diastolic: 80,
      glucose_mgdl: 90,
      temperature_c: 36.8,
      spo2: 98,
      sleep_hours: 7,
      exercise_cardio_min: 20,
      mood: 3,
    };
    expect(badge([full], "full_spectrum")?.earned).toBe(true);
    expect(badge([{ ...full, spo2: undefined }], "full_spectrum")?.earned).toBe(
      false,
    );
    expect(badge([{ ...full, mood: undefined }], "full_spectrum")?.earned).toBe(
      false,
    );
  });

  it("Mission Marathon at a 30-day streak", () => {
    expect(badge(days(29), "mission_marathon")).toMatchObject({
      earned: false,
      progress: 29,
    });
    expect(badge(days(30), "mission_marathon")?.earned).toBe(true);
  });

  it("weekly challenge counts 7 h nights since Monday only", () => {
    // TODAY is Saturday; the week started Monday 2026-11-09.
    const s = summary(days(10, TODAY, { sleep_hours: 8 }));
    expect(s.weeklyChallenge).toMatchObject({
      progress: 5,
      target: 5,
      completed: true,
      weekStart: "2026-11-09",
    });
    const few = summary(days(2, TODAY, { sleep_hours: 8 }));
    expect(few.weeklyChallenge).toMatchObject({
      progress: 2,
      completed: false,
    });
  });
});

describe("from real saved data, per astronaut (repository)", () => {
  beforeEach(async () => {
    const db = getDb();
    await Promise.all([
      db.astronauts.clear(),
      db.logs.clear(),
      db.symptoms.clear(),
      db.evaluations.clear(),
      db.followups.clear(),
      db.outbox.clear(),
      db.gamification.clear(),
    ]);
  });

  const reg = (crewCode: string) =>
    registerAstronaut({
      name: `Test ${crewCode}`,
      crewCode,
      role: "astronaut",
      environment: "station",
      missionStart: "2026-06-01",
      pin: "1234",
    });

  const checkin = (
    astronautId: string,
    date: string,
    opts: {
      symptoms?: { symptom: "chest_pain" | "headache"; severity: 1 | 2 | 3 }[];
      measurements?: Record<string, number>;
      followups?: {
        actionId: string;
        evaluationId: string;
        response: "yes" | "partly" | "no";
      }[];
    } = {},
  ) =>
    saveCheckin({
      astronautId,
      date,
      isBackdated: false,
      measurements: opts.measurements ?? {},
      selfHarmThoughts: false,
      symptoms: opts.symptoms ?? [],
      followups: opts.followups ?? [],
      mission: { environment: "station", missionDay: 100 },
    });

  it("a registered astronaut with no check-in has nothing", async () => {
    const a = await reg("TST-001");
    const s = await getGameSummary(a.id, TODAY);
    expect(s.points).toBe(0);
    expect(s.checkinCount).toBe(0);
  });

  it("points are separate per astronaut", async () => {
    const a = await reg("TST-001");
    const b = await reg("TST-002");
    await checkin(a.id, TODAY, { measurements: { heart_rate: 70 } });
    expect((await getGameSummary(a.id, TODAY)).points).toBe(25);
    expect((await getGameSummary(b.id, TODAY)).points).toBe(0);
  });

  it("reporting symptoms gives no extra points, and 'None today' gives full points", async () => {
    const a = await reg("TST-001");
    const b = await reg("TST-002");
    await checkin(a.id, TODAY, {
      symptoms: [
        { symptom: "chest_pain", severity: 3 },
        { symptom: "headache", severity: 2 },
      ],
    });
    await checkin(b.id, TODAY);
    const withSymptoms = await getGameSummary(a.id, TODAY);
    const noneToday = await getGameSummary(b.id, TODAY);
    expect(withSymptoms.points).toBe(noneToday.points);
    expect(noneToday.points).toBe(POINTS.checkin);
  });

  it("a red or critical day earns exactly what a green day earns", async () => {
    const a = await reg("TST-001");
    const b = await reg("TST-002");
    const green = await checkin(a.id, TODAY, {
      measurements: { heart_rate: 70, spo2: 98 },
    });
    const critical = await checkin(b.id, TODAY, {
      measurements: { heart_rate: 190, spo2: 80 },
    });
    expect(green.evaluation.overall).toBe("green");
    expect(critical.evaluation.overall).toBe("critical");
    const sa = await getGameSummary(a.id, TODAY);
    const sb = await getGameSummary(b.id, TODAY);
    expect(sb.points).toBe(sa.points);
    expect(sb.streak).toEqual(sa.streak);
  });

  it("ticking an action adds 10; unticking removes it", async () => {
    const a = await reg("TST-001");
    const { evaluationId } = await checkin(a.id, TODAY);
    await setActionCompleted(a.id, TODAY, "act-1", evaluationId, true);
    expect((await getGameSummary(a.id, TODAY)).breakdown.actionsCompleted).toBe(
      10,
    );
    await setActionCompleted(a.id, TODAY, "act-1", evaluationId, false);
    expect((await getGameSummary(a.id, TODAY)).breakdown.actionsCompleted).toBe(
      0,
    );
  });

  it("a follow-up answer earns 5 whatever the answer", async () => {
    const a = await reg("TST-001");
    const yesterday = daysAgo(1, TODAY);
    const first = await checkin(a.id, yesterday);
    await checkin(a.id, TODAY, {
      followups: [
        { actionId: "x", evaluationId: first.evaluationId, response: "no" },
        { actionId: "y", evaluationId: first.evaluationId, response: "yes" },
        { actionId: "z", evaluationId: first.evaluationId, response: "partly" },
      ],
    });
    const records = await getGameActionRecords(a.id);
    expect(records.map((r) => r.kind)).toEqual([
      "answered",
      "answered",
      "answered",
    ]);
    const s = await getGameSummary(a.id, TODAY);
    expect(s.breakdown.followupsAnswered).toBe(15);
    expect(s.breakdown.actionsCompleted).toBe(0);
  });

  it("stores nothing: the gamification table stays empty", async () => {
    const a = await reg("TST-001");
    await checkin(a.id, TODAY, { measurements: { heart_rate: 70 } });
    await getGameSummary(a.id, TODAY);
    expect(await getDb().gamification.count()).toBe(0);
  });
});
