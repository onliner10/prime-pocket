import assert from "node:assert/strict";
import { describe, it, before, after } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:net";
import { BridgeStore } from "./store.js";
import { BridgeServer } from "./server.js";
import { DemoBackend } from "./backend/demo.js";
import { Routes } from "@prime-pocket/protocol";

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

/** 1x1 red PNG */
const TINY_PNG_B64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

describe("bidirectional images", () => {
  let dataDir: string;
  let server: BridgeServer;
  let baseUrl: string;
  let token: string;

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
  });

  after(async () => {
    await server.stop();
    rmSync(dataDir, { recursive: true, force: true });
  });

  it("phone→agent upload and agent→phone screenshot", async () => {
    const list = await fetch(`${baseUrl}${Routes.agents}`, {
      headers: { authorization: `Bearer ${token}` },
    });
    const { agents } = (await list.json()) as { agents: Array<{ id: string }> };
    const agentId = agents[0]!.id;

    const promptRes = await fetch(`${baseUrl}${Routes.agentPrompt(agentId)}`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        message: "please review this screenshot",
        images: [{ mimeType: "image/png", dataBase64: TINY_PNG_B64, name: "from-phone.png" }],
      }),
    });
    assert.equal(promptRes.status, 200);

    // Wait for demo reply + screenshot artifact
    let snap: {
      messages: Array<{ role: string; images?: Array<{ artifactId?: string }> }>;
      artifacts: Array<{ id: string; mimeType: string; kind?: string; name: string }>;
    } | null = null;
    for (let i = 0; i < 40; i++) {
      await new Promise((r) => setTimeout(r, 100));
      const res = await fetch(`${baseUrl}${Routes.agent(agentId)}`, {
        headers: { authorization: `Bearer ${token}` },
      });
      snap = (await res.json()) as typeof snap;
      const hasAssistantImage = snap!.messages.some(
        (m) => m.role === "assistant" && (m.images?.length ?? 0) > 0,
      );
      const hasPng = snap!.artifacts.some((a) => a.mimeType.startsWith("image/"));
      if (hasAssistantImage && hasPng) break;
    }

    assert.ok(snap);
    const userMsg = snap!.messages.find((m) => m.role === "user" && (m.images?.length ?? 0) > 0);
    assert.ok(userMsg, "user message should carry uploaded image ref");
    const uploadArtId = userMsg!.images![0]!.artifactId!;
    const upload = await fetch(
      `${baseUrl}${Routes.agentArtifact(agentId, uploadArtId)}?token=${encodeURIComponent(token)}`,
    );
    assert.equal(upload.status, 200);
    assert.equal(upload.headers.get("content-type"), "image/png");
    const uploadBytes = Buffer.from(await upload.arrayBuffer());
    assert.ok(uploadBytes.length > 10);

    const shot = snap!.artifacts.find((a) => a.name.includes("screenshot") || a.kind === "image");
    assert.ok(shot, "demo screenshot artifact");
    const shotRes = await fetch(
      `${baseUrl}${Routes.agentArtifact(agentId, shot!.id)}?token=${encodeURIComponent(token)}`,
    );
    assert.equal(shotRes.status, 200);
    assert.match(shotRes.headers.get("content-type") ?? "", /^image\//);
    const shotBytes = Buffer.from(await shotRes.arrayBuffer());
    assert.ok(shotBytes[0] === 0x89 && shotBytes[1] === 0x50, "PNG magic");
  });
});
