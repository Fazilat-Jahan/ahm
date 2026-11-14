import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { getDb } from "@/lib/db/schema";
import {
  getRecentSymptoms,
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
  name: "Jamie Lee",
  crewCode: "AST-002",
  role: "astronaut" as const,
  environment: "station" as const,
  missionStart: "2026-06-01",
  pin: "1234",
};

const mission: MissionContext = { environment: "station", missionDay: 30 };

describe("getRecentSymptoms", () => {
  it("returns nothing for an astronaut with no logs", async () => {
    const astronaut = await registerAstronaut(baseInput);
    expect(await getRecentSymptoms(astronaut.id)).toEqual([]);
  });

  it("returns symptoms from the astronaut's recent real logs, newest first", async () => {
    const astronaut = await registerAstronaut(baseInput);
    await saveCheckin({
      astronautId: astronaut.id,
      date: "2026-06-13",
      isBackdated: false,
      measurements: { heart_rate: 70 },
      selfHarmThoughts: false,
      symptoms: [{ symptom: "headache", severity: 1 }],
      followups: [],
      mission,
    });
    await saveCheckin({
      astronautId: astronaut.id,
      date: "2026-06-14",
      isBackdated: false,
      measurements: { heart_rate: 70 },
      selfHarmThoughts: false,
      symptoms: [{ symptom: "chest_pain", severity: 2 }],
      followups: [],
      mission,
    });

    const symptoms = await getRecentSymptoms(astronaut.id, 7);
    expect(symptoms.map((s) => s.symptom)).toEqual(["chest_pain", "headache"]);
  });

  it("never returns another astronaut's symptoms", async () => {
    const astronautA = await registerAstronaut(baseInput);
    const astronautB = await registerAstronaut({
      ...baseInput,
      crewCode: "AST-003",
    });
    await saveCheckin({
      astronautId: astronautA.id,
      date: "2026-06-14",
      isBackdated: false,
      measurements: { heart_rate: 70 },
      selfHarmThoughts: false,
      symptoms: [{ symptom: "headache", severity: 1 }],
      followups: [],
      mission,
    });

    expect(await getRecentSymptoms(astronautB.id)).toEqual([]);
  });
});
