import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { getDb } from "@/lib/db/schema";
import { registerAstronaut, saveLog } from "@/lib/db/repo";
import {
  claimReminderFire,
  createReminder,
  createReminders,
  deleteReminder,
  dismissReminderBanner,
  getReminderFireStates,
  getReminderSetupState,
  listAllReminders,
  listReminderBanners,
  listReminders,
  setReminderSetupState,
  updateReminder,
} from "@/lib/db/reminderRepo";
import {
  reminderFormSchema,
  reminderSetupSchema,
} from "@/lib/db/reminderSchema";
import { getMissionDate } from "@/lib/time/missionDate";

beforeEach(async () => {
  const db = getDb();
  await Promise.all([
    db.astronauts.clear(),
    db.reminders.clear(),
    db.settings.clear(),
    db.outbox.clear(),
    db.logs.clear(),
  ]);
});

const draft = {
  kind: "custom" as const,
  label: "Stretch",
  time: "10:00",
  enabled: true,
};

async function twoAstronauts() {
  const base = {
    role: "astronaut" as const,
    environment: "station" as const,
    missionStart: "2026-06-01",
    pin: "1234",
  };
  const a = await registerAstronaut({
    ...base,
    name: "Test One",
    crewCode: "TST-001",
  });
  const b = await registerAstronaut({
    ...base,
    name: "Test Two",
    crewCode: "TST-002",
  });
  await getDb().outbox.clear();
  return { a, b };
}

describe("reminder CRUD", () => {
  it("a fresh install has no reminders", async () => {
    expect(await listAllReminders()).toEqual([]);
  });

  it("creates a reminder and enqueues an outbox row", async () => {
    const row = await createReminder("a1", draft);
    expect(row).toMatchObject({ astronautId: "a1", version: 1, ...draft });
    expect(await listReminders("a1")).toHaveLength(1);
    const outbox = await getDb().outbox.toArray();
    expect(outbox).toHaveLength(1);
    expect(outbox[0]).toMatchObject({
      entity: "reminder",
      entityId: row.id,
      op: "upsert",
    });
  });

  it("is scoped per astronaut", async () => {
    await createReminder("a1", draft);
    await createReminders("a2", [draft, { ...draft, time: "08:00" }]);
    expect(await listReminders("a1")).toHaveLength(1);
    const a2 = await listReminders("a2");
    expect(a2.map((r) => r.time)).toEqual(["08:00", "10:00"]);
  });

  it("updates, bumps the version and enqueues an outbox row", async () => {
    const row = await createReminder("a1", { ...draft, weekday: 3 });
    const updated = await updateReminder("a1", row.id, {
      enabled: false,
      time: "11:15",
      weekday: null,
    });
    expect(updated).toMatchObject({
      enabled: false,
      time: "11:15",
      version: 2,
    });
    expect(updated?.weekday).toBeUndefined();
    expect(await getDb().outbox.count()).toBe(2);
  });

  it("cannot update or delete another astronaut's reminder", async () => {
    const row = await createReminder("a1", draft);
    expect(
      await updateReminder("a2", row.id, { enabled: false }),
    ).toBeUndefined();
    expect(await deleteReminder("a2", row.id)).toBe(false);
    expect((await listReminders("a1"))[0].enabled).toBe(true);
  });

  it("deletes, clears its fire state and enqueues a delete row", async () => {
    const row = await createReminder("a1", draft);
    await claimReminderFire(row.id, new Date().toISOString());
    expect(await deleteReminder("a1", row.id)).toBe(true);
    expect(await listReminders("a1")).toEqual([]);
    expect(await getReminderFireStates()).toEqual({});
    const outbox = await getDb().outbox.toArray();
    expect(outbox.at(-1)).toMatchObject({ entity: "reminder", op: "delete" });
  });

  it("remembers the setup choice per astronaut", async () => {
    expect(await getReminderSetupState("a1")).toBeUndefined();
    await setReminderSetupState("a1", "skipped");
    expect(await getReminderSetupState("a1")).toBe("skipped");
    expect(await getReminderSetupState("a2")).toBeUndefined();
  });
});

