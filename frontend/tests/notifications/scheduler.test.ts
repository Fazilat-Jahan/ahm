import { describe, expect, it } from "vitest";
import type { Reminder, ReminderFireState } from "@/lib/db/schema";
import {
  addMinutesToTime,
  dueOccurrenceToday,
  getActiveBanners,
  getDueReminders,
  getMissedCheckinDueAt,
  msUntilNextFire,
  nextFireTime,
  occurrenceOn,
} from "@/lib/notifications/scheduler";
import { buildDefaultReminders } from "@/lib/notifications/defaults";
import { evaluateMissedCheckin } from "@/lib/rules/trends";

/** Local-time Date, so the tests do not depend on the machine's timezone. */
function at(day: number, hour: number, minute: number, second = 0): Date {
  return new Date(2026, 10, day, hour, minute, second); // November 2026
}

function reminder(overrides: Partial<Reminder> = {}): Reminder {
  return {
    id: "r1",
    astronautId: "a1",
    kind: "custom",
    label: "Test reminder",
    time: "08:30",
    enabled: true,
    createdAt: at(1, 0, 0).toISOString(),
    updatedAt: at(1, 0, 0).toISOString(),
    version: 1,
    ...overrides,
  };
}

describe("addMinutesToTime", () => {
  it("adds minutes within the day", () => {
    expect(addMinutesToTime("07:00", 30)).toBe("07:30");
    expect(addMinutesToTime("07:45", 30)).toBe("08:15");
  });

  it("wraps past midnight", () => {
    expect(addMinutesToTime("23:50", 30)).toBe("00:20");
  });

  it("rejects a malformed time", () => {
    expect(() => addMinutesToTime("7am", 30)).toThrow();
  });
});

describe("occurrenceOn / nextFireTime", () => {
  it("daily reminder later today fires today", () => {
    expect(nextFireTime(reminder(), at(14, 8, 0))).toEqual(at(14, 8, 30));
  });

  it("daily reminder already past fires tomorrow", () => {
    expect(nextFireTime(reminder(), at(14, 8, 30))).toEqual(at(15, 8, 30));
    expect(nextFireTime(reminder(), at(14, 9, 0))).toEqual(at(15, 8, 30));
  });

  it("weekly reminder only occurs on its weekday", () => {
    // 14 Nov 2026 is a Saturday (6); 15 Nov is a Sunday (0).
    const weekly = reminder({ weekday: 0, time: "10:00" });
    expect(occurrenceOn(weekly, at(14, 12, 0))).toBeNull();
    expect(occurrenceOn(weekly, at(15, 12, 0))).toEqual(at(15, 10, 0));
    expect(nextFireTime(weekly, at(14, 12, 0))).toEqual(at(15, 10, 0));
  });

  it("weekly reminder past today's time waits a full week", () => {
    const weekly = reminder({ weekday: 6, time: "10:00" });
    expect(nextFireTime(weekly, at(14, 11, 0))).toEqual(at(21, 10, 0));
  });

  it("an unusable time is never scheduled", () => {
    expect(nextFireTime(reminder({ time: "nope" }), at(14, 8, 0))).toBeNull();
  });
});

describe("getDueReminders", () => {
  it("is not due before its time", () => {
    expect(getDueReminders([reminder()], {}, at(14, 8, 29, 59))).toEqual([]);
  });

  it("is due at its time and afterwards the same day", () => {
    expect(getDueReminders([reminder()], {}, at(14, 8, 30))).toHaveLength(1);
    const later = getDueReminders([reminder()], {}, at(14, 17, 0));
    expect(later).toHaveLength(1);
    expect(later[0].dueAt).toEqual(at(14, 8, 30));
  });

  it("a disabled reminder never fires", () => {
    expect(
      getDueReminders([reminder({ enabled: false })], {}, at(14, 9, 0)),
    ).toEqual([]);
  });

  it("does not fire the same occurrence twice", () => {
    const fired: Record<string, ReminderFireState> = {
      r1: { dueAt: at(14, 8, 30).toISOString(), dismissed: false },
    };
    expect(getDueReminders([reminder()], fired, at(14, 9, 0))).toEqual([]);
  });

  it("fires again the next day", () => {
    const fired: Record<string, ReminderFireState> = {
      r1: { dueAt: at(14, 8, 30).toISOString(), dismissed: true },
    };
    expect(getDueReminders([reminder()], fired, at(15, 8, 31))).toHaveLength(1);
  });

  it("does not fire an occurrence from before it was created or edited", () => {
    const editedAfternoon = reminder({
      updatedAt: at(14, 15, 0).toISOString(),
    });
    expect(getDueReminders([editedAfternoon], {}, at(14, 15, 1))).toEqual([]);
    // ...but it fires normally the next morning.
    expect(getDueReminders([editedAfternoon], {}, at(15, 8, 30))).toHaveLength(
      1,
    );
  });

  it("a reminder set 2 minutes ahead becomes due 2 minutes later", () => {
    const soon = reminder({
      time: "10:02",
      updatedAt: at(14, 10, 0, 20).toISOString(),
    });
    expect(getDueReminders([soon], {}, at(14, 10, 1, 59))).toEqual([]);
    expect(getDueReminders([soon], {}, at(14, 10, 2, 0))).toHaveLength(1);
  });

  it("a reminder saved during its own minute still counts", () => {
    const sameMinute = reminder({
      time: "10:00",
      updatedAt: at(14, 10, 0, 20).toISOString(),
    });
    expect(dueOccurrenceToday(sameMinute, at(14, 10, 0, 30))).toEqual(
      at(14, 10, 0),
    );
  });
});

