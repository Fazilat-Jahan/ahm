import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import {
  canViewCrew,
  canWriteNotes,
  effectiveStatus,
  filterAndSortCrew,
  type CrewOverviewRow,
} from "@/lib/crew/overview";
import {
  addSurgeonNote,
  CrewAccessError,
  getCrewOverview,
  getLastCheckinDates,
  listAuditLog,
  listSurgeonNotes,
  MAX_NOTE_LENGTH,
  recordCrewView,
} from "@/lib/db/crewRepo";
import { registerAstronaut, saveCheckin } from "@/lib/db/repo";
import { getDb, type Astronaut, type AstronautRole } from "@/lib/db/schema";
import { coalesceBatch } from "@/lib/sync/protocol";
import { daysAgo } from "@/lib/time/missionDate";

const TODAY = "2026-11-14";

beforeEach(async () => {
  const db = getDb();
  await Promise.all(db.tables.map((table) => table.clear()));
});

function reg(crewCode: string, role: AstronautRole = "astronaut") {
  return registerAstronaut({
    name: `Test ${crewCode}`,
    crewCode,
    role,
    environment: "station",
    missionStart: "2026-06-01",
    pin: "1234",
  });
}

function checkin(
  astronautId: string,
  date: string,
  measurements: Record<string, number> = { heart_rate: 72 },
  symptoms: { symptom: "chest_pain" | "headache"; severity: 1 | 2 | 3 }[] = [],
) {
  return saveCheckin({
    astronautId,
    date,
    isBackdated: false,
    measurements,
    selfHarmThoughts: false,
    symptoms,
    followups: [],
    mission: { environment: "station", missionDay: 100 },
  });
}

interface Crew {
  alice: Astronaut;
  bob: Astronaut;
  commander: Astronaut;
  surgeon: Astronaut;
  admin: Astronaut;
}

async function crew(): Promise<Crew> {
  return {
    alice: await reg("AST-001"),
    bob: await reg("AST-002"),
    commander: await reg("CDR-001", "commander"),
    surgeon: await reg("SRG-001", "surgeon"),
    admin: await reg("ADM-001", "admin"),
  };
}

describe("who may open the crew overview", () => {
  it("commander, surgeon and admin may; the astronaut role may not", () => {
    expect(canViewCrew("commander")).toBe(true);
    expect(canViewCrew("surgeon")).toBe(true);
    expect(canViewCrew("admin")).toBe(true);
    expect(canViewCrew("astronaut")).toBe(false);
    expect(canViewCrew(undefined)).toBe(false);
  });

  it("only the surgeon may write notes", () => {
    expect(canWriteNotes("surgeon")).toBe(true);
    expect(canWriteNotes("commander")).toBe(false);
    expect(canWriteNotes("admin")).toBe(false);
    expect(canWriteNotes("astronaut")).toBe(false);
  });

  it("every crew data function refuses the astronaut role", async () => {
    const { alice, bob } = await crew();
    await checkin(bob.id, TODAY);
    await expect(getCrewOverview(alice.id, TODAY)).rejects.toBeInstanceOf(
      CrewAccessError,
    );
    await expect(recordCrewView(alice.id, bob.id)).rejects.toBeInstanceOf(
      CrewAccessError,
    );
    await expect(listAuditLog(alice.id)).rejects.toBeInstanceOf(
      CrewAccessError,
    );
    await expect(listSurgeonNotes(alice.id, bob.id)).rejects.toBeInstanceOf(
      CrewAccessError,
    );
    await expect(addSurgeonNote(alice.id, bob.id, "x")).rejects.toBeInstanceOf(
      CrewAccessError,
    );
    await expect(getCrewOverview("no-such-id", TODAY)).rejects.toBeInstanceOf(
      CrewAccessError,
    );
    // Nothing was written by the refused attempts.
    expect(await getDb().auditLog.count()).toBe(0);
    expect(await getDb().surgeonNotes.count()).toBe(0);
  });
});

