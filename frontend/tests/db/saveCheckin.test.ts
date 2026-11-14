import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { getDb } from "@/lib/db/schema";
import {
  getHistoryForEngine,
  getPriorCheckin,
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

describe("saveCheckin", () => {
  it("saves log, symptoms, evaluation, and outbox rows in one go", async () => {
    const astronaut = await registerAstronaut(baseInput);
    const result = await saveCheckin({
      astronautId: astronaut.id,
      date: "2026-06-15",
      isBackdated: false,
      measurements: { heart_rate: 72 },
      mood: 4,
      stress: 2,
      selfHarmThoughts: false,
      symptoms: [{ symptom: "headache", severity: 1 }],
      followups: [],
      mission,
    });

    expect(result.log.heart_rate).toBe(72);
    expect(result.evaluation.overall).toBe("green");

    const symptoms = await getDb()
      .symptoms.where("logId")
      .equals(result.log.id)
      .toArray();
    expect(symptoms).toHaveLength(1);
    expect(symptoms[0]).toMatchObject({ symptom: "headache", severity: 1 });

    const stored = await getDb().evaluations.get(result.evaluationId);
    expect(stored?.rulesVersion).toBe(result.evaluation.rulesVersion);
    expect(stored?.overallStatus).toBe("green");

    const outbox = await getDb().outbox.toArray();
    const entities = outbox.map((o) => o.entity);
    expect(entities).toContain("daily_log");
    expect(entities).toContain("symptom_entry");
    expect(entities).toContain("evaluation");
  });

  it("fires CMB-CHEST-01 and escalates to critical/emergency for chest pain", async () => {
    const astronaut = await registerAstronaut(baseInput);
    const result = await saveCheckin({
      astronautId: astronaut.id,
      date: "2026-06-15",
      isBackdated: false,
      measurements: {},
      selfHarmThoughts: false,
      symptoms: [{ symptom: "chest_pain", severity: 2 }],
      followups: [],
      mission,
    });

    expect(result.evaluation.overall).toBe("critical");
    expect(result.evaluation.flags.map((f) => f.id)).toContain("CMB-CHEST-01");
    expect(result.evaluation.escalation?.level).toBe("emergency");
  });

  it("fires CMB-SAFETY-01 on the safety question regardless of mood", async () => {
    const astronaut = await registerAstronaut(baseInput);
    const result = await saveCheckin({
      astronautId: astronaut.id,
      date: "2026-06-15",
      isBackdated: false,
      measurements: {},
      mood: 5,
      selfHarmThoughts: true,
      symptoms: [],
      followups: [],
      mission,
    });

    expect(result.evaluation.overall).toBe("critical");
    expect(result.evaluation.flags.map((f) => f.id)).toContain("CMB-SAFETY-01");
    expect(result.evaluation.escalation?.level).toBe("emergency");
  });

  it("replaces symptoms on a re-save of the same date instead of appending", async () => {
    const astronaut = await registerAstronaut(baseInput);
    const first = await saveCheckin({
      astronautId: astronaut.id,
      date: "2026-06-15",
      isBackdated: false,
      measurements: {},
      selfHarmThoughts: false,
      symptoms: [{ symptom: "headache", severity: 1 }],
      followups: [],
      mission,
    });
    const second = await saveCheckin({
      astronautId: astronaut.id,
      date: "2026-06-15",
      isBackdated: false,
      measurements: {},
      selfHarmThoughts: false,
      symptoms: [{ symptom: "fatigue", severity: 2 }],
      followups: [],
      mission,
    });

    expect(second.log.id).toBe(first.log.id);
    const symptoms = await getDb()
      .symptoms.where("logId")
      .equals(first.log.id)
      .toArray();
    expect(symptoms).toHaveLength(1);
    expect(symptoms[0].symptom).toBe("fatigue");
  });

  it("saves followup answers tied to the prior evaluation", async () => {
    const astronaut = await registerAstronaut(baseInput);
    const y = await saveCheckin({
      astronautId: astronaut.id,
      date: "2026-06-14",
      isBackdated: false,
      measurements: { heart_rate: 110 },
      selfHarmThoughts: false,
      symptoms: [],
      followups: [],
      mission,
    });

    await saveCheckin({
      astronautId: astronaut.id,
      date: "2026-06-15",
      isBackdated: false,
      measurements: {},
      selfHarmThoughts: false,
      symptoms: [],
      followups: [
        {
          actionId: y.evaluation.actions[0]?.id ?? "HR-01-tip",
          evaluationId: y.evaluationId,
          response: "yes",
        },
      ],
      mission,
    });

    const followups = await getDb()
      .followups.where("astronautId")
      .equals(astronaut.id)
      .toArray();
    expect(followups).toHaveLength(1);
    expect(followups[0]).toMatchObject({
      evaluationId: y.evaluationId,
      response: "yes",
    });
  });
});

describe("getPriorCheckin", () => {
  it("returns undefined when there is no previous log", async () => {
    const astronaut = await registerAstronaut(baseInput);
    expect(await getPriorCheckin(astronaut.id, "2026-06-15")).toBeUndefined();
  });

  it("returns the most recent log before the given date, with its evaluation", async () => {
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
      measurements: { heart_rate: 75 },
      selfHarmThoughts: false,
      symptoms: [],
      followups: [],
      mission,
    });

    const prior = await getPriorCheckin(astronaut.id, "2026-06-15");
    expect(prior?.log.date).toBe("2026-06-14");
    expect(prior?.log.heart_rate).toBe(75);
    expect(prior?.evaluation?.id).toBe(latest.evaluationId);
  });
});

describe("getHistoryForEngine", () => {
  it("returns prior days most-recent-first, excluding the current date", async () => {
    const astronaut = await registerAstronaut(baseInput);
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
    await saveCheckin({
      astronautId: astronaut.id,
      date: "2026-06-14",
      isBackdated: false,
      measurements: { heart_rate: 72 },
      selfHarmThoughts: false,
      symptoms: [{ symptom: "fatigue", severity: 1 }],
      followups: [],
      mission,
    });

    const history = await getHistoryForEngine(astronaut.id, "2026-06-15");
    expect(history).toHaveLength(2);
    expect(history[0].date).toBe("2026-06-14");
    expect(history[0].log.heart_rate).toBe(72);
    expect(history[0].symptoms).toEqual([{ symptom: "fatigue", severity: 1 }]);
    expect(history[1].date).toBe("2026-06-13");
  });
});
