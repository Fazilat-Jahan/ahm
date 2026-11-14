/**
 * SPEC §9: "When allowed, use the Notification API through the service
 * worker (`registration.showNotification`) so the notification appears
 * even if the tab is in the background."
 *
 * Everything here is local to the device: showing a notification makes no
 * network request. If notifications are unsupported, not yet allowed, or
 * blocked, callers fall back to the in-app banner — which is always shown
 * anyway, so nothing depends on this succeeding.
 */

export type NotificationPermissionState =
  "unsupported" | "default" | "granted" | "denied";

export function getNotificationPermission(): NotificationPermissionState {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return "unsupported";
  }
  return Notification.permission;
}

/** Only ever called from a button press on the pre-prompt card — never on
 * page load. */
export async function requestNotificationPermission(): Promise<NotificationPermissionState> {
  if (getNotificationPermission() === "unsupported") return "unsupported";
  try {
    return await Notification.requestPermission();
  } catch {
    return getNotificationPermission();
  }
}

export interface ReminderNotification {
  title: string;
  body: string;
  /** Same tag = the newer notification replaces the older one. */
  tag: string;
}

const ICON = "/icons/icon.svg";

/** Returns true if a system notification was shown. */
export async function showReminderNotification(
  notification: ReminderNotification,
): Promise<boolean> {
  if (getNotificationPermission() !== "granted") return false;
  const options: NotificationOptions = {
    body: notification.body,
    tag: notification.tag,
    icon: ICON,
    badge: ICON,
  };
  try {
    const registration =
      "serviceWorker" in navigator
        ? await navigator.serviceWorker.getRegistration()
        : undefined;
    if (registration) {
      await registration.showNotification(notification.title, options);
      return true;
    }
    // No service worker (e.g. `npm run dev`, where the PWA is disabled):
    // a plain page notification still works while the tab is open.
    new Notification(notification.title, options);
    return true;
  } catch {
    return false;
  }
}