describe("getCrewOverview", () => {
  it("lists every astronaut; one with no check-in has no status, flags or sparklines", async () => {
    const { commander } = await crew();
    const rows = await getCrewOverview(commander.id, TODAY);
    expect(rows.map((r) => r.crewCode).sort()).toEqual([
      "ADM-001",
      "AST-001",
      "AST-002",
      "CDR-001",
      "SRG-001",
    ]);
    for (const row of rows) {
      expect(row.overallStatus).toBeUndefined();
      expect(row.lastCheckinDate).toBeUndefined();
      expect(row.flags).toEqual([]);
      expect(row.sparklines).toEqual({
        heart_rate: [],
        sleep_hours: [],
        mood: [],
      });
    }
    // No PIN material in what the screen receives.
    expect(JSON.stringify(rows)).not.toContain("pinHash");
  });

  it("shows the real last check-in, status, flags and 7-day values", async () => {
    const { alice, bob, surgeon } = await crew();
    for (let i = 8; i >= 0; i--) {
      await checkin(alice.id, daysAgo(i, TODAY), {
        heart_rate: 60 + i,
        sleep_hours: 7,
      });
    }
    await checkin(bob.id, TODAY, { heart_rate: 72 }, [
      { symptom: "chest_pain", severity: 3 },
    ]);

    const rows = await getCrewOverview(surgeon.id, TODAY);
    const a = rows.find((r) => r.id === alice.id)!;
    expect(a.lastCheckinDate).toBe(TODAY);
    expect(a.overallStatus).toBe("green");
    expect(a.statusDate).toBe(TODAY);
    // Last 7 logged days, oldest first: 66 .. 60.
    expect(a.sparklines.heart_rate).toEqual([66, 65, 64, 63, 62, 61, 60]);
    expect(a.sparklines.sleep_hours).toHaveLength(7);
    expect(a.sparklines.mood).toEqual([]); // never logged: nothing invented

    const b = rows.find((r) => r.id === bob.id)!;
    expect(b.overallStatus).toBe("critical");
    expect(b.flags[0]).toMatchObject({
      id: "CMB-CHEST-01",
      status: "critical",
    });
  });

  it("raises the missed-check-in alert without a new check-in", async () => {
    const { alice, commander } = await crew();
    await checkin(alice.id, daysAgo(5, TODAY));
    const row = (await getCrewOverview(commander.id, TODAY)).find(
      (r) => r.id === alice.id,
    )!;
    expect(row.overallStatus).toBe("green"); // the last stored result
    expect(row.flags).toEqual([
      expect.objectContaining({ id: "TRD-MISS-01", status: "red" }),
    ]);
    expect(effectiveStatus(row)).toBe("red");
  });

  it("only reads: opening the overview writes nothing", async () => {
    const { alice, commander } = await crew();
    await checkin(alice.id, TODAY);
    const before = await getDb().outbox.count();
    await getCrewOverview(commander.id, TODAY);
    expect(await getDb().outbox.count()).toBe(before);
  });
});

describe("search and sort", () => {
  const row = (
    crewCode: string,
    name: string,
    over: Partial<CrewOverviewRow> = {},
  ): CrewOverviewRow => ({
    id: crewCode,
    name,
    crewCode,
    role: "astronaut",
    flags: [],
    sparklines: { heart_rate: [], sleep_hours: [], mood: [] },
    ...over,
  });
  const rows = [
    row("AST-003", "Chen", {
      overallStatus: "green",
      lastCheckinDate: "2026-11-14",
    }),
    row("AST-001", "Amara", {
      overallStatus: "yellow",
      lastCheckinDate: "2026-11-12",
    }),
    row("AST-004", "Dmitri"),
    row("AST-002", "Bo", {
      overallStatus: "critical",
      lastCheckinDate: "2026-11-13",
    }),
    row("AST-005", "Elena", {
      overallStatus: "green",
      lastCheckinDate: "2026-11-09",
      flags: [
        {
          id: "TRD-MISS-01",
          status: "red",
          message: "No check-in for 4 days.",
        },
      ],
    }),
  ];
  const codes = (list: CrewOverviewRow[]) => list.map((r) => r.crewCode);

  it("sorts by status, worst first, no data last", () => {
    expect(codes(filterAndSortCrew(rows, "", "status"))).toEqual([
      "AST-002", // critical
      "AST-005", // green result but a red flag
      "AST-001", // yellow
      "AST-003", // green
      "AST-004", // no data
    ]);
  });

  it("sorts by name and by last check-in", () => {
    expect(codes(filterAndSortCrew(rows, "", "name"))).toEqual([
      "AST-001",
      "AST-002",
      "AST-003",
      "AST-004",
      "AST-005",
    ]);
    expect(codes(filterAndSortCrew(rows, "", "last_checkin"))).toEqual([
      "AST-004", // never
      "AST-005",
      "AST-001",
      "AST-002",
      "AST-003",
    ]);
  });

  it("searches by name or crew ID, case-insensitively", () => {
    expect(codes(filterAndSortCrew(rows, "amar", "status"))).toEqual([
      "AST-001",
    ]);
    expect(codes(filterAndSortCrew(rows, "ast-00", "name"))).toHaveLength(5);
    expect(codes(filterAndSortCrew(rows, " 004 ", "name"))).toEqual([
      "AST-004",
    ]);
    expect(filterAndSortCrew(rows, "zzz", "status")).toEqual([]);
  });

  it("does not change the list it was given", () => {
    const before = codes(rows);
    filterAndSortCrew(rows, "", "status");
    expect(codes(rows)).toEqual(before);
  });
});

