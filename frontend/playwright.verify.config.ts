// TEMPORARY verification config (not part of the project; deleted after use).
// Runs the existing e2e specs unchanged against a production server on 3101
// using the system Edge, because port 3100 is occupied by a stale dev server.
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 300_000,
  expect: { timeout: 30_000 },
  workers: 1,
  reporter: "list",
  use: {
    baseURL: "http://localhost:3101",
    channel: "msedge",
    colorScheme: process.env.SCHEME === "dark" ? "dark" : "light",
  },
  projects: [
    {
      name: "a11y",
      testIgnore: /(offline\.pwa|_verify_offline)\.spec\.ts$/,
      use: { ...devices["Desktop Chrome"], channel: "msedge", serviceWorkers: "block" },
    },
    {
      name: "offline",
      testMatch: /(offline\.pwa|_verify_offline)\.spec\.ts$/,
      use: { ...devices["Desktop Chrome"], channel: "msedge", serviceWorkers: "allow" },
    },
  ],
});
