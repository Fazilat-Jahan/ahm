import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { getDb } from "@/lib/db/schema";
import {
  getLatestTrends,
  getLogsInRange,
  registerAstronaut,
  saveCheckin,
} from "@/lib/db/repo";
import type { MissionContext } from "@/lib/rules/types";

beforeEach(async () => {
  const db = getDb();
  await db.astronauts.clear();
  await db.outbox.clear();
  await db.logs.clear();
  await db.symptoms.clear();
  await db.followups.clear();
  await db.evaluations.clear();
});

const baseInput = {
  name: "Alex Rivera",
  crewCode: "AST-001",
  role: "astronaut" as const,
  environment: "station" as const,
  missionStart: "2026-06-01",
  pin: "1234",
};

const mission: MissionContext = { environment: "station", missionDay: 30 };

describe("getLogsInRange", () => {
  it("returns logs ascending by date, scoped to the range and astronaut", async () => {
    const astronaut = await registerAstronaut(baseInput);
    for (const date of ["2026-06-10", "2026-06-12", "2026-06-15"]) {
      await saveCheckin({
        astronautId: astronaut.id,
        date,
        isBackdated: false,
        measurements: { heart_rate: 70 },
        selfHarmThoughts: false,
        symptoms: [],
        followups: [],
        mission,
      });
    }

    const result = await getLogsInRange(
      astronaut.id,
      "2026-06-11",
      "2026-06-15",
    );
    expect(result.logs.map((l) => l.date)).toEqual([
      "2026-06-12",
      "2026-06-15",
    ]);
  });

  it("collects symptom-day markers for dates with any symptom", async () => {
    const astronaut = await registerAstronaut(baseInput);
    await saveCheckin({
      astronautId: astronaut.id,
      date: "2026-06-12",
      isBackdated: false,
      measurements: { heart_rate: 70 },
      selfHarmThoughts: false,
      symptoms: [{ symptom: "headache", severity: 1 }],
      followups: [],
      mission,
    });
    await saveCheckin({
      astronautId: astronaut.id,
      date: "2026-06-13",
      isBackdated: false,
      measurements: { heart_rate: 70 },
      selfHarmThoughts: false,
      symptoms: [],
      followups: [],
      mission,
    });

    const result = await getLogsInRange(
      astronaut.id,
      "2026-06-01",
      "2026-06-20",
    );
    expect(result.symptomDates).toEqual(new Set(["2026-06-12"]));
  });

  it("returns nothing for an astronaut with no logs in range", async () => {
    const astronaut = await registerAstronaut(baseInput);
    const result = await getLogsInRange(
      astronaut.id,
      "2026-06-01",
      "2026-06-20",
    );
    expect(result.logs).toEqual([]);
    expect(result.symptomDates.size).toBe(0);
  });
});

describe("getLatestTrends", () => {
  it("returns no trends for an astronaut with no logs", async () => {
    const astronaut = await registerAstronaut(baseInput);
    expect(await getLatestTrends(astronaut.id, mission)).toEqual([]);
  });

  it("fires TRD-SLP-01 using the astronaut's actual recent sleep history", async () => {
    const astronaut = await registerAstronaut(baseInput);
    await saveCheckin({
      astronautId: astronaut.id,
      date: "2026-06-13",
      isBackdated: false,
      measurements: { sleep_hours: 5 },
      selfHarmThoughts: false,
      symptoms: [],
      followups: [],
      mission,
    });
    await saveCheckin({
      astronautId: astronaut.id,
      date: "2026-06-14",
      isBackdated: false,
      measurements: { sleep_hours: 5 },
      selfHarmThoughts: false,
      symptoms: [],
      followups: [],
      mission,
    });
    await saveCheckin({
      astronautId: astronaut.id,
      date: "2026-06-15",
      isBackdated: false,
      measurements: { sleep_hours: 5 },
      selfHarmThoughts: false,
      symptoms: [],
      followups: [],
      mission,
    });

    const trends = await getLatestTrends(astronaut.id, mission);
    expect(trends.map((t) => t.id)).toContain("TRD-SLP-01");
  });
});
