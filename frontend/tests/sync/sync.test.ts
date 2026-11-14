import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { createReminder } from "@/lib/db/reminderRepo";
import { registerAstronaut, saveCheckin } from "@/lib/db/repo";
import { getDb, type Astronaut, type DailyLog } from "@/lib/db/schema";
import {
  canReachBackend,
  createSyncApi,
  SyncFailure,
  type SyncApi,
} from "@/lib/sync/api";
import { applyPull, drainOutbox, runSync } from "@/lib/sync/engine";
import {
  buildExport,
  csvCell,
  ImportError,
  importExport,
  parseExport,
  toCsv,
  validateImportedLog,
} from "@/lib/sync/exportImport";
import {
  backoffDelayMs,
  coalesceBatch,
  normalizeServerUrl,
  type PullResponse,
  type PushItem,
  type PushResponse,
} from "@/lib/sync/protocol";
import {
  getDeviceId,
  getLastPulledAt,
  getLastSyncedAt,
  getPendingCount,
  getSyncConfig,
  listConflicts,
  listSyncIssues,
  saveSyncConfig,
} from "@/lib/sync/store";

const T = "2026-11-14T08:00:00.000Z";
const SERVER_TIME = "2026-11-14T12:00:00.000Z";

beforeEach(async () => {
  const db = getDb();
  await Promise.all(db.tables.map((table) => table.clear()));
});

function reg(crewCode = "TST-001"): Promise<Astronaut> {
  return registerAstronaut({
    name: `Test ${crewCode}`,
    crewCode,
    role: "astronaut",
    environment: "station",
    missionStart: "2026-06-01",
    pin: "1234",
  });
}

function checkin(astronautId: string, date = "2026-11-14") {
  return saveCheckin({
    astronautId,
    date,
    isBackdated: false,
    measurements: { heart_rate: 72 },
    selfHarmThoughts: false,
    symptoms: [{ symptom: "headache", severity: 1 }],
    followups: [],
    mission: { environment: "station", missionDay: 100 },
  });
}

const accepted = (items: PushItem[]): PushResponse => ({
  accepted: items.map((i) => i.id),
  conflicts: [],
  rejected: [],
  serverTime: SERVER_TIME,
});

/** A scripted server: records every batch it is sent. */
function fakeApi(
  respond: (items: PushItem[], call: number) => PushResponse | Error = accepted,
) {
  const batches: PushItem[][] = [];
  const api: SyncApi = {
    async push(_deviceId, items) {
      const answer = respond(items, batches.length);
      if (answer instanceof Error) throw answer;
      batches.push(items);
      return answer;
    },
    async pull() {
      return { serverTime: SERVER_TIME, changes: {} };
    },
  };
  return { api, batches };
}

async function addReminders(astronautId: string, count: number) {
  for (let i = 0; i < count; i++) {
    await createReminder(astronautId, {
      kind: "custom",
      label: `Reminder ${i}`,
      time: "10:00",
      enabled: true,
    });
  }
}

describe("backoff and addresses", () => {
  it("doubles from 2 s and stops at 5 minutes", () => {
    expect([0, 1, 2, 3, 4, 5].map(backoffDelayMs)).toEqual([
      0, 2000, 4000, 8000, 16000, 32000,
    ]);
    expect(backoffDelayMs(8)).toBe(256000);
    expect(backoffDelayMs(9)).toBe(300000);
    expect(backoffDelayMs(500)).toBe(300000);
  });

  it("normalises a server address", () => {
    expect(normalizeServerUrl(" http://192.168.1.10:8000/ ")).toBe(
      "http://192.168.1.10:8000",
    );
    expect(normalizeServerUrl("http://localhost:8000/api/v1")).toBe(
      "http://localhost:8000",
    );
    expect(normalizeServerUrl("192.168.1.10:8000")).toBeNull();
    expect(normalizeServerUrl("ftp://x")).toBeNull();
    expect(normalizeServerUrl("")).toBeNull();
  });
});

