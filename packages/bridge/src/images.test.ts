import assert from "node:assert/strict";
import { describe, it, before, after } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:net";
import { BridgeStore } from "./store.js";
import { BridgeServer } from "./server.js";
import { DemoBackend } from "./backend/demo.js";
import { MAX_PROMPT_IMAGES, Routes } from "@prime-pocket/protocol";

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const s = createServer();
    s.listen(0, "127.0.0.1", () => {
      const addr = s.address();
      if (!addr || typeof addr === "string") {
        reject(new Error("no port"));
        return;
      }
      const port = addr.port;
      s.close(() => resolve(port));
    });
    s.on("error", reject);
  });
}

const TINY_PNG_B64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

type Snap = {
  streaming: boolean;
  messages: Array<{ role: string; text: string; images?: Array<{ artifactId?: string; name?: string }> }>;
  artifacts: Array<{ id: string; mimeType: string; kind?: string; name: string }>;
  agent: { status: string };
};

describe("bidirectional images", () => {
  let dataDir: string;
  let server: BridgeServer;
  let baseUrl: string;
  let token: string;
  let agentId: string;

  before(async () => {
    dataDir = mkdtempSync(join(tmpdir(), "pocket-img-"));
    const store = new BridgeStore(dataDir, "img-host");
    const backend = new DemoBackend(store.data.identity.hostId, join(dataDir, "artifacts"));
    const port = await freePort();
    server = new BridgeServer({ store, backend, port, tls: false });
    await server.start();
    baseUrl = `http://127.0.0.1:${port}`;
    const pairRes = await fetch(`${baseUrl}${Routes.pair}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ pairCode: store.data.pairCode, deviceLabel: "img-test" }),
    });
    token = ((await pairRes.json()) as { token: string }).token;
    const list = await fetch(`${baseUrl}${Routes.agents}`, {
      headers: { authorization: `Bearer ${token}` },
    });
    const { agents } = (await list.json()) as { agents: Array<{ id: string }> };
    agentId = agents[0]!.id;
  });

  after(async () => {
    await server.stop();
    rmSync(dataDir, { recursive: true, force: true });
  });

  async function authJson(path: string, init?: RequestInit) {
    return fetch(`${baseUrl}${path}`, {
      ...init,
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        ...(init?.headers ?? {}),
      },
    });
  }

  async function waitSnap(pred: (s: Snap) => boolean, ms = 6000): Promise<Snap> {
    const deadline = Date.now() + ms;
    let last: Snap | null = null;
    while (Date.now() < deadline) {
      const res = await authJson(Routes.agent(agentId));
      last = (await res.json()) as Snap;
      if (pred(last)) return last;
      await new Promise((r) => setTimeout(r, 80));
    }
    assert.fail(`timeout waiting for snapshot condition: ${JSON.stringify(last?.messages?.slice(-2))}`);
  }

  async function waitIdle() {
    return waitSnap((s) => !s.streaming && s.agent.status !== "running");
  }

  it("phone→agent upload and agent→phone screenshot", async () => {
    await waitIdle();
    const promptRes = await authJson(Routes.agentPrompt(agentId), {
      method: "POST",
      body: JSON.stringify({
        message: "please review this screenshot",
        images: [{ mimeType: "image/png", dataBase64: TINY_PNG_B64, name: "from-phone.png" }],
      }),
    });
    assert.equal(promptRes.status, 200);

    const snap = await waitSnap(
      (s) =>
        s.messages.some((m) => m.role === "assistant" && (m.images?.length ?? 0) > 0) &&
        s.artifacts.some((a) => a.mimeType.startsWith("image/")),
    );

    const userMsg = snap.messages.find((m) => m.role === "user" && (m.images?.length ?? 0) > 0);
    assert.ok(userMsg);
    const uploadArtId = userMsg!.images![0]!.artifactId!;
    const upload = await fetch(
      `${baseUrl}${Routes.agentArtifact(agentId, uploadArtId)}?token=${encodeURIComponent(token)}`,
    );
    assert.equal(upload.status, 200);
    assert.equal(upload.headers.get("content-type"), "image/png");

    const shot = snap.artifacts.find((a) => a.name.includes("screenshot") || a.kind === "image");
    assert.ok(shot);
    const shotRes = await fetch(
      `${baseUrl}${Routes.agentArtifact(agentId, shot!.id)}?token=${encodeURIComponent(token)}`,
    );
    assert.equal(shotRes.status, 200);
    const shotBytes = Buffer.from(await shotRes.arrayBuffer());
    assert.ok(shotBytes[0] === 0x89 && shotBytes[1] === 0x50);
  });

  it("image-only prompt (empty message)", async () => {
    await waitIdle();
    const res = await authJson(Routes.agentPrompt(agentId), {
      method: "POST",
      body: JSON.stringify({
        message: "   ",
        images: [{ mimeType: "image/png", dataBase64: TINY_PNG_B64 }],
      }),
    });
    assert.equal(res.status, 200);
    const snap = await waitSnap((s) =>
      s.messages.some((m) => m.role === "user" && m.text.includes("Shared image") && (m.images?.length ?? 0) > 0),
    );
    assert.ok(snap);
  });

  it("multiple images in one prompt", async () => {
    await waitIdle();
    const res = await authJson(Routes.agentPrompt(agentId), {
      method: "POST",
      body: JSON.stringify({
        message: "here are two photos",
        images: [
          { mimeType: "image/png", dataBase64: TINY_PNG_B64, name: "a.png" },
          { mimeType: "Image/PNG", dataBase64: TINY_PNG_B64, name: "b.png" },
        ],
      }),
    });
    assert.equal(res.status, 200);
    const snap = await waitSnap((s) =>
      s.messages.some((m) => m.role === "user" && (m.images?.length ?? 0) === 2),
    );
    assert.equal(
      snap.messages.find((m) => m.role === "user" && (m.images?.length ?? 0) === 2)!.images!.length,
      2,
    );
  });

  it("rejects empty base64, svg, and too many images", async () => {
    await waitIdle();
    const empty = await authJson(Routes.agentPrompt(agentId), {
      method: "POST",
      body: JSON.stringify({
        message: "x",
        images: [{ mimeType: "image/png", dataBase64: "" }],
      }),
    });
    assert.equal(empty.status, 400);

    const svg = await authJson(Routes.agentPrompt(agentId), {
      method: "POST",
      body: JSON.stringify({
        message: "x",
        images: [{ mimeType: "image/svg+xml", dataBase64: TINY_PNG_B64 }],
      }),
    });
    assert.equal(svg.status, 400);

    const many = await authJson(Routes.agentPrompt(agentId), {
      method: "POST",
      body: JSON.stringify({
        message: "x",
        images: Array.from({ length: MAX_PROMPT_IMAGES + 1 }, () => ({
          mimeType: "image/png",
          dataBase64: TINY_PNG_B64,
        })),
      }),
    });
    assert.equal(many.status, 400);
  });

  it("accepts data-URL-prefixed base64", async () => {
    await waitIdle();
    const res = await authJson(Routes.agentPrompt(agentId), {
      method: "POST",
      body: JSON.stringify({
        message: "data url photo",
        images: [{ mimeType: "image/png", dataBase64: `data:image/png;base64,${TINY_PNG_B64}` }],
      }),
    });
    assert.equal(res.status, 200);
    await waitSnap((s) =>
      s.messages.some((m) => m.role === "user" && m.text.includes("data url") && (m.images?.length ?? 0) > 0),
    );
  });

  it("sanitizes dangerous filenames in Content-Disposition", async () => {
    await waitIdle();
    await authJson(Routes.agentPrompt(agentId), {
      method: "POST",
      body: JSON.stringify({
        message: "evil name",
        images: [
          {
            mimeType: "image/png",
            dataBase64: TINY_PNG_B64,
            name: 'evil"\r\nInjected.png',
          },
        ],
      }),
    });
    const snap = await waitSnap((s) =>
      s.messages.some((m) => m.role === "user" && (m.images?.length ?? 0) > 0 && m.text.includes("evil")),
    );
    const artId = snap.messages
      .filter((m) => m.role === "user" && m.text.includes("evil"))
      .at(-1)!.images![0]!.artifactId!;
    const art = await fetch(
      `${baseUrl}${Routes.agentArtifact(agentId, artId)}?token=${encodeURIComponent(token)}`,
    );
    assert.equal(art.status, 200);
    const cd = art.headers.get("content-disposition") ?? "";
    assert.ok(!cd.includes("\r"));
    assert.ok(!cd.includes("\n"));
    assert.ok(!cd.includes('"evil"'));
  });

  it("artifact auth: 401 without token, 404 unknown, bearer works", async () => {
    await waitIdle();
    await authJson(Routes.agentPrompt(agentId), {
      method: "POST",
      body: JSON.stringify({
        message: "auth check photo",
        images: [{ mimeType: "image/png", dataBase64: TINY_PNG_B64, name: "auth.png" }],
      }),
    });
    const snap = await waitSnap((s) =>
      s.messages.some((m) => m.role === "user" && m.text.includes("auth check") && (m.images?.length ?? 0) > 0),
    );
    const artId = snap.messages
      .filter((m) => m.role === "user" && m.text.includes("auth check"))
      .at(-1)!.images![0]!.artifactId!;

    const noTok = await fetch(`${baseUrl}${Routes.agentArtifact(agentId, artId)}`);
    assert.equal(noTok.status, 401);

    const bad = await fetch(
      `${baseUrl}${Routes.agentArtifact(agentId, "missing")}?token=${encodeURIComponent(token)}`,
    );
    assert.equal(bad.status, 404);

    const ok = await fetch(`${baseUrl}${Routes.agentArtifact(agentId, artId)}`, {
      headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(ok.status, 200);
  });

  it("follow-up with images-only while idle", async () => {
    await waitIdle();
    const res = await authJson(Routes.agentFollowUp(agentId), {
      method: "POST",
      body: JSON.stringify({
        message: "",
        images: [{ mimeType: "image/png", dataBase64: TINY_PNG_B64, name: "fu.png" }],
      }),
    });
    assert.equal(res.status, 200);
    await waitSnap((s) =>
      s.messages.some(
        (m) => m.role === "user" && (m.images?.length ?? 0) > 0 && m.text.includes("Shared image"),
      ),
    );
  });

  it("streaming follow-up with images is queued and answered", async () => {
    await waitIdle();
    // Start a long-ish reply
    const start = await authJson(Routes.agentPrompt(agentId), {
      method: "POST",
      body: JSON.stringify({ message: "please write a long reply about testing queues" }),
    });
    assert.equal(start.status, 200);

    // Wait until streaming
    await waitSnap((s) => s.streaming);

    const fu = await authJson(Routes.agentPrompt(agentId), {
      method: "POST",
      body: JSON.stringify({
        message: "and also this photo",
        streamingBehavior: "followUp",
        images: [{ mimeType: "image/png", dataBase64: TINY_PNG_B64, name: "queued.png" }],
      }),
    });
    assert.equal(fu.status, 200);

    // Eventually both the follow-up user message and a later assistant reply with images
    await waitSnap((s) => {
      const hasQueuedUser = s.messages.some(
        (m) => m.role === "user" && m.text.includes("and also this photo") && (m.images?.length ?? 0) > 0,
      );
      const assistantsAfter = s.messages.filter((m) => m.role === "assistant");
      const lastAssistant = assistantsAfter.at(-1);
      return (
        hasQueuedUser &&
        !s.streaming &&
        !!lastAssistant &&
        (lastAssistant.text.includes("and also this photo") || (lastAssistant.images?.length ?? 0) > 0)
      );
    }, 12000);
  });

  it("rejects steer with images", async () => {
    await waitIdle();
    await authJson(Routes.agentPrompt(agentId), {
      method: "POST",
      body: JSON.stringify({ message: "start streaming please with a screenshot request" }),
    });
    await waitSnap((s) => s.streaming);
    const res = await authJson(Routes.agentPrompt(agentId), {
      method: "POST",
      body: JSON.stringify({
        message: "steer with pic",
        streamingBehavior: "steer",
        images: [{ mimeType: "image/png", dataBase64: TINY_PNG_B64 }],
      }),
    });
    assert.equal(res.status, 400);
    await authJson(Routes.agentCancel(agentId), { method: "POST" });
    await waitIdle();
  });

  it("cancel on one agent does not abort another agent's image reply", async () => {
    await waitIdle();
    const launch = await authJson(Routes.agents, {
      method: "POST",
      body: JSON.stringify({ name: "other-agent", prompt: "please send a screenshot slowly" }),
    });
    assert.equal(launch.status, 201);
    const otherId = ((await launch.json()) as { agent: { id: string } }).agent.id;

    // Start image reply on primary
    await authJson(Routes.agentPrompt(agentId), {
      method: "POST",
      body: JSON.stringify({
        message: "please screenshot for isolation",
        images: [{ mimeType: "image/png", dataBase64: TINY_PNG_B64 }],
      }),
    });
    await waitSnap((s) => s.streaming);

    // Cancel the other agent mid-flight
    await authJson(Routes.agentCancel(otherId), { method: "POST" });

    // Primary should still finish with an assistant image
    await waitSnap(
      (s) =>
        !s.streaming &&
        s.messages.some(
          (m) =>
            m.role === "assistant" &&
            m.text.includes("please screenshot for isolation") &&
            (m.images?.length ?? 0) > 0,
        ),
      10000,
    );
  });
});
