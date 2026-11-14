import {
  getDb,
  type Astronaut,
  type Reminder,
  type ReminderFireState,
} from "./schema";
import type { ReminderDraft } from "@/lib/notifications/defaults";
import {
  getActiveBanners,
  type DueReminder,
} from "@/lib/notifications/scheduler";
import { getMissionDate } from "@/lib/time/missionDate";

/**
 * Reminder repository (C9). Same contract as `repo.ts`: components never
 * touch Dexie directly, and every reminder write also enqueues an outbox
 * row in the same transaction.
 *
 * Two things are deliberately device-local and NOT enqueued: the per-
 * reminder fire state and the per-astronaut "setup done" flag. Both live
 * in the `settings` table — "this occurrence already fired on this tablet"
 * is not something another device should inherit.
 */

const FIRE_STATE_PREFIX = "reminderFired:";
const SETUP_PREFIX = "reminderSetup:";

export type ReminderSetupState = "done" | "skipped";

function fireStateKey(reminderId: string): string {
  return `${FIRE_STATE_PREFIX}${reminderId}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

/** All reminders for one astronaut, earliest time of day first. */
export async function listReminders(astronautId: string): Promise<Reminder[]> {
  const rows = await getDb()
    .reminders.where("astronautId")
    .equals(astronautId)
    .toArray();
  return rows.sort(
    (a, b) => a.time.localeCompare(b.time) || a.label.localeCompare(b.label),
  );
}

/** Every reminder on this device, for the scheduler (it runs for all
 * registered astronauts, including while the app is locked). */
export async function listAllReminders(): Promise<Reminder[]> {
  return getDb().reminders.toArray();
}

export async function createReminders(
  astronautId: string,
  drafts: readonly ReminderDraft[],
): Promise<Reminder[]> {
  const db = getDb();
  return db.transaction("rw", db.reminders, db.outbox, async () => {
    const now = nowIso();
    const rows: Reminder[] = drafts.map((draft) => ({
      id: crypto.randomUUID(),
      astronautId,
      kind: draft.kind,
      label: draft.label,
      time: draft.time,
      ...(draft.weekday !== undefined ? { weekday: draft.weekday } : {}),
      enabled: draft.enabled,
      createdAt: now,
      updatedAt: now,
      version: 1,
    }));
    for (const row of rows) {
      await db.reminders.add(row);
      await db.outbox.add({
        entity: "reminder",
        entityId: row.id,
        op: "upsert",
        payload: row,
        createdAt: now,
      });
    }
    return rows;
  });
}

export async function createReminder(
  astronautId: string,
  draft: ReminderDraft,
): Promise<Reminder> {
  const [row] = await createReminders(astronautId, [draft]);
  return row;
}

export interface ReminderChanges {
  label?: string;
  time?: string;
  /** `null` clears the weekday (back to every day). */
  weekday?: number | null;
  enabled?: boolean;
}

/** Scoped by `astronautId`: an astronaut can only change their own
 * reminders. Returns undefined if the reminder is not theirs / is gone. */
export async function updateReminder(
  astronautId: string,
  reminderId: string,
  changes: ReminderChanges,
): Promise<Reminder | undefined> {
  const db = getDb();
  return db.transaction("rw", db.reminders, db.outbox, async () => {
    const existing = await db.reminders.get(reminderId);
    if (!existing || existing.astronautId !== astronautId) return undefined;
    const now = nowIso();
    const next: Reminder = {
      ...existing,
      ...(changes.label !== undefined ? { label: changes.label } : {}),
      ...(changes.time !== undefined ? { time: changes.time } : {}),
      ...(changes.enabled !== undefined ? { enabled: changes.enabled } : {}),
      updatedAt: now,
      version: existing.version + 1,
    };
    if (changes.weekday === null) delete next.weekday;
    else if (changes.weekday !== undefined) next.weekday = changes.weekday;
    await db.reminders.put(next);
    await db.outbox.add({
      entity: "reminder",
      entityId: next.id,
      op: "upsert",
      payload: next,
      createdAt: now,
    });
    return next;
  });
}

export async function deleteReminder(
  astronautId: string,
  reminderId: string,
): Promise<boolean> {
  const db = getDb();
  return db.transaction(
    "rw",
    db.reminders,
    db.outbox,
    db.settings,
    async () => {
      const existing = await db.reminders.get(reminderId);
      if (!existing || existing.astronautId !== astronautId) return false;
      await db.reminders.delete(reminderId);
      await db.settings.delete(fireStateKey(reminderId));
      await db.outbox.add({
        entity: "reminder",
        entityId: reminderId,
        op: "delete",
        payload: { id: reminderId },
        createdAt: nowIso(),
      });
      return true;
    },
  );
}

export async function getReminderSetupState(
  astronautId: string,
): Promise<ReminderSetupState | undefined> {
  const row = await getDb().settings.get(`${SETUP_PREFIX}${astronautId}`);
  return row?.value as ReminderSetupState | undefined;
}

export async function setReminderSetupState(
  astronautId: string,
  state: ReminderSetupState,
): Promise<void> {
  await getDb().settings.put({
    key: `${SETUP_PREFIX}${astronautId}`,
    value: state,
  });
}

/** Fire state for every reminder on this device, keyed by reminder id. */
export async function getReminderFireStates(): Promise<
  Record<string, ReminderFireState>
> {
  const rows = await getDb()
    .settings.where("key")
    .startsWith(FIRE_STATE_PREFIX)
    .toArray();
  const states: Record<string, ReminderFireState> = {};
  for (const row of rows) {
    states[row.key.slice(FIRE_STATE_PREFIX.length)] =
      row.value as ReminderFireState;
  }
  return states;
}

/**
 * Atomically records that this occurrence fired. Returns false if it (or
 * a later one) was already recorded — so a second tab, or the 30 s check
 * racing the timeout, cannot fire the same occurrence twice.
 * `dismissed: true` records it as handled without ever showing a banner
 * (used when today's check-in was already saved before its reminder).
 */
export async function claimReminderFire(
  reminderId: string,
  dueAt: string,
  dismissed = false,
): Promise<boolean> {
  const db = getDb();
  return db.transaction("rw", db.settings, async () => {
    const key = fireStateKey(reminderId);
    const existing = (await db.settings.get(key))?.value as
      ReminderFireState | undefined;
    if (existing && Date.parse(existing.dueAt) >= Date.parse(dueAt)) {
      return false;
    }
    const state: ReminderFireState = { dueAt, dismissed };
    await db.settings.put({ key, value: state });
    return true;
  });
}

export async function dismissReminderBanner(reminderId: string): Promise<void> {
  const db = getDb();
  await db.transaction("rw", db.settings, async () => {
    const key = fireStateKey(reminderId);
    const existing = (await db.settings.get(key))?.value as
      ReminderFireState | undefined;
    if (!existing) return;
    await db.settings.put({ key, value: { ...existing, dismissed: true } });
  });
}

export interface ReminderBannerItem extends DueReminder {
  astronaut: Astronaut;
}

/**
 * In-app banners to show now (SPEC §9 fallback). `astronautId` limits the
 * result to one astronaut (unlocked app); omit it for the locked Crew
 * screen, where every due reminder is shown with its owner's Name · ID.
 * A check-in reminder disappears by itself once today's check-in exists.
 */
export async function listReminderBanners(
  now: Date,
  astronautId?: string,
): Promise<ReminderBannerItem[]> {
  const db = getDb();
  const reminders = astronautId
    ? await db.reminders.where("astronautId").equals(astronautId).toArray()
    : await db.reminders.toArray();
  const banners = getActiveBanners(
    reminders,
    await getReminderFireStates(),
    now,
  );
  const today = getMissionDate(now);
  const items: ReminderBannerItem[] = [];
  for (const banner of banners) {
    const owner = banner.reminder.astronautId;
    if (banner.reminder.kind === "checkin") {
      const log = await db.logs
        .where("[astronautId+date]")
        .equals([owner, today])
        .first();
      if (log) continue;
    }
    const astronaut = await db.astronauts.get(owner);
    if (!astronaut) continue;
    items.push({ ...banner, astronaut });
  }
  return items;
}