describe("canReachBackend (GET /health with a timeout)", () => {
  const ok = (async () => new Response("{}", { status: 200 })) as typeof fetch;

  it("is true only when /health answers OK", async () => {
    let asked = "";
    const fetchImpl = (async (url: RequestInfo | URL) => {
      asked = String(url);
      return new Response("{}", { status: 200 });
    }) as typeof fetch;
    expect(
      await canReachBackend("http://srv:8000", {
        fetchImpl,
        isOnline: () => true,
      }),
    ).toBe(true);
    expect(asked).toBe("http://srv:8000/api/v1/health");
  });

  it("does not trust navigator.onLine alone", async () => {
    // "Online" according to the browser, but the server does not answer.
    const dead = (async () => {
      throw new TypeError("Failed to fetch");
    }) as typeof fetch;
    expect(
      await canReachBackend("http://srv:8000", {
        fetchImpl: dead,
        isOnline: () => true,
      }),
    ).toBe(false);
    const broken = (async () =>
      new Response("", { status: 500 })) as typeof fetch;
    expect(
      await canReachBackend("http://srv:8000", {
        fetchImpl: broken,
        isOnline: () => true,
      }),
    ).toBe(false);
  });

  it("is false without asking when the browser is offline", async () => {
    let called = false;
    const fetchImpl = (async () => {
      called = true;
      return new Response("{}");
    }) as typeof fetch;
    expect(
      await canReachBackend("http://srv:8000", {
        fetchImpl,
        isOnline: () => false,
      }),
    ).toBe(false);
    expect(called).toBe(false);
  });

  it("gives up after the timeout", async () => {
    const hangs = ((_url: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () =>
          reject(new Error("aborted")),
        );
      })) as typeof fetch;
    const started = Date.now();
    expect(
      await canReachBackend("http://srv:8000", {
        fetchImpl: hangs,
        isOnline: () => true,
        timeoutMs: 50,
      }),
    ).toBe(false);
    expect(Date.now() - started).toBeLessThan(2000);
    expect(
      await canReachBackend("http://srv:8000", {
        fetchImpl: ok,
        isOnline: () => true,
      }),
    ).toBe(true);
  });
});

describe("push: outbox drain", () => {
  it("sends in batches of 50, in order, and empties the outbox", async () => {
    const a = await reg();
    await addReminders(a.id, 119); // + 1 astronaut row = 120
    expect(await getPendingCount()).toBe(120);

    const { api, batches } = fakeApi();
    const result = await drainOutbox(api, "device-1");

    expect(batches.map((b) => b.length)).toEqual([50, 50, 20]);
    expect(batches[0][0].entity).toBe("astronaut"); // oldest first
    expect(result).toEqual({ pushed: 120, conflicts: 0, rejected: 0 });
    expect(await getPendingCount()).toBe(0);
  });

  it("keeps everything not yet delivered when a batch fails, then retries exactly once each", async () => {
    const a = await reg();
    await addReminders(a.id, 119);
    const unreachable = new SyncFailure("unreachable", "down");
    const first = fakeApi((items, call) =>
      call === 1 ? unreachable : accepted(items),
    );

    await expect(drainOutbox(first.api, "device-1")).rejects.toBeInstanceOf(
      SyncFailure,
    );
    expect(first.batches).toHaveLength(1); // only the first batch got through
    expect(await getPendingCount()).toBe(70);

    // Link is back: the rest goes, and nothing is sent twice.
    const second = fakeApi();
    await drainOutbox(second.api, "device-1");
    expect(await getPendingCount()).toBe(0);
    const sentIds = [...first.batches, ...second.batches]
      .flat()
      .map((i) => i.id);
    expect(sentIds).toHaveLength(120);
    expect(new Set(sentIds).size).toBe(120);
  });

  it("re-sends the same rows if the server's answer was lost", async () => {
    const a = await reg();
    const sent: string[][] = [];
    const lossy: SyncApi = {
      async push(_d, items) {
        sent.push(items.map((i) => i.id));
        if (sent.length === 1) throw new SyncFailure("unreachable", "timeout");
        return accepted(items);
      },
      async pull() {
        return { serverTime: SERVER_TIME, changes: {} };
      },
    };
    await expect(drainOutbox(lossy, "d")).rejects.toBeInstanceOf(SyncFailure);
    expect(await getPendingCount()).toBe(1);
    await drainOutbox(lossy, "d");
    expect(sent).toEqual([[a.id], [a.id]]); // identical item: the server dedupes by id
    expect(await getPendingCount()).toBe(0);
  });

  it("sends each record once per batch, as its latest state", async () => {
    const a = await reg();
    const { log } = await checkin(a.id);
    await checkin(a.id); // update the same day's log
    const rows = await getDb().outbox.orderBy("seq").toArray();
    const items = coalesceBatch(rows);
    const logItems = items.filter((i) => i.id === log.id);
    expect(logItems).toHaveLength(1);
    expect(logItems[0].version).toBe(2);
    expect(items[0].entity).toBe("astronaut");
    // The record travels exactly as saved, app-only fields included.
    expect(logItems[0].data).toMatchObject({ id: log.id, heart_rate: 72 });
  });

  it("a refused record is reported, kept locally, and leaves the outbox", async () => {
    const a = await reg();
    const { api } = fakeApi((items) => ({
      accepted: [],
      conflicts: [],
      rejected: items.map((i) => ({
        id: i.id,
        entity: i.entity,
        reason: "crew ID taken",
      })),
      serverTime: SERVER_TIME,
    }));
    const result = await drainOutbox(api, "d");
    expect(result.rejected).toBe(1);
    expect(await getPendingCount()).toBe(0);
    expect(await getDb().astronauts.get(a.id)).toBeDefined();
    expect((await listSyncIssues())[0]).toMatchObject({
      id: a.id,
      reason: "crew ID taken",
    });
  });
});

