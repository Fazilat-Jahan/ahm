import type { NextConfig } from "next";
import withPWAInit from "@ducanh2912/next-pwa";

const nextConfig: NextConfig = {
  // @ducanh2912/next-pwa always attaches a `webpack()` hook to the config,
  // even when disabled, which Next's Turbopack-by-default dev mode treats
  // as a fatal mismatch unless a `turbopack` key is present. The PWA build
  // itself still runs through classic webpack via `next build --webpack`.
  turbopack: {},
};

const withPWA = withPWAInit({
  dest: "public",
  disable: process.env.NODE_ENV === "development",
  register: true,
  // The plugin's default is to reload the page whenever the browser comes
  // back online. Here that would lock the app (the unlocked astronaut is
  // kept in memory only) and throw away a half-filled check-in every time
  // the link returns. Reconnecting is handled by the sync controller.
  reloadOnOnline: false,
  // Keep the plugin's default caching rules and put ours in front.
  extendDefaultRuntimeCaching: true,
  workboxOptions: {
    skipWaiting: true,
    runtimeCaching: [
      {
        // Calls to the sync backend must never be answered from a cache.
        // The default "cross-origin" rule would serve a remembered
        // /health reply while offline, making an unreachable server look
        // reachable, and could hand back stale sync data.
        urlPattern: ({ url }: { url: URL }) =>
          url.pathname.startsWith("/api/v1/"),
        handler: "NetworkOnly",
      },
    ],
  },
});

export default withPWA(nextConfig);
