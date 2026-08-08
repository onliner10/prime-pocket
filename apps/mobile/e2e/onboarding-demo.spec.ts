/**
 * Phone-viewport demo video: pair with bridge, add workspace, submit first task.
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
  test("pair, add workspace, submit first task", async ({ page }) => {
    mkdirSync(OUT, { recursive: true });
    test.setTimeout(180_000);

    await clearApp(page);
    await expect(page.getByText("Inbox").first()).toBeVisible({ timeout: 20000 });
    await expect(page.getByText("No workspaces yet")).toBeVisible({ timeout: 10000 });
    await waitFonts(page);
    // Hold empty inbox so viewers can read "No workspaces yet"
    await page.waitForTimeout(2800);

    // Pair with desktop bridge (adds the workspace / repository)
    await page.getByLabel("Add a workspace").click();
    await expect(page.getByText("Pair host").first()).toBeVisible({ timeout: 10000 });
    await waitFonts(page);
    await page.waitForTimeout(1800);

    const pairCode = currentPairCode();
    const urlBox = page.getByPlaceholder("http://127.0.0.1:17420");
    await urlBox.click();
    await page.waitForTimeout(300);
    await urlBox.fill("");
    await urlBox.pressSequentially(BRIDGE, { delay: 35 });
    await page.waitForTimeout(700);

    const codeBox = page.getByPlaceholder("pair code");
    await typeSlow(page, codeBox, pairCode, 90);
    await page.waitForTimeout(1000);

    await page.getByText("Pair manually", { exact: true }).click();

    // Expo stack can leave a prior Inbox node "hidden"; assert on the paired workspace.
    await expect(page.getByText("ui-test").first()).toBeVisible({ timeout: 20000 });
    await expect(page.getByPlaceholder("Plan, ask, build...").last()).toBeVisible({
      timeout: 10000,
    });
    await waitFonts(page);
    // Hold paired inbox so the new workspace row is readable
    await page.waitForTimeout(2800);

    // Submit first task into the newly paired workspace
    const prompt = "Add a hello world script in TypeScript";
    const composer = page.getByPlaceholder("Plan, ask, build...").last();
    await typeSlow(page, composer, prompt, 45);
    await page.waitForTimeout(1200);
    await page.getByRole("button", { name: "Send" }).click();

    await expect(page.getByPlaceholder("Follow up...")).toBeVisible({ timeout: 25000 });
    await expect(page.getByText(prompt).first()).toBeVisible({ timeout: 15000 });
    for (let i = 0; i < 60; i++) {
      const live = await page.getByText("Live", { exact: true }).count();
      if (live === 0) break;
      await page.waitForTimeout(250);
    }
    await page.waitForTimeout(1200);

    // Hold on the completed first-task thread for the video ending
    await expect(
      page.getByText(/Got it|hello|TypeScript|script|demo|created|file/i).first(),
    ).toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(3500);
  });
});