describe("conflicts never lose data", () => {
  it("version conflict: server copy becomes live, local copy is kept", async () => {
    const a = await reg();
    const reminder = await createReminder(a.id, {
      kind: "custom",
      label: "Mine",
      time: "10:00",
      enabled: true,
    });
    const serverCopy = {
      ...reminder,
      label: "From the other device",
      version: 3,
      updatedAt: SERVER_TIME,
    };
    const { api } = fakeApi((items) => ({
      accepted: items.filter((i) => i.id !== reminder.id).map((i) => i.id),
      conflicts: [
        {
          id: reminder.id,
          entity: "reminder",
          kind: "version",
          serverVersion: 3,
          serverData: serverCopy,
          serverDeleted: false,
        },
      ],
      rejected: [],
      serverTime: SERVER_TIME,
    }));

    const result = await drainOutbox(api, "d");
    expect(result.conflicts).toBe(1);
    expect((await getDb().reminders.get(reminder.id))?.label).toBe(
      "From the other device",
    );
    const kept = await listConflicts(a.id);
    expect(kept).toHaveLength(1);
    expect(kept[0]).toMatchObject({
      entity: "reminder",
      kind: "version",
      loser: "local",
    });
    expect((kept[0].data as { label: string }).label).toBe("Mine");
    expect(await getPendingCount()).toBe(0);
  });

  it("two check-ins for one date: the local one and everything under it is kept", async () => {
    const a = await reg();
    const { log } = await checkin(a.id);
    const serverLog: DailyLog = {
      ...log,
      id: crypto.randomUUID(),
      heart_rate: 95,
      updatedAt: SERVER_TIME,
    };
    const { api } = fakeApi((items) => ({
      accepted: items.filter((i) => i.entity === "astronaut").map((i) => i.id),
      conflicts: items
        .filter((i) => i.entity !== "astronaut")
        .map((i) =>
          i.entity === "daily_log"
            ? {
                id: i.id,
                entity: i.entity,
                kind: "same_date" as const,
                serverVersion: 1,
                serverData: serverLog as unknown as Record<string, unknown>,
                serverDeleted: false,
              }
            : {
                id: i.id,
                entity: i.entity,
                kind: "parent_missing" as const,
                serverVersion: null,
                serverData: null,
                serverDeleted: false,
              },
        ),
      rejected: [],
      serverTime: SERVER_TIME,
    }));

    await drainOutbox(api, "d");

    const logs = await getDb().logs.where("astronautId").equals(a.id).toArray();
    expect(logs.map((l) => l.id)).toEqual([serverLog.id]); // one live log for the date
    expect(await getDb().symptoms.count()).toBe(0);
    const kept = await listConflicts(a.id);
    const entities = kept.map((c) => c.entity);
    expect(entities).toContain("daily_log");
    expect(entities).toContain("symptom_entry");
    expect(entities).toContain("evaluation");
    const keptLog = kept.find((c) => c.entity === "daily_log");
    expect((keptLog?.data as DailyLog).heart_rate).toBe(72);
    expect(await getPendingCount()).toBe(0);
  });
});

