import { defineConfig } from "@playwright/test";

// Test baseline for the released v1.0.1. Black-box browser tests only;
// the static server is started automatically by Playwright.
export default defineConfig({
  testDir: "./tests",
  timeout: 30000,
  fullyParallel: true,
  workers: process.env.CI ? 2 : undefined,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI
    ? [["github"], ["list"], ["html", { outputFolder: "playwright-report", open: "never" }]]
    : [["list"]],
  use: {
    baseURL: "http://127.0.0.1:4173",
    // Deterministic runs: the PWA service worker must not serve stale caches.
    serviceWorkers: "block"
  },
  webServer: {
    command: "node tests/server.mjs",
    url: "http://127.0.0.1:4173/",
    reuseExistingServer: !process.env.CI,
    timeout: 15000
  },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }]
});
