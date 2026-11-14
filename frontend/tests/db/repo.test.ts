import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { getDb } from "@/lib/db/schema";
import {
  DuplicateCrewCodeError,
  getLogForDate,
  listAstronauts,
  registerAstronaut,
  saveLog,
  verifyAstronautPin,
} from "@/lib/db/repo";

beforeEach(async () => {
  const db = getDb();
  await db.astronauts.clear();
  await db.outbox.clear();
  await db.logs.clear();
});

const baseInput = {
  name: "Alex Rivera",
  crewCode: "AST-001",
  role: "astronaut" as const,
  environment: "station" as const,
  missionStart: "2026-06-01",
  pin: "1234",
};

describe("registerAstronaut", () => {
  it("fresh install has no astronauts", async () => {
    expect(await listAstronauts()).toEqual([]);
  });

  it("creates an astronaut and enqueues an outbox row", async () => {
    const astronaut = await registerAstronaut(baseInput);
    expect(astronaut.id).toBeTruthy();
    expect(astronaut.crewCode).toBe("AST-001");
    expect(astronaut.pinHash).not.toContain("1234");

    const all = await listAstronauts();
    expect(all).toHaveLength(1);

    const outbox = await getDb().outbox.toArray();
    expect(outbox).toHaveLength(1);
    expect(outbox[0]).toMatchObject({ entity: "astronaut", op: "upsert" });
  });

  it("rejects a duplicate crew code", async () => {
    await registerAstronaut(baseInput);
    await expect(
      registerAstronaut({ ...baseInput, name: "Someone Else" }),
    ).rejects.toThrow(DuplicateCrewCodeError);

    expect(await listAstronauts()).toHaveLength(1);
  });

  it("allows two astronauts with different crew codes", async () => {
    await registerAstronaut(baseInput);
    await registerAstronaut({
      ...baseInput,
      crewCode: "AST-002",
      name: "Second Person",
    });
    expect(await listAstronauts()).toHaveLength(2);
  });
});

describe("verifyAstronautPin", () => {
  it("accepts the correct PIN", async () => {
    const astronaut = await registerAstronaut(baseInput);
    expect(await verifyAstronautPin(astronaut.id, "1234")).toBe(true);
  });

  it("rejects an incorrect PIN", async () => {
    const astronaut = await registerAstronaut(baseInput);
    expect(await verifyAstronautPin(astronaut.id, "9999")).toBe(false);
  });

  it("returns false for an unknown astronaut id", async () => {
    expect(await verifyAstronautPin("does-not-exist", "1234")).toBe(false);
  });
});

describe("saveLog", () => {
  it("creates a log scoped to the given astronaut and enqueues an outbox row", async () => {
    const astronaut = await registerAstronaut(baseInput);
    const log = await saveLog({
      astronautId: astronaut.id,
      date: "2026-06-15",
      isBackdated: false,
      measurements: { heart_rate: 72 },
    });

    expect(log.astronautId).toBe(astronaut.id);
    expect(log.heart_rate).toBe(72);

    const found = await getLogForDate(astronaut.id, "2026-06-15");
    expect(found?.id).toBe(log.id);

    const outbox = await getDb().outbox.toArray();
    expect(
      outbox.some((o) => o.entity === "daily_log" && o.entityId === log.id),
    ).toBe(true);
  });

  it("updates in place instead of creating a duplicate for the same astronaut+date", async () => {
    const astronaut = await registerAstronaut(baseInput);
    const first = await saveLog({
      astronautId: astronaut.id,
      date: "2026-06-15",
      isBackdated: false,
      measurements: { heart_rate: 72 },
    });
    const second = await saveLog({
      astronautId: astronaut.id,
      date: "2026-06-15",
      isBackdated: false,
      measurements: { heart_rate: 80 },
    });

    expect(second.id).toBe(first.id);
    expect(second.version).toBe(first.version + 1);

    const all = await getDb()
      .logs.where("astronautId")
      .equals(astronaut.id)
      .toArray();
    expect(all).toHaveLength(1);
    expect(all[0].heart_rate).toBe(80);
  });

  it("a field left out of a re-save is cleared, not silently kept", async () => {
    const astronaut = await registerAstronaut(baseInput);
    await saveLog({
      astronautId: astronaut.id,
      date: "2026-06-15",
      isBackdated: false,
      measurements: { heart_rate: 72, spo2: 97 },
    });
    const resaved = await saveLog({
      astronautId: astronaut.id,
      date: "2026-06-15",
      isBackdated: false,
      measurements: { heart_rate: 75 },
    });

    expect(resaved.heart_rate).toBe(75);
    expect(resaved.spo2).toBeUndefined();
  });

  it("keeps two astronauts' logs for the same date separate", async () => {
    const a = await registerAstronaut(baseInput);
    const b = await registerAstronaut({
      ...baseInput,
      crewCode: "AST-002",
      name: "Second Person",
    });

    await saveLog({
      astronautId: a.id,
      date: "2026-06-15",
      isBackdated: false,
      measurements: { heart_rate: 72 },
    });
    await saveLog({
      astronautId: b.id,
      date: "2026-06-15",
      isBackdated: false,
      measurements: { heart_rate: 90 },
    });

    expect((await getLogForDate(a.id, "2026-06-15"))?.heart_rate).toBe(72);
    expect((await getLogForDate(b.id, "2026-06-15"))?.heart_rate).toBe(90);
  });

  it("stores firstReadings for a borderline two-phase measurement", async () => {
    const astronaut = await registerAstronaut(baseInput);
    const log = await saveLog({
      astronautId: astronaut.id,
      date: "2026-06-15",
      isBackdated: false,
      measurements: { heart_rate: 95 },
      firstReadings: { heart_rate: 115 },
    });

    expect(log.heart_rate).toBe(95);
    expect(log.firstReadings).toEqual({ heart_rate: 115 });
  });

  it("marks a backdated entry", async () => {
    const astronaut = await registerAstronaut(baseInput);
    const log = await saveLog({
      astronautId: astronaut.id,
      date: "2026-06-10",
      isBackdated: true,
      measurements: { heart_rate: 72 },
    });
    expect(log.isBackdated).toBe(true);
  });
});
