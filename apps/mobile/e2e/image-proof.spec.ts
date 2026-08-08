/**
 * Two proof screenshots:
 *  1) mobile → agent (composer with attached image ready to send)
 *  2) agent → mobile (agent screenshot rendered on phone)
 */
import { test, expect } from "@playwright/test";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { deflateSync } from "node:zlib";

const EXPO = process.env.POCKET_EXPO_URL ?? "http://127.0.0.1:8081";
const BRIDGE = process.env.POCKET_BRIDGE_URL ?? "http://127.0.0.1:17420";
const OUT = process.env.POCKET_SHOT_DIR ?? process.env.POCKET_SCREENSHOT_DIR ?? "/tmp/pocket-shots";

/** Build a solid-color PNG so previews are obvious in screenshots. */
function solidPng(r: number, g: number, b: number, w = 96, h = 72): Buffer {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    const row = y * (w * 3 + 1);
    raw[row] = 0;
    for (let x = 0; x < w; x++) {
      const i = row + 1 + x * 3;
      raw[i] = r;
      raw[i + 1] = g;
      raw[i + 2] = b;
    }
  }
  const compressed = deflateSync(raw);
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  function chunk(type: string, data: Buffer) {
    const typeBuf = Buffer.from(type);
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const crc = Buffer.alloc(4);
    const crcVal = crc32(Buffer.concat([typeBuf, data]));
    crc.writeUInt32BE(crcVal >>> 0);
    return Buffer.concat([len, typeBuf, data, crc]);
  }
  function crc32(buf: Buffer): number {
    let c = ~0;
    for (let i = 0; i < buf.length; i++) {
      c ^= buf[i]!;
      for (let k = 0; k < 8; k++) c = c & 1 ? (0xedb88320 ^ (c >>> 1)) : c >>> 1;
    }
    return ~c;
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([signature, chunk("IHDR", ihdr), chunk("IDAT", compressed), chunk("IEND", Buffer.alloc(0))]);
}

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

async function onboardAndPair(page: import("@playwright/test").Page, pairCode: string) {
  await expect(page.getByText("Get set up").first()).toBeVisible({ timeout: 20000 });
  await page.getByRole("button", { name: "Pair host" }).click();
  await expect(page.getByPlaceholder("http://127.0.0.1:17420")).toBeVisible({ timeout: 10000 });
  await page.getByPlaceholder("http://127.0.0.1:17420").fill(BRIDGE);
  await page.getByPlaceholder("pair code").fill(pairCode);
  await page.getByText("Pair manually", { exact: true }).click();
  await expect(page.getByRole("button", { name: "Use mock GitHub" })).toBeVisible({
    timeout: 20000,
  });
  await page.getByRole("button", { name: "Use mock GitHub" }).click();
  await expect(page.getByText(/Signed in as pocket-demo/i).first()).toBeVisible({
    timeout: 15000,
  });
  await page.getByRole("button", { name: "Finish setup" }).click();
}

async function addMockRepo(page: import("@playwright/test").Page, fullName = "acme/checkout-web") {
  await expect(page.getByText("Add repository").first()).toBeVisible({ timeout: 15000 });
  await page.getByLabel(`Add ${fullName}`).click();
  await expect(page.getByText("New worktree").first()).toBeVisible({ timeout: 20000 });
  await page.getByLabel("Branch dropdown").click();
  await page.getByLabel("Branch feat/hello-world").click();
  await page.getByLabel("Create worktree").click();
  await expect(page.getByText(fullName).first()).toBeVisible({ timeout: 20000 });
}

