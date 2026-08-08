import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/onboarding-demo.spec.ts",
  timeout: 120_000,
  expect: { timeout: 25_000 },
  fullyParallel: false,
  retries: 0,
  outputDir: process.env.POCKET_DEMO_OUT ?? "/tmp/pocket-onboarding-demo",
  use: {
    baseURL: "http://127.0.0.1:8081",
    trace: "off",
    screenshot: "off",
    video: { mode: "on", size: { width: 390, height: 844 } },
    browserName: "chromium",
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120.0.0.0 Mobile/15E148 Safari/604.1",
  },
  projects: [{ name: "iphone-14-chromium" }],
});
