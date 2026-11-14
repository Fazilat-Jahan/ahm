"use client";

import { useState } from "react";
import { Bell, BellOff } from "lucide-react";
import {
  getNotificationPermission,
  requestNotificationPermission,
  type NotificationPermissionState,
} from "@/lib/notifications/notify";

/**
 * SPEC §9: "Ask permission with a friendly pre-prompt screen." The
 * browser's own permission dialog only ever opens from the button here —
 * never on page load — and saying no costs nothing: reminders still show
 * as in-app banners.
 */
export function NotificationPermissionCard() {
  // Lazy initializer, not an effect: a plain read of the current value.
  const [permission, setPermission] = useState<NotificationPermissionState>(
    () => getNotificationPermission(),
  );
  const [asking, setAsking] = useState(false);

  async function allow() {
    setAsking(true);
    setPermission(await requestNotificationPermission());
    setAsking(false);
  }

  return (
    <section
      aria-labelledby="notification-permission-title"
      className="flex flex-col gap-2 rounded-lg border border-zinc-200 p-4 text-sm dark:border-zinc-800"
    >
      <h2
        id="notification-permission-title"
        className="flex items-center gap-2 font-medium"
      >
        {permission === "granted" ? (
          <Bell size={16} aria-hidden="true" />
        ) : (
          <BellOff size={16} aria-hidden="true" />
        )}
        Notifications on this device
      </h2>

      {permission === "granted" && (
        <p className="text-zinc-600 dark:text-zinc-400">
          On. Reminders also appear as a notification when this app is in the
          background, and as a banner inside the app.
        </p>
      )}

      {permission === "default" && (
        <>
          <p className="text-zinc-600 dark:text-zinc-400">
            Allow notifications to see a reminder even when this app is in the
            background. They stay on this device and work with no internet. If
            you say no, reminders still show as a banner inside the app.
          </p>
          <button
            type="button"
            onClick={() => void allow()}
            disabled={asking}
            className="min-h-11 self-start rounded-md bg-zinc-900 px-4 py-2 font-medium text-white disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900"
          >
            Allow notifications
          </button>
        </>
      )}

      {permission === "denied" && (
        <p className="text-zinc-600 dark:text-zinc-400">
          Blocked in this browser. Reminders show as a banner inside the app
          instead. To turn notifications on, change the permission for this site
          in the browser settings.
        </p>
      )}

      {permission === "unsupported" && (
        <p className="text-zinc-600 dark:text-zinc-400">
          Not available in this browser. Reminders show as a banner inside the
          app instead.
        </p>
      )}
    </section>
  );
}
