/**
 * Phone-viewport demo video: create agents and exchange messages.
 */
import { test, expect } from "@playwright/test";
import { readFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const EXPO = process.env.POCKET_EXPO_URL ?? "http://127.0.0.1:8081";
const BRIDGE = process.env.POCKET_BRIDGE_URL ?? "http://127.0.0.1:17420";
const OUT = process.env.POCKET_SHOT_DIR ?? "/opt/cursor/artifacts/screenshots";

function currentPairCode(): string {
  const store = JSON.parse(readFileSync("/tmp/pocket-ui-test/bridge.json", "utf8")) as {
    pairCode: string;
  };
  return store.pairCode;
}

/** Geist is injected at runtime on web, so never shoot before it has loaded. */
async function shot(page: import("@playwright/test").Page, name: string) {
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
  await page.screenshot({ path: join(OUT, name) });
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

async function pairViaUi(page: import("@playwright/test").Page, pairCode: string) {
  await page.getByLabel("Pair host").first().click();
  await page.getByPlaceholder("http://127.0.0.1:17420").fill(BRIDGE);
  await page.getByPlaceholder("pair code").fill(pairCode);
  await page.getByText("Pair manually", { exact: true }).click();
  await expect(page.getByText("ui-test").first()).toBeVisible({ timeout: 20000 });
}

async function waitForAssistantIdle(page: import("@playwright/test").Page) {
  // Wait until Follow up is usable and streaming label is gone (or timeout soft)
  await expect(page.getByPlaceholder("Follow up...")).toBeVisible({ timeout: 20000 });
  for (let i = 0; i < 40; i++) {
    const live = await page.getByText("Live", { exact: true }).count();
    if (live === 0) break;
    await page.waitForTimeout(200);
  }
  await page.waitForTimeout(400);
}

async function sendFollowUp(page: import("@playwright/test").Page, text: string) {
  const box = page.getByPlaceholder("Follow up...").last();
  await box.fill(text);
  await page.waitForTimeout(300);
  await page.getByRole("button", { name: "Send" }).click();
  await page.waitForTimeout(800);
  await waitForAssistantIdle(page);
}

async function inboxComposer(page: import("@playwright/test").Page) {
  return page.getByPlaceholder("Plan, ask, build...").last();
}

async function sendInboxPrompt(page: import("@playwright/test").Page, text: string) {
  await (await inboxComposer(page)).fill(text);
  await page.waitForTimeout(400);
  await page.getByRole("button", { name: "Send" }).click();
}

test.describe("Multi-agent conversation demo video", () => {
  test("create two agents and chat", async ({ page }) => {
    mkdirSync(OUT, { recursive: true });
    test.setTimeout(180_000);

    await clearApp(page);
    await expect(page.getByText("Inbox").first()).toBeVisible({ timeout: 20000 });
    await page.waitForTimeout(900);

    await pairViaUi(page, currentPairCode());
    await page.waitForTimeout(1000);

    // --- Agent 1 ---
    await sendInboxPrompt(page, "Build a hello world script in TypeScript");
    await expect(page.getByPlaceholder("Follow up...")).toBeVisible({ timeout: 25000 });
    await waitForAssistantIdle(page);
    await page.waitForTimeout(700);

    await sendFollowUp(page, "Add a README with usage examples");
    await page.waitForTimeout(600);
    await sendFollowUp(page, "What files did you create?");
    await page.waitForTimeout(900);

    // Back to Inbox
    await page.goto(EXPO, { waitUntil: "networkidle" });
    await expect(page.getByPlaceholder("Plan, ask, build...").last()).toBeVisible({
      timeout: 15000,
    });
    await page.waitForTimeout(1000);

    // --- Agent 2 ---
    await sendInboxPrompt(page, "Review package.json and summarize dependencies");
    await expect(page.getByPlaceholder("Follow up...")).toBeVisible({ timeout: 25000 });
    await waitForAssistantIdle(page);
    await page.waitForTimeout(700);

    await sendFollowUp(page, "Which dependency is the largest?");
    await page.waitForTimeout(600);
    await sendFollowUp(page, "Thanks — keep watching for updates");
    await page.waitForTimeout(1000);

    // Show All Agents list with both
    await page.goto(EXPO, { waitUntil: "networkidle" });
    await expect(page.getByPlaceholder("Plan, ask, build...").last()).toBeVisible({
      timeout: 15000,
    });
    await page.waitForTimeout(600);
    await page.getByText("All Agents").first().click();
    await expect(page.getByText(/Build a hello|Review package/i).first()).toBeVisible({
      timeout: 15000,
    });
    await page.waitForTimeout(2000);

    await shot(page, "demo-multi-agent-end.png");
  });
});
