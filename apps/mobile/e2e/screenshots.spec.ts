/**
 * Playwright mobile screenshots for Prime Pocket (iPhone 14 CSS viewport 390×844).
 */
import { test, expect } from "@playwright/test";
import { readFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const EXPO = process.env.POCKET_EXPO_URL ?? "http://127.0.0.1:8081";
const BRIDGE = process.env.POCKET_BRIDGE_URL ?? "http://127.0.0.1:17420";
const OUT = process.env.POCKET_SHOT_DIR ?? "/opt/cursor/artifacts/screenshots";

function currentPairCode(): string {
  if (process.env.POCKET_PAIR_CODE) return process.env.POCKET_PAIR_CODE;
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

async function pairViaUi(page: import("@playwright/test").Page, pairCode: string) {
  await page.getByLabel("Pair host").first().click();
  await page.getByPlaceholder("http://127.0.0.1:17420").fill(BRIDGE);
  await page.getByPlaceholder("pair code").fill(pairCode);
  await page.getByText("Pair manually", { exact: true }).click();
  await expect(page.getByText("ui-test").first()).toBeVisible({ timeout: 20000 });
}

test.describe("Prime Pocket mobile screenshots", () => {
  test("capture inbox, needs attention, agent", async ({ page }) => {
    mkdirSync(OUT, { recursive: true });

    await clearApp(page);
    await expect(page.getByText("Inbox").first()).toBeVisible({ timeout: 20000 });
    await page.waitForTimeout(600);
    await page.screenshot({ path: join(OUT, "01-inbox-empty.png") });

    await pairViaUi(page, currentPairCode());
    await page.waitForTimeout(600);
    await page.screenshot({ path: join(OUT, "02-inbox-paired.png") });

    await page.goto(`${EXPO}/agents/needs_attention`, { waitUntil: "networkidle" });
    await expect(page.getByText("Nothing Needs Attention")).toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(500);
    await page.screenshot({ path: join(OUT, "03-needs-attention.png") });

    await page.goto(`${EXPO}/agents/all`, { waitUntil: "networkidle" });
    await expect(page.getByText("demo-welcome").first()).toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(500);
    await page.screenshot({ path: join(OUT, "04-all-agents.png") });

    await page.getByText("demo-welcome").first().click();
    await expect(page.getByPlaceholder("Follow up...")).toBeVisible({ timeout: 15000 });
    await page.getByPlaceholder("Follow up...").fill(
      "hello from playwright — please create an artifact log",
    );
    await page.getByPlaceholder("Follow up...").press("Enter");
    await page.waitForTimeout(3200);
    await page.screenshot({ path: join(OUT, "05-agent-follow-up.png") });
  });
});
