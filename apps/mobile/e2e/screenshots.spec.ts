/**
 * Playwright mobile screenshots for Prime Pocket (iPhone 14 CSS viewport 390×844).
 */
import { test, expect } from "@playwright/test";
import { readFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const EXPO = process.env.POCKET_EXPO_URL ?? "http://127.0.0.1:8081";
const BRIDGE = process.env.POCKET_BRIDGE_URL ?? "http://127.0.0.1:17420";
const OUT = process.env.POCKET_SHOT_DIR ?? process.env.POCKET_SCREENSHOT_DIR ?? "/tmp/pocket-shots";

function currentPairCode(): string {
  if (process.env.POCKET_PAIR_CODE) return process.env.POCKET_PAIR_CODE;
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
  await page.getByLabel("Hosts").first().click();
  await page.getByLabel("Pair host").click();
  await page.getByPlaceholder("http://127.0.0.1:17420").fill(BRIDGE);
  await page.getByPlaceholder("pair code").fill(pairCode);
  await page.getByText("Pair manually", { exact: true }).click();
  await page.goto(EXPO, { waitUntil: "networkidle" });
  await expect(page.getByText("No repositories yet")).toBeVisible({ timeout: 20000 });
}

async function addMockRepo(page: import("@playwright/test").Page, fullName = "acme/checkout-web") {
  await page.getByLabel("Add a repository").click();
  await expect(page.getByText(/Mock GitHub/i)).toBeVisible({ timeout: 15000 });
  await page.getByLabel(`Add ${fullName}`).click();
  await expect(page.getByText(fullName).first()).toBeVisible({ timeout: 20000 });
}

test.describe("Prime Pocket mobile screenshots", () => {
  test("capture inbox, needs attention, agent", async ({ page }) => {
    mkdirSync(OUT, { recursive: true });

    await clearApp(page);
    await expect(page.getByText("Inbox").first()).toBeVisible({ timeout: 20000 });
    await page.waitForTimeout(600);
    await shot(page, "01-inbox-empty.png");

    await pairViaUi(page, currentPairCode());
    await addMockRepo(page);
    await page.waitForTimeout(600);
    await shot(page, "02-inbox-paired.png");

    await page.goto(`${EXPO}/agents/needs_attention`, { waitUntil: "networkidle" });
    await expect(page.getByText("Nothing Needs Attention")).toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(500);
    await shot(page, "03-needs-attention.png");

    await page.goto(`${EXPO}/agents/all`, { waitUntil: "networkidle" });
    await expect(page.getByText("demo-welcome").first()).toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(500);
    await shot(page, "04-all-agents.png");

    await page.getByText("demo-welcome").first().click();
    await expect(page.getByPlaceholder("Follow up...")).toBeVisible({ timeout: 15000 });
    await page.getByPlaceholder("Follow up...").fill(
      "hello from playwright — please create an artifact log",
    );
    await page.getByPlaceholder("Follow up...").press("Enter");
    await page.waitForTimeout(3200);
    await shot(page, "05-agent-follow-up.png");

    // Bidirectional images: phone→agent upload + agent→phone screenshot reply
    const TINY_PNG_B64 =
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
    const paired = await page.evaluate(() => {
      const raw = localStorage.getItem("prime-pocket.paired-hosts");
      if (!raw) return null;
      const hosts = JSON.parse(raw) as Array<{ token: string; baseUrl: string; hostId: string }>;
      return hosts[0] ?? null;
    });
    expect(paired).toBeTruthy();
    const agentsRes = await fetch(`${BRIDGE}/v1/agents`, {
      headers: { authorization: `Bearer ${paired!.token}` },
    });
    const { agents } = (await agentsRes.json()) as {
      agents: Array<{ id: string; hostId: string; name: string }>;
    };
    const agent = agents.find((a) => a.name === "demo-welcome") ?? agents[0]!;
    for (let i = 0; i < 40; i++) {
      const snapRes = await fetch(`${BRIDGE}/v1/agents/${agent.id}`, {
        headers: { authorization: `Bearer ${paired!.token}` },
      });
      const snap = (await snapRes.json()) as { streaming: boolean; agent: { status: string } };
      if (!snap.streaming && snap.agent.status !== "running") break;
      await new Promise((r) => setTimeout(r, 150));
    }
    const promptRes = await fetch(`${BRIDGE}/v1/agents/${agent.id}/prompt`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${paired!.token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        message: "please review this screenshot from my phone",
        images: [{ mimeType: "image/png", dataBase64: TINY_PNG_B64, name: "from-phone.png" }],
      }),
    });
    expect(promptRes.ok).toBeTruthy();
    for (let i = 0; i < 40; i++) {
      const snapRes = await fetch(`${BRIDGE}/v1/agents/${agent.id}`, {
        headers: { authorization: `Bearer ${paired!.token}` },
      });
      const snap = (await snapRes.json()) as {
        messages: Array<{ role: string; images?: unknown[] }>;
        artifacts: Array<{ mimeType: string }>;
      };
      const hasBoth =
        snap.messages.some((m) => m.role === "user" && (m.images?.length ?? 0) > 0) &&
        snap.messages.some((m) => m.role === "assistant" && (m.images?.length ?? 0) > 0) &&
        snap.artifacts.some((a) => a.mimeType.startsWith("image/"));
      if (hasBoth) break;
      await new Promise((r) => setTimeout(r, 150));
    }
    await page.goto(`${EXPO}/agent/${agent.hostId}/${agent.id}`, { waitUntil: "networkidle" });
    await expect(page.getByPlaceholder("Follow up...")).toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(800);
    await shot(page, "06-agent-images.png");

    // A long name so the top bar shows the reference's truncated centre title.
    const longRes = await fetch(`${BRIDGE}/v1/agents`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${paired!.token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        name: "Prime agent mobile experience polish",
        prompt: "summarize the mobile typography pass and attach an artifact log",
      }),
    });
    expect(longRes.ok).toBeTruthy();
    const { agent: longAgent } = (await longRes.json()) as {
      agent: { id: string; hostId: string };
    };
    for (let i = 0; i < 60; i++) {
      const snapRes = await fetch(`${BRIDGE}/v1/agents/${longAgent.id}`, {
        headers: { authorization: `Bearer ${paired!.token}` },
      });
      const snap = (await snapRes.json()) as { streaming: boolean; artifacts: unknown[] };
      if (!snap.streaming && snap.artifacts.length > 0) break;
      await new Promise((r) => setTimeout(r, 150));
    }
    await page.goto(`${EXPO}/agent/${longAgent.hostId}/${longAgent.id}`, {
      waitUntil: "networkidle",
    });
    await expect(page.getByText("Changes")).toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(600);
    await shot(page, "07-agent-long-title.png");
  });
});