describe("pull", () => {
  const change = (data: Record<string, unknown>, extra = {}) => ({
    id: String(data.id),
    version: typeof data.version === "number" ? data.version : 1,
    updatedAt: SERVER_TIME,
    deleted: false,
    data,
    ...extra,
  });

  const remoteAstronaut = (crewCode = "RMT-001") => ({
    id: crypto.randomUUID(),
    name: `Remote ${crewCode}`,
    crewCode,
    role: "astronaut",
    environment: "station",
    missionStart: "2026-06-01",
    pinHash: "aGFzaA==",
    pinSalt: "c2FsdA==",
    isActive: true,
    createdAt: T,
    updatedAt: T,
    version: 1,
  });

  it("applies server changes without creating outbox rows, and moves the cursor", async () => {
    const astronaut = remoteAstronaut();
    const log = {
      id: crypto.randomUUID(),
      astronautId: astronaut.id,
      date: "2026-11-14",
      isBackdated: false,
      heart_rate: 66,
      createdAt: T,
      updatedAt: T,
      version: 1,
    };
    const response: PullResponse = {
      serverTime: SERVER_TIME,
      changes: { daily_log: [change(log)], astronaut: [change(astronaut)] },
    };
    expect(await applyPull(response)).toBe(2);

    const stored = await getDb().astronauts.get(astronaut.id);
    expect(stored?.crewCode).toBe("RMT-001");
    expect(stored?.pinHash).toBe("aGFzaA=="); // same PIN works on this device
    expect((await getDb().logs.get(log.id))?.heart_rate).toBe(66);
    expect(await getPendingCount()).toBe(0); // no echo back to the server
    expect(await getLastPulledAt()).toBe(SERVER_TIME);
  });

  it("keeps a newer or still-unsent local record, takes a newer server one", async () => {
    const a = await reg();
    const reminder = await createReminder(a.id, {
      kind: "custom",
      label: "Local",
      time: "10:00",
      enabled: true,
    });
    const server = (version: number, label: string) => ({
      serverTime: SERVER_TIME,
      changes: { reminder: [change({ ...reminder, label, version })] },
    });

    // Unsent local change: left alone (the push will sort it out).
    expect(await applyPull(server(5, "Server v5"))).toBe(0);
    expect((await getDb().reminders.get(reminder.id))?.label).toBe("Local");

    await getDb().outbox.clear(); // now treat it as already synced
    await getDb().reminders.update(reminder.id, { version: 4 });
    expect(await applyPull(server(3, "Server v3"))).toBe(0); // local is newer
    expect(await applyPull(server(4, "Server v4"))).toBe(1); // equal version: prefer server
    expect((await getDb().reminders.get(reminder.id))?.label).toBe("Server v4");
    expect(await applyPull(server(4, "Server v4"))).toBe(0); // identical: nothing to do
    expect(await applyPull(server(6, "Server v6"))).toBe(1);
    expect((await getDb().reminders.get(reminder.id))?.label).toBe("Server v6");
  });

  it("removes a record deleted on another device", async () => {
    const a = await reg();
    const reminder = await createReminder(a.id, {
      kind: "custom",
      label: "Gone",
      time: "10:00",
      enabled: true,
    });
    await getDb().outbox.clear();
    await applyPull({
      serverTime: SERVER_TIME,
      changes: {
        reminder: [change({ ...reminder, version: 2 }, { deleted: true })],
      },
    });
    expect(await getDb().reminders.get(reminder.id)).toBeUndefined();
  });

  it("a different local check-in for the same date is kept as a copy", async () => {
    const a = await reg();
    const { log } = await checkin(a.id);
    await getDb().outbox.clear();
    const serverLog = { ...log, id: crypto.randomUUID(), heart_rate: 95 };
    await applyPull({
      serverTime: SERVER_TIME,
      changes: { daily_log: [change(serverLog)] },
    });

    const logs = await getDb().logs.where("astronautId").equals(a.id).toArray();
    expect(logs.map((l) => l.id)).toEqual([serverLog.id]);
    const kept = await listConflicts(a.id);
    expect(
      kept.some(
        (c) =>
          c.entity === "daily_log" && (c.data as DailyLog).heart_rate === 72,
      ),
    ).toBe(true);
  });

  it("reports, and does not merge, a crew ID that is someone else here", async () => {
    await reg("TST-001");
    await getDb().outbox.clear();
    const other = remoteAstronaut("TST-001");
    await applyPull({
      serverTime: SERVER_TIME,
      changes: { astronaut: [change(other)] },
    });
    expect(await getDb().astronauts.count()).toBe(1);
    expect((await listSyncIssues())[0].reason).toMatch(/crew ID/);
  });
});