describe("msUntilNextFire", () => {
  it("returns the earliest enabled reminder", () => {
    const reminders = [
      reminder({ id: "a", time: "12:00" }),
      reminder({ id: "b", time: "09:00" }),
      reminder({ id: "c", time: "08:45", enabled: false }),
    ];
    expect(msUntilNextFire(reminders, at(14, 8, 30))).toBe(30 * 60 * 1000);
  });

  it("is null with nothing enabled", () => {
    expect(msUntilNextFire([], at(14, 8, 30))).toBeNull();
    expect(
      msUntilNextFire([reminder({ enabled: false })], at(14, 8, 0)),
    ).toBeNull();
  });
});

describe("getActiveBanners", () => {
  const fired = (dismissed: boolean, when = at(14, 8, 30)) => ({
    r1: { dueAt: when.toISOString(), dismissed },
  });

  it("shows a reminder that fired today and was not dismissed", () => {
    expect(
      getActiveBanners([reminder()], fired(false), at(14, 13, 0)),
    ).toHaveLength(1);
  });

  it("hides dismissed, disabled, never-fired and earlier-day reminders", () => {
    expect(getActiveBanners([reminder()], fired(true), at(14, 13, 0))).toEqual(
      [],
    );
    expect(
      getActiveBanners(
        [reminder({ enabled: false })],
        fired(false),
        at(14, 13, 0),
      ),
    ).toEqual([]);
    expect(getActiveBanners([reminder()], {}, at(14, 13, 0))).toEqual([]);
    expect(getActiveBanners([reminder()], fired(false), at(15, 7, 0))).toEqual(
      [],
    );
  });
});

describe("getMissedCheckinDueAt (due + 2 h nudge)", () => {
  const checkin = reminder({ kind: "checkin", time: "08:00" });

  it("no nudge before due + 2 h", () => {
    expect(getMissedCheckinDueAt([checkin], false, at(14, 9, 59))).toBeNull();
  });

  it("nudges from due + 2 h when there is no check-in today", () => {
    expect(getMissedCheckinDueAt([checkin], false, at(14, 10, 0))).toEqual(
      at(14, 8, 0),
    );
  });

  it("no nudge once today's check-in exists", () => {
    expect(getMissedCheckinDueAt([checkin], true, at(14, 12, 0))).toBeNull();
  });

  it("ignores disabled and non-check-in reminders", () => {
    expect(
      getMissedCheckinDueAt(
        [reminder({ kind: "checkin", time: "08:00", enabled: false })],
        false,
        at(14, 12, 0),
      ),
    ).toBeNull();
    expect(
      getMissedCheckinDueAt(
        [reminder({ kind: "midday", time: "08:00" })],
        false,
        at(14, 12, 0),
      ),
    ).toBeNull();
  });

  it("no nudge with no reminders at all", () => {
    expect(getMissedCheckinDueAt([], false, at(14, 12, 0))).toBeNull();
  });
});

describe("evaluateMissedCheckin (TRD-MISS-01 without a new log)", () => {
  it("is null with no previous log", () => {
    expect(evaluateMissedCheckin(undefined, "2026-11-14")).toBeNull();
  });

  it("is null when the last log is today, yesterday, or 1 day missed", () => {
    expect(evaluateMissedCheckin("2026-11-14", "2026-11-14")).toBeNull();
    expect(evaluateMissedCheckin("2026-11-13", "2026-11-14")).toBeNull();
    expect(evaluateMissedCheckin("2026-11-12", "2026-11-14")).toBeNull();
  });

  it("is yellow after 2 missed days", () => {
    expect(evaluateMissedCheckin("2026-11-11", "2026-11-14")).toMatchObject({
      id: "TRD-MISS-01",
      status: "yellow",
      windowDays: 2,
    });
  });

  it("steps up after 4 missed days, like the in-engine rule", () => {
    expect(evaluateMissedCheckin("2026-11-09", "2026-11-14")).toMatchObject({
      id: "TRD-MISS-01",
      status: "red",
      windowDays: 4,
    });
  });
});

describe("buildDefaultReminders", () => {
  const off = {
    wakeTime: "",
    checkinEnabled: false,
    glucoseEnabled: false,
    middayEnabled: false,
    eveningEnabled: false,
    weeklyEnabled: false,
  };

  it("creates nothing when nothing is switched on", () => {
    expect(buildDefaultReminders(off)).toEqual([]);
  });

  it("daily check-in is the astronaut's wake time + 30 min", () => {
    expect(
      buildDefaultReminders({
        ...off,
        wakeTime: "06:45",
        checkinEnabled: true,
      }),
    ).toEqual([
      {
        kind: "checkin",
        label: "Daily check-in",
        time: "07:15",
        enabled: true,
      },
    ]);
  });

  it("uses exactly the times the astronaut chose", () => {
    const drafts = buildDefaultReminders({
      wakeTime: "07:00",
      checkinEnabled: true,
      glucoseEnabled: true,
      glucoseTime: "07:10",
      middayEnabled: true,
      middayTime: "12:30",
      eveningEnabled: true,
      eveningTime: "20:00",
      weeklyEnabled: true,
      weeklyWeekday: 1,
      weeklyTime: "09:00",
    });
    expect(drafts.map((d) => [d.kind, d.time, d.weekday])).toEqual([
      ["checkin", "07:30", undefined],
      ["glucose", "07:10", undefined],
      ["midday", "12:30", undefined],
      ["evening", "20:00", undefined],
      ["weekly", "09:00", 1],
    ]);
  });

  it("skips a switched-on row that has no time", () => {
    expect(buildDefaultReminders({ ...off, glucoseEnabled: true })).toEqual([]);
  });
});