test("proof screenshots: both image directions", async ({ page }) => {
  mkdirSync(OUT, { recursive: true });
  const phonePng = solidPng(220, 70, 70); // red-ish phone upload
  const phoneB64 = phonePng.toString("base64");
  writeFileSync(join(OUT, "_fixture-phone.png"), phonePng);

  await clearApp(page);
  await onboardAndPair(page, currentPairCode());
  await addMockRepo(page);

  const host = await page.evaluate(() => {
    const raw = localStorage.getItem("prime-pocket.paired-hosts");
    if (!raw) return null;
    return (JSON.parse(raw) as Array<{ token: string; hostId: string }>)[0] ?? null;
  });
  expect(host).toBeTruthy();

  // Fresh idle agent so the mobile→agent shot isn't cluttered with prior artifacts
  const launchPhone = await fetch(`${BRIDGE}/v1/agents`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${host!.token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ name: "mobile-send-image" }),
  });
  expect(launchPhone.ok).toBeTruthy();
  const { agent: phoneAgent } = (await launchPhone.json()) as {
    agent: { id: string; hostId: string };
  };

  // ========== 1) Mobile → agent ==========
  await page.goto(`${EXPO}/agent/${phoneAgent.hostId}/${phoneAgent.id}`, {
    waitUntil: "networkidle",
  });
  await expect(page.getByPlaceholder("Follow up...")).toBeVisible({ timeout: 15000 });

  await page.waitForFunction(
    () =>
      typeof (window as unknown as { __pocketSetPendingImages?: unknown }).__pocketSetPendingImages ===
      "function",
    null,
    { timeout: 15000 },
  );
  await page.evaluate(
    ({ b64 }) => {
      (window as unknown as { __pocketSetPendingImages: (imgs: unknown[]) => void }).__pocketSetPendingImages([
        {
          id: "proof_phone",
          uri: `data:image/png;base64,${b64}`,
          mimeType: "image/png",
          dataBase64: b64,
          name: "from-phone.png",
        },
      ]);
    },
    { b64: phoneB64 },
  );
  await page.getByPlaceholder("Follow up...").fill("sending this photo from my phone");
  await expect(page.getByLabel("Remove image")).toBeVisible({ timeout: 5000 });
  await page.waitForTimeout(400);
  await shot(page, "proof-01-mobile-to-agent.png");

  // Actually send image-only after clearing text to cover empty-message path
  await page.getByPlaceholder("Follow up...").fill("");
  await page.getByLabel("Send").click();
  await expect(page.getByText("Shared image").first()).toBeVisible({ timeout: 15000 });
  await page.waitForTimeout(600);
  await shot(page, "proof-01b-mobile-sent.png");

  // ========== 2) Agent → mobile ==========
  const launch = await fetch(`${BRIDGE}/v1/agents`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${host!.token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      name: "agent-image-share",
      prompt: "please send me a screenshot image",
    }),
  });
  expect(launch.ok).toBeTruthy();
  const { agent: shared } = (await launch.json()) as {
    agent: { id: string; hostId: string };
  };

  for (let i = 0; i < 50; i++) {
    const snapRes = await fetch(`${BRIDGE}/v1/agents/${shared.id}`, {
      headers: { authorization: `Bearer ${host!.token}` },
    });
    const snap = (await snapRes.json()) as {
      messages: Array<{ role: string; images?: unknown[] }>;
      artifacts: Array<{ mimeType: string; name: string }>;
      streaming: boolean;
    };
    const ready =
      !snap.streaming &&
      (snap.messages.some((m) => m.role === "assistant" && (m.images?.length ?? 0) > 0) ||
        snap.artifacts.some((a) => a.mimeType.startsWith("image/")));
    if (ready) break;
    await new Promise((r) => setTimeout(r, 150));
  }

  await page.goto(`${EXPO}/agent/${shared.hostId}/${shared.id}`, { waitUntil: "networkidle" });
  await expect(page.getByPlaceholder("Follow up...")).toBeVisible({ timeout: 15000 });
  await expect(page.getByText("demo-screenshot.png").first()).toBeVisible({ timeout: 15000 });
  await page.getByText("demo-screenshot.png").first().scrollIntoViewIfNeeded();
  await page.waitForTimeout(600);
  await shot(page, "proof-02-agent-to-mobile.png");
});