describe("fire state", () => {
  it("claims an occurrence only once", async () => {
    const dueAt = new Date(2026, 10, 14, 8, 30).toISOString();
    expect(await claimReminderFire("r1", dueAt)).toBe(true);
    expect(await claimReminderFire("r1", dueAt)).toBe(false);
    const next = new Date(2026, 10, 15, 8, 30).toISOString();
    expect(await claimReminderFire("r1", next)).toBe(true);
  });

  it("is not synced (no outbox row)", async () => {
    await claimReminderFire("r1", new Date().toISOString());
    await dismissReminderBanner("r1");
    expect(await getDb().outbox.count()).toBe(0);
  });
});

describe("listReminderBanners", () => {
  const now = new Date(2026, 10, 14, 9, 0);
  const dueAt = new Date(2026, 10, 14, 8, 30).toISOString();

  it("shows a fired reminder to its own astronaut only", async () => {
    const { a, b } = await twoAstronauts();
    const row = await createReminder(a.id, { ...draft, time: "08:30" });
    await claimReminderFire(row.id, dueAt);

    const own = await listReminderBanners(now, a.id);
    expect(own).toHaveLength(1);
    expect(own[0].astronaut.crewCode).toBe("TST-001");
    expect(await listReminderBanners(now, b.id)).toEqual([]);
    // Locked Crew screen: everyone's, labelled by owner.
    expect(await listReminderBanners(now)).toHaveLength(1);
  });

  it("hides a dismissed banner", async () => {
    const { a } = await twoAstronauts();
    const row = await createReminder(a.id, { ...draft, time: "08:30" });
    await claimReminderFire(row.id, dueAt);
    await dismissReminderBanner(row.id);
    expect(await listReminderBanners(now, a.id)).toEqual([]);
  });

  it("hides the check-in banner once today's check-in is saved", async () => {
    const { a } = await twoAstronauts();
    const row = await createReminder(a.id, {
      kind: "checkin",
      label: "Daily check-in",
      time: "08:30",
      enabled: true,
    });
    await claimReminderFire(row.id, dueAt);
    expect(await listReminderBanners(now, a.id)).toHaveLength(1);

    await saveLog({
      astronautId: a.id,
      date: getMissionDate(now),
      isBackdated: false,
      measurements: {},
    });
    expect(await listReminderBanners(now, a.id)).toEqual([]);
  });
});

describe("reminder form validation", () => {
  it("accepts a valid reminder", () => {
    expect(
      reminderFormSchema.safeParse({ label: "BP", time: "07:05", weekday: "" })
        .success,
    ).toBe(true);
  });

  it("rejects an empty name and an impossible time", () => {
    expect(
      reminderFormSchema.safeParse({ label: " ", time: "07:05", weekday: "" })
        .success,
    ).toBe(false);
    expect(
      reminderFormSchema.safeParse({ label: "BP", time: "25:00", weekday: "" })
        .success,
    ).toBe(false);
  });

  const setup = {
    wakeTime: "07:00",
    checkinEnabled: true,
    glucoseEnabled: false,
    glucoseTime: "",
    middayEnabled: false,
    middayTime: "",
    eveningEnabled: false,
    eveningTime: "",
    weeklyEnabled: false,
    weeklyWeekday: "",
    weeklyTime: "",
  };

  it("setup needs a wake time for the daily check-in", () => {
    expect(reminderSetupSchema.safeParse(setup).success).toBe(true);
    expect(
      reminderSetupSchema.safeParse({ ...setup, wakeTime: "" }).success,
    ).toBe(false);
  });

  it("setup needs a time for every switched-on row", () => {
    expect(
      reminderSetupSchema.safeParse({ ...setup, eveningEnabled: true }).success,
    ).toBe(false);
    expect(
      reminderSetupSchema.safeParse({
        ...setup,
        eveningEnabled: true,
        eveningTime: "20:30",
      }).success,
    ).toBe(true);
    expect(
      reminderSetupSchema.safeParse({
        ...setup,
        weeklyEnabled: true,
        weeklyTime: "09:00",
      }).success,
    ).toBe(false);
  });

  it("setup rejects everything switched off", () => {
    expect(
      reminderSetupSchema.safeParse({ ...setup, checkinEnabled: false })
        .success,
    ).toBe(false);
  });
});
