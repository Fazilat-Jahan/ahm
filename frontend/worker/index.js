// Extra service-worker code, bundled into the generated service worker by
// @ducanh2912/next-pwa (its `customWorkerSrc` convention: `worker/index`).
//
// SPEC §9: reminders are shown with `registration.showNotification`, so a
// tap on one is delivered here, not to the page. Bring the app to the
// front (or open it) — nothing else. No network request is made.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      for (const client of windows) {
        if ("focus" in client) return client.focus();
      }
      return self.clients.openWindow("/");
    })(),
  );
});
