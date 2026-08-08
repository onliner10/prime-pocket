/**
 * Demo: pair host → add GitHub repo (workspace) → create worktree → first task.
 */
import { test, expect } from "@playwright/test";
import { readFileSync, mkdirSync } from "node:fs";

const EXPO = process.env.POCKET_EXPO_URL ?? "http://127.0.0.1:8081";
const BRIDGE = process.env.POCKET_BRIDGE_URL ?? "http://127.0.0.1:17420";
const OUT = process.env.POCKET_DEMO_OUT ?? "/tmp/pocket-onboarding-demo";

function currentPairCode(): string {
  const store = JSON.parse(readFileSync("/tmp/pocket-ui-test/bridge.json", "utf8")) as {
    pairCode: string;
  };
  return store.pairCode;
}

async function clearApp(page: import("@playwright/test").Page) {
  await page.goto(EXPO, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => {
    try {
      localStorage.clear();
      sessionStorage.clear();
    } catch {
      // ignore
    }
  });
  await page.reload({ waitUntil: "networkidle" });
}

async function waitFonts(page: import("@playwright/test").Page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
}

async function typeSlow(
  page: import("@playwright/test").Page,
  locator: import("@playwright/test").Locator,
  text: string,
  delayMs = 55,
) {
  await locator.click();
  await page.waitForTimeout(250);
  await locator.fill("");
  await locator.pressSequentially(text, { delay: delayMs });
}

test.describe("Onboarding demo video", () => {
  test("workspace from repo, worktree, then agent task", async ({ page }) => {
    mkdirSync(OUT, { recursive: true });
    test.setTimeout(180_000);

    await clearApp(page);
    await expect(page.getByText("Inbox").first()).toBeVisible({ timeout: 20000 });
    await expect(page.getByText("No repositories yet")).toBeVisible({ timeout: 10000 });
    await waitFonts(page);
    await page.waitForTimeout(1600);

    // 1) Pair host
    await page.getByLabel("Hosts").click();
    await page.getByLabel("Pair host").click();
    await expect(page.getByText("Pair host").first()).toBeVisible({ timeout: 10000 });
    await page.waitForTimeout(700);
    const pairCode = currentPairCode();
    const urlBox = page.getByPlaceholder("http://127.0.0.1:17420");
    await urlBox.fill("");
    await urlBox.pressSequentially(BRIDGE, { delay: 25 });
    await typeSlow(page, page.getByPlaceholder("pair code"), pairCode, 70);
    await page.waitForTimeout(500);
    await page.getByText("Pair manually", { exact: true }).click();
    await page.waitForTimeout(700);
    await page.goto(EXPO, { waitUntil: "networkidle" });
    await expect(page.getByText("No repositories yet")).toBeVisible({ timeout: 20000 });
    await page.waitForTimeout(1200);

    // 2) Create workspace from GitHub repo (mock)
    await page.getByLabel("Add a repository").click();
    await expect(page.getByText("Add repository").first()).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(/Mock GitHub/i)).toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(1100);
    await page.getByLabel("Add acme/checkout-web").click();

    // 3) Create worktree on that workspace
    await expect(page.getByText("New worktree").first()).toBeVisible({ timeout: 20000 });
    await expect(page.getByText("acme/checkout-web").first()).toBeVisible({ timeout: 10000 });
    await page.waitForTimeout(900);
    const branch = page.getByLabel("Branch name");
    await typeSlow(page, branch, "feat/hello-world", 45);
    await page.waitForTimeout(700);
    await page.getByLabel("Create worktree").click();

    await expect(page.getByText("acme/checkout-web").first()).toBeVisible({ timeout: 20000 });
    await expect(page.getByText(/feat\/hello-world/i).first()).toBeVisible({ timeout: 15000 });
    await waitFonts(page);
    await page.waitForTimeout(1800);

    // 4) Ask agent to complete work in that worktree
    const prompt = "Add a hello world script in TypeScript";
    const composer = page.getByPlaceholder("Plan, ask, build...").last();
    await typeSlow(page, composer, prompt, 40);
    await page.waitForTimeout(800);
    await page.getByRole("button", { name: "Send" }).click();

    await expect(page.getByPlaceholder("Follow up...")).toBeVisible({ timeout: 25000 });
    await expect(page.getByText(prompt).first()).toBeVisible({ timeout: 15000 });
    for (let i = 0; i < 60; i++) {
      const live = await page.getByText("Live", { exact: true }).count();
      if (live === 0) break;
      await page.waitForTimeout(250);
    }
    await expect(page.getByText(/Got it|demo|TypeScript/i).first()).toBeVisible({
      timeout: 15000,
    });
    await page.waitForTimeout(2800);
  });
});
