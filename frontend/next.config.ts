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
  workboxOptions: {
    skipWaiting: true,
  },
});

export default withPWA(nextConfig);
