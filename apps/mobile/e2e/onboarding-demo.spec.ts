/**
 * First-run: onboarding → pair host → connect GitHub (mock) →
 * add repo → worktree on branch A → agent task →
 * second worktree on branch B (same repo) → second agent task.
 */
import { test, expect } from "@playwright/test";
import { readFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

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

async function shot(page: import("@playwright/test").Page, name: string) {
  await waitFonts(page);
  await page.waitForTimeout(200);
  await page.screenshot({ path: join(OUT, name) });
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

async function waitAgentSettled(page: import("@playwright/test").Page) {
  await expect(page.getByPlaceholder("Follow up...")).toBeVisible({ timeout: 25000 });
  for (let i = 0; i < 60; i++) {
    const live = await page.getByText("Live", { exact: true }).count();
    if (live === 0) break;
    await page.waitForTimeout(250);
  }
}

async function sendAgentTask(
  page: import("@playwright/test").Page,
  prompt: string,
) {
  const composer = page.getByPlaceholder("Plan, ask, build...").last();
  await typeSlow(page, composer, prompt, 40);
  await page.waitForTimeout(600);
  await page.getByRole("button", { name: "Send" }).click();
  await waitAgentSettled(page);
  await expect(page.getByText(prompt).first()).toBeVisible({ timeout: 15000 });
  await expect(page.getByText(/Got it|demo/i).first()).toBeVisible({
    timeout: 15000,
  });
}

test.describe("Onboarding demo video", () => {
  test("onboard → two branch worktrees → agent tasks", async ({ page }) => {
    mkdirSync(OUT, { recursive: true });
    test.setTimeout(240_000);

    await clearApp(page);
    await expect(page.getByText("Get set up").first()).toBeVisible({ timeout: 20000 });
    await waitFonts(page);
    await page.waitForTimeout(1400);
    await shot(page, "01-onboarding.png");

    // Step 1 — pair host
    await page.getByRole("button", { name: "Pair host" }).click();
    await expect(page.getByPlaceholder("http://127.0.0.1:17420")).toBeVisible({ timeout: 10000 });
    await page.waitForTimeout(500);
    const pairCode = currentPairCode();
    const urlBox = page.getByPlaceholder("http://127.0.0.1:17420");
    await urlBox.fill("");
    await urlBox.pressSequentially(BRIDGE, { delay: 25 });
    await typeSlow(page, page.getByPlaceholder("pair code"), pairCode, 70);
    await page.waitForTimeout(350);
    await shot(page, "01b-pair-host.png");
    await page.getByText("Pair manually", { exact: true }).click();
    await expect(page.getByRole("button", { name: "Use mock GitHub" })).toBeVisible({
      timeout: 20000,
    });
    await expect(page.getByText(/Connected to/i).first()).toBeVisible({ timeout: 10000 });
    await page.waitForTimeout(900);
    await shot(page, "02-connect-github.png");

    // Step 2 — connect GitHub (mock)
    await page.getByRole("button", { name: "Use mock GitHub" }).click();
    await expect(page.getByText(/Signed in as pocket-demo/i).first()).toBeVisible({
      timeout: 15000,
    });
    await page.waitForTimeout(900);
    await shot(page, "02b-github-connected.png");
    await page.getByRole("button", { name: "Finish setup" }).click();

    // Step 3 — add repository
    await expect(page.getByText("Add repository").first()).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(/Mock GitHub/i)).toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(800);
    await shot(page, "03-add-repo.png");
    await page.getByLabel("Add acme/checkout-web").click();

    // Step 4 — branch dropdown + create worktree on feat/hello-world
    await expect(page.getByText("New worktree").first()).toBeVisible({ timeout: 20000 });
    await page.waitForTimeout(600);
    await page.getByLabel("Branch dropdown").click();
    await expect(page.getByText("Select branch").first()).toBeVisible({ timeout: 10000 });
    await page.waitForTimeout(500);
    await shot(page, "04b-branch-dropdown.png");
    await page.getByLabel("Branch feat/hello-world").click();
    await expect(page.getByLabel("Branch dropdown")).toContainText("feat/hello-world");
    await page.waitForTimeout(600);
    await shot(page, "04-worktree-branch.png");
    await page.getByLabel("Create worktree").click();

    await expect(page.getByLabel(/Worktree selector/).last()).toContainText("feat/hello-world", {
      timeout: 20000,
    });
    await page.waitForTimeout(1100);
    await shot(page, "05-worktree-ready.png");

    // Step 5 — agent task on branch A (context chip stays on the composer)
    const promptA = "Add a hello world script in TypeScript";
    const composerA = page.getByPlaceholder("Plan, ask, build...").last();
    await typeSlow(page, composerA, promptA.slice(0, 10), 40);
    await page.waitForTimeout(400);
    await shot(page, "06-composer-context.png");
    await typeSlow(page, composerA, promptA, 35);
    await page.waitForTimeout(500);
    await page.getByRole("button", { name: "Send" }).click();
    await waitAgentSettled(page);
    await expect(page.getByText(promptA).first()).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(/Got it|demo/i).first()).toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(1000);
    await shot(page, "07-agent-task.png");

    // Step 6 — back to inbox, open workspace, create second worktree
    await page.getByLabel("Back").click();
    await expect(page.getByText("Workspaces", { exact: true }).first()).toBeVisible({
      timeout: 15000,
    });
    await page.waitForTimeout(700);
    await page.getByRole("button", { name: /acme\/checkout-web/ }).first().click();
    await expect(page.getByText("Worktrees", { exact: true }).first()).toBeVisible({
      timeout: 15000,
    });
    await expect(page.getByLabel("Select worktree feat/hello-world")).toBeVisible({
      timeout: 10000,
    });
    await page.waitForTimeout(700);
    await shot(page, "08-workspace-one-worktree.png");

    await page.getByRole("button", { name: "Create worktree" }).last().click();
    await expect(page.getByText("New worktree", { exact: true }).last()).toBeVisible({
      timeout: 15000,
    });
    await page.waitForTimeout(500);
    await page.getByLabel("Branch dropdown").last().click();
    await expect(page.getByText("Select branch", { exact: true }).last()).toBeVisible({
      timeout: 10000,
    });
    await page.waitForTimeout(400);
    await page.getByLabel("Branch feat/cart-drawer").last().click();
    await expect(page.getByLabel("Branch dropdown").last()).toContainText("feat/cart-drawer");
    await page.waitForTimeout(600);
    await shot(page, "09-second-branch.png");
    // New worktree screen sits above workspace detail (both expose Create worktree).
    await page.getByLabel("Create worktree").last().click();

    // Create worktree returns to Inbox with the new branch selected
    await expect(page.getByLabel(/Worktree selector/).last()).toContainText("feat/cart-drawer", {
      timeout: 20000,
    });
    await page.waitForTimeout(800);
    await shot(page, "11-active-second-branch.png");

    // Open workspace via composer context chip — shows both branch worktrees
    await page.getByLabel(/Worktree selector/).last().click();
    await expect(page.getByText("Worktrees", { exact: true }).last()).toBeVisible({
      timeout: 15000,
    });
    await expect(page.getByLabel("Select worktree feat/hello-world").last()).toBeVisible({
      timeout: 10000,
    });
    await expect(page.getByLabel("Select worktree feat/cart-drawer").last()).toBeVisible({
      timeout: 10000,
    });
    await page.waitForTimeout(900);
    await shot(page, "10-two-worktrees.png");

    // Re-select cart-drawer (already active) then run the second task
    await page.getByLabel("Select worktree feat/cart-drawer").last().click();
    await expect(page.getByLabel(/Worktree selector/).last()).toContainText("feat/cart-drawer", {
      timeout: 15000,
    });
    await page.waitForTimeout(700);

    // Step 7 — agent task on branch B
    const promptB = "Implement the cart drawer UI on this branch";
    await sendAgentTask(page, promptB);
    await page.waitForTimeout(1200);
    await shot(page, "12-agent-task-branch-b.png");

    // Step 8 — show both worktrees, switch back to branch A
    await page.getByLabel("Back").last().click();
    await expect(page.getByText("Workspaces", { exact: true }).last()).toBeVisible({
      timeout: 15000,
    });
    await page.waitForTimeout(600);
    await page.getByLabel(/Worktree selector/).last().click();
    await expect(page.getByLabel("Select worktree feat/hello-world").last()).toBeVisible({
      timeout: 10000,
    });
    await expect(page.getByLabel("Select worktree feat/cart-drawer").last()).toBeVisible({
      timeout: 10000,
    });
    await page.waitForTimeout(1100);
    await shot(page, "13-two-branches-final.png");

    await page.getByLabel("Select worktree feat/hello-world").last().click();
    await expect(page.getByLabel(/Worktree selector/).last()).toContainText("feat/hello-world", {
      timeout: 15000,
    });
    await page.waitForTimeout(1400);
    await shot(page, "14-switched-branch-a.png");
  });
});
