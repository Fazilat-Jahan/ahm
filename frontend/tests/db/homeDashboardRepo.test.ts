import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { getDb } from "@/lib/db/schema";
import {
  getCompletedActionIds,
  getLatestEvaluation,
  getLatestLog,
  getRecentLogs,
  registerAstronaut,
  saveCheckin,
  setActionCompleted,
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

describe("getLatestLog / getLatestEvaluation", () => {
  it("return undefined for an astronaut with no check-ins", async () => {
    const astronaut = await registerAstronaut(baseInput);
    expect(await getLatestLog(astronaut.id)).toBeUndefined();
    expect(await getLatestEvaluation(astronaut.id)).toBeUndefined();
  });

  it("return the most recent log/evaluation, not the first saved", async () => {
    const astronaut = await registerAstronaut(baseInput);
    await saveCheckin({
      astronautId: astronaut.id,
      date: "2026-06-12",
      isBackdated: false,
      measurements: { heart_rate: 70 },
      selfHarmThoughts: false,
      symptoms: [],
      followups: [],
      mission,
    });
    const latest = await saveCheckin({
      astronautId: astronaut.id,
      date: "2026-06-14",
      isBackdated: false,
      measurements: { heart_rate: 80 },
      selfHarmThoughts: false,
      symptoms: [],
      followups: [],
      mission,
    });

    const log = await getLatestLog(astronaut.id);
    expect(log?.date).toBe("2026-06-14");
    expect(log?.heart_rate).toBe(80);

    const evaluation = await getLatestEvaluation(astronaut.id);
    expect(evaluation?.id).toBe(latest.evaluationId);
    expect(evaluation?.date).toBe("2026-06-14");
  });

  it("scopes to the given astronaut only", async () => {
    const a = await registerAstronaut(baseInput);
    const b = await registerAstronaut({
      ...baseInput,
      crewCode: "AST-002",
      name: "Second",
    });
    await saveCheckin({
      astronautId: a.id,
      date: "2026-06-14",
      isBackdated: false,
      measurements: { heart_rate: 70 },
      selfHarmThoughts: false,
      symptoms: [],
      followups: [],
      mission,
    });

    expect(await getLatestLog(b.id)).toBeUndefined();
    expect(await getLatestEvaluation(b.id)).toBeUndefined();
  });
});

describe("getRecentLogs", () => {
  it("returns the most recent N logs, oldest first", async () => {
    const astronaut = await registerAstronaut(baseInput);
    for (const date of [
      "2026-06-10",
      "2026-06-11",
      "2026-06-12",
      "2026-06-13",
    ]) {
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

    const recent = await getRecentLogs(astronaut.id, 2);
    expect(recent.map((l) => l.date)).toEqual(["2026-06-12", "2026-06-13"]);
  });
});

describe("setActionCompleted / getCompletedActionIds", () => {
  it("marks an action completed and reflects it back", async () => {
    const astronaut = await registerAstronaut(baseInput);
    await setActionCompleted(
      astronaut.id,
      "2026-06-15",
      "action-1",
      "eval-1",
      true,
    );

    const completed = await getCompletedActionIds(astronaut.id, "2026-06-15");
    expect(completed.has("action-1")).toBe(true);
  });

  it("unmarking removes it", async () => {
    const astronaut = await registerAstronaut(baseInput);
    await setActionCompleted(
      astronaut.id,
      "2026-06-15",
      "action-1",
      "eval-1",
      true,
    );
    await setActionCompleted(
      astronaut.id,
      "2026-06-15",
      "action-1",
      "eval-1",
      false,
    );

    const completed = await getCompletedActionIds(astronaut.id, "2026-06-15");
    expect(completed.has("action-1")).toBe(false);
  });

  it("scopes to astronaut and date", async () => {
    const a = await registerAstronaut(baseInput);
    const b = await registerAstronaut({
      ...baseInput,
      crewCode: "AST-002",
      name: "Second",
    });
    await setActionCompleted(a.id, "2026-06-15", "action-1", "eval-1", true);

    expect(
      (await getCompletedActionIds(b.id, "2026-06-15")).has("action-1"),
    ).toBe(false);
    expect(
      (await getCompletedActionIds(a.id, "2026-06-16")).has("action-1"),
    ).toBe(false);
  });

  it("enqueues an outbox row", async () => {
    const astronaut = await registerAstronaut(baseInput);
    await setActionCompleted(
      astronaut.id,
      "2026-06-15",
      "action-1",
      "eval-1",
      true,
    );
    const outbox = await getDb().outbox.toArray();
    expect(outbox.some((o) => o.entity === "advice_followup")).toBe(true);
  });
});