describe("runSync", () => {
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });

  it("does nothing until sync is set up", async () => {
    await reg();
    const summary = await runSync({ isOnline: () => true });
    expect(summary.outcome).toBe("not_configured");
    expect(await getPendingCount()).toBe(1);
  });

  it("an unreachable server leaves the outbox untouched", async () => {
    await reg();
    await saveSyncConfig("http://srv:8000", "key");
    const dead = (async () => {
      throw new TypeError("Failed to fetch");
    }) as typeof fetch;
    const summary = await runSync({ fetchImpl: dead, isOnline: () => true });
    expect(summary.outcome).toBe("unreachable");
    expect(await getPendingCount()).toBe(1);
    expect(await getLastSyncedAt()).toBeUndefined();
  });

  it("checks /health, pushes with the key, pulls, and records the time", async () => {
    const a = await reg();
    await saveSyncConfig("http://srv:8000/", "secret-key");
    const calls: { url: string; key: string | null; body?: string }[] = [];
    const fetchImpl = (async (url: RequestInfo | URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      calls.push({
        url: String(url),
        key: headers.get("X-Sync-Key"),
        body: init?.body as string,
      });
      if (String(url).endsWith("/health")) return json({ status: "ok" });
      if (String(url).endsWith("/sync/push")) {
        const { items } = JSON.parse(String(init?.body)) as {
          items: PushItem[];
        };
        return json(accepted(items));
      }
      return json({ serverTime: SERVER_TIME, changes: {} });
    }) as typeof fetch;

    const summary = await runSync({ fetchImpl, isOnline: () => true });
    expect(summary).toMatchObject({
      outcome: "ok",
      pushed: 1,
      conflicts: 0,
      rejected: 0,
    });
    expect(calls.map((c) => c.url)).toEqual([
      "http://srv:8000/api/v1/health",
      "http://srv:8000/api/v1/sync/push",
      "http://srv:8000/api/v1/sync/pull",
    ]);
    expect(calls[1].key).toBe("secret-key");
    const pushed = JSON.parse(calls[1].body ?? "{}") as {
      deviceId: string;
      items: PushItem[];
    };
    expect(pushed.deviceId).toBe(await getDeviceId());
    expect(pushed.items[0]).toMatchObject({
      entity: "astronaut",
      id: a.id,
      op: "upsert",
      version: 1,
    });
    expect(await getPendingCount()).toBe(0);
    expect(await getLastSyncedAt()).toBeDefined();
    expect(await getLastPulledAt()).toBe(SERVER_TIME);

    // The next pull asks only for what changed since.
    await runSync({ fetchImpl, isOnline: () => true });
    expect(calls.at(-1)?.url).toBe(
      `http://srv:8000/api/v1/sync/pull?since=${encodeURIComponent(SERVER_TIME)}`,
    );
  });

  it("a wrong key is reported and nothing is removed from the outbox", async () => {
    await reg();
    await saveSyncConfig("http://srv:8000", "wrong");
    const fetchImpl = (async (url: RequestInfo | URL) =>
      String(url).endsWith("/health")
        ? json({ status: "ok" })
        : json({ detail: "no" }, 401)) as typeof fetch;
    const summary = await runSync({ fetchImpl, isOnline: () => true });
    expect(summary.outcome).toBe("auth");
    expect(await getPendingCount()).toBe(1);
  });

  it("the API client maps failures to plain outcomes", async () => {
    const api = (status: number) =>
      createSyncApi({
        baseUrl: "http://srv:8000",
        syncKey: "k",
        fetchImpl: (async () => json({}, status)) as typeof fetch,
      });
    await expect(api(503).pull()).rejects.toMatchObject({ kind: "disabled" });
    await expect(api(500).pull()).rejects.toMatchObject({ kind: "server" });
    await expect(api(401).push("d", [])).rejects.toMatchObject({
      kind: "auth",
    });
  });

  it("stores the config normalised and rejects a bad address", async () => {
    await expect(saveSyncConfig("not a url", "k")).rejects.toThrow();
    await expect(saveSyncConfig("http://srv:8000", " ")).rejects.toThrow();
    await saveSyncConfig("http://srv:8000/api/v1/", " key ");
    expect(await getSyncConfig()).toEqual({
      serverUrl: "http://srv:8000",
      syncKey: "key",
    });
  });
});