describe("access log", () => {
  it("records who opened whom, and queues it for sync", async () => {
    const { alice, bob, surgeon, commander } = await crew();
    await getDb().outbox.clear();
    await recordCrewView(surgeon.id, alice.id);
    await recordCrewView(commander.id, bob.id);

    const log = await listAuditLog(surgeon.id);
    expect(log).toHaveLength(2);
    expect(
      log.map((e) => `${e.viewerCrewCode}>${e.astronautCrewCode}`).sort(),
    ).toEqual(["CDR-001>AST-002", "SRG-001>AST-001"]);
    expect(log[0]).toMatchObject({ action: "view" });
    expect(log.find((e) => e.viewerCrewCode === "SRG-001")).toMatchObject({
      viewerRole: "surgeon",
      viewerName: "Test SRG-001",
      astronautName: "Test AST-001",
    });

    const items = coalesceBatch(await getDb().outbox.toArray());
    expect(items.map((i) => i.entity)).toEqual(["audit_entry", "audit_entry"]);
    expect(items[0].op).toBe("upsert");
  });

  it("looking at your own data is not logged", async () => {
    const { surgeon } = await crew();
    expect(await recordCrewView(surgeon.id, surgeon.id)).toBeUndefined();
    expect(await getDb().auditLog.count()).toBe(0);
  });
});

describe("surgeon notes", () => {
  it("the surgeon adds a note; commander and admin can read it", async () => {
    const { alice, bob, surgeon, commander, admin } = await crew();
    await getDb().outbox.clear();
    const note = await addSurgeonNote(
      surgeon.id,
      alice.id,
      "  Sleep looks short this week.  ",
    );
    expect(note).toMatchObject({
      astronautId: alice.id,
      authorId: surgeon.id,
      authorCrewCode: "SRG-001",
      text: "Sleep looks short this week.",
      version: 1,
    });
    for (const viewer of [surgeon, commander, admin]) {
      const notes = await listSurgeonNotes(viewer.id, alice.id);
      expect(notes.map((n) => n.text)).toEqual([
        "Sleep looks short this week.",
      ]);
    }
    // Scoped to the astronaut it is about.
    expect(await listSurgeonNotes(surgeon.id, bob.id)).toEqual([]);
    const items = coalesceBatch(await getDb().outbox.toArray());
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ entity: "surgeon_note", id: note.id });
  });

  it("commander, admin and astronaut cannot add notes", async () => {
    const { alice, commander, admin, bob } = await crew();
    for (const author of [commander, admin, bob]) {
      await expect(addSurgeonNote(author.id, alice.id, "note")).rejects.toThrow(
        /surgeon/,
      );
    }
    expect(await getDb().surgeonNotes.count()).toBe(0);
  });

  it("rejects empty and over-long notes", async () => {
    const { alice, surgeon } = await crew();
    await expect(addSurgeonNote(surgeon.id, alice.id, "   ")).rejects.toThrow();
    await expect(
      addSurgeonNote(surgeon.id, alice.id, "x".repeat(MAX_NOTE_LENGTH + 1)),
    ).rejects.toThrow();
    await addSurgeonNote(surgeon.id, alice.id, "x".repeat(MAX_NOTE_LENGTH));
    expect(await getDb().surgeonNotes.count()).toBe(1);
  });

  it("a note never changes the astronaut's health data", async () => {
    const { alice, surgeon } = await crew();
    await checkin(alice.id, TODAY);
    const db = getDb();
    const before = JSON.stringify([
      await db.logs.toArray(),
      await db.symptoms.toArray(),
      await db.evaluations.toArray(),
      await db.followups.toArray(),
    ]);
    await addSurgeonNote(surgeon.id, alice.id, "Reviewed.");
    await recordCrewView(surgeon.id, alice.id);
    const after = JSON.stringify([
      await db.logs.toArray(),
      await db.symptoms.toArray(),
      await db.evaluations.toArray(),
      await db.followups.toArray(),
    ]);
    expect(after).toBe(before);
  });
});

describe("crew picker card", () => {
  it("knows each astronaut's last check-in date (and nothing else)", async () => {
    const { alice, bob } = await crew();
    await checkin(alice.id, daysAgo(2, TODAY));
    await checkin(alice.id, TODAY);
    expect(await getLastCheckinDates()).toEqual({ [alice.id]: TODAY });
    expect((await getLastCheckinDates())[bob.id]).toBeUndefined();
  });
});