describe("export and import", () => {
  it("exports only the chosen astronauts, without PINs", async () => {
    const a = await reg("TST-001");
    const b = await reg("TST-002");
    await checkin(a.id);
    await checkin(b.id);
    const data = await buildExport([a.id]);
    expect(data.astronauts.map((x) => x.crewCode)).toEqual(["TST-001"]);
    expect(data.logs).toHaveLength(1);
    expect(data.symptoms).toHaveLength(1);
    expect(data.evaluations).toHaveLength(1);
    expect(JSON.stringify(data)).not.toContain("pinHash");
    expect(JSON.stringify(data)).not.toContain(b.id);
  });

  it("an astronaut with no check-ins exports an empty, valid file", async () => {
    const a = await reg();
    const data = await buildExport([a.id]);
    expect(data.logs).toEqual([]);
    expect(toCsv(data).trim().split("\r\n")).toHaveLength(1); // header only
  });

  it("CSV has one row per check-in and is safe to open in a spreadsheet", async () => {
    const a = await reg();
    await checkin(a.id);
    const lines = toCsv(await buildExport([a.id]))
      .trim()
      .split("\r\n");
    expect(lines).toHaveLength(2);
    expect(lines[0].startsWith("crew_id,name,date,late_entry,heart_rate")).toBe(
      true,
    );
    expect(lines[1]).toContain("TST-001,Test TST-001,2026-11-14,no,72");
    expect(lines[1]).toContain("Headache (1)");

    expect(csvCell('say "hi", ok')).toBe('"say ""hi"", ok"');
    expect(csvCell("=SUM(A1)")).toBe("'=SUM(A1)");
    expect(csvCell(-5)).toBe("-5"); // a real negative number is left alone
    expect(csvCell(undefined)).toBe("");
  });

  it("import restores records and queues them to sync", async () => {
    const a = await reg();
    await checkin(a.id);
    const file = JSON.stringify(await buildExport([a.id]));
    const db = getDb();
    await Promise.all([
      db.logs.clear(),
      db.symptoms.clear(),
      db.evaluations.clear(),
      db.outbox.clear(),
    ]);

    const result = await importExport(parseExport(file), [a.id]);
    expect(result.imported).toBe(3); // log + symptom + result
    expect(result.skipped).toEqual([]);
    expect(await db.logs.count()).toBe(1);
    expect(await getPendingCount()).toBe(3);

    const again = await importExport(parseExport(file), [a.id]);
    expect(again.imported).toBe(0);
    expect(again.unchanged).toBe(3);
    expect(await getPendingCount()).toBe(3);
  });

  it("import refuses another astronaut's data and impossible values", async () => {
    const a = await reg("TST-001");
    const b = await reg("TST-002");
    await checkin(b.id);
    const othersFile = parseExport(JSON.stringify(await buildExport([b.id])));
    await getDb().logs.clear();
    const result = await importExport(othersFile, [a.id]);
    expect(result.imported).toBe(0);
    expect(result.skipped[0].reason).toMatch(/another astronaut/);

    expect(
      validateImportedLog({
        id: "x",
        astronautId: a.id,
        date: "2026-11-14",
        heart_rate: 400,
      }),
    ).toMatch(/heart_rate/);
    expect(
      validateImportedLog({ id: "x", astronautId: a.id, date: "14/11/2026" }),
    ).toBe("bad date");
    expect(
      validateImportedLog({
        id: "x",
        astronautId: a.id,
        date: "2026-11-14",
        heart_rate: 72,
      }),
    ).toBeNull();
  });

  it("rejects files that are not an export", () => {
    expect(() => parseExport("not json")).toThrow(ImportError);
    expect(() => parseExport('{"format":"other"}')).toThrow(ImportError);
    expect(() => parseExport('{"format":"ahm-export","version":99}')).toThrow(
      ImportError,
    );
  });
});
