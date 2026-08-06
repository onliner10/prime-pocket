import assert from "node:assert/strict";
import { describe, it, before, after } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:net";
import { BridgeStore } from "./store.js";
import { BridgeServer } from "./server.js";
import { DemoBackend } from "./backend/demo.js";
import { Routes, decodePairingQr, encodePairingQr } from "@prime-pocket/protocol";
import WebSocket from "ws";

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

describe("bridge server", () => {
  let dataDir: string;
  let server: BridgeServer;
  let baseUrl: string;
  let token: string;

  before(async () => {
    dataDir = mkdtempSync(join(tmpdir(), "pocket-"));
    const store = new BridgeStore(dataDir, "test-host");
    const backend = new DemoBackend(store.data.identity.hostId, join(dataDir, "artifacts"));
    const port = await freePort();
    server = new BridgeServer({ store, backend, port, tls: false });
    await server.start();
    baseUrl = `http://127.0.0.1:${port}`;

    const pairRes = await fetch(`${baseUrl}${Routes.pair}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ pairCode: store.data.pairCode, deviceLabel: "test" }),
    });
    assert.equal(pairRes.status, 200);
    token = ((await pairRes.json()) as { token: string }).token;
  });

  after(async () => {
    await server.stop();
    rmSync(dataDir, { recursive: true, force: true });
  });

  it("rejects unauthenticated host", async () => {
    const res = await fetch(`${baseUrl}${Routes.host}`);
    assert.equal(res.status, 401);
  });

  it("returns host info", async () => {
    const res = await fetch(`${baseUrl}${Routes.host}`, {
      headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as { name: string; capabilities: { demoMode: boolean } };
    assert.equal(body.name, "test-host");
    assert.equal(body.capabilities.demoMode, true);
  });

  it("lists agents, prompts, and streams events", async () => {
    const list = await fetch(`${baseUrl}${Routes.agents}`, {
      headers: { authorization: `Bearer ${token}` },
    });
    const { agents } = (await list.json()) as { agents: Array<{ id: string }> };
    assert.ok(agents.length >= 1);
    const agentId = agents[0]!.id;

    const events: Array<{ type: string; event?: { type: string; status?: string; message?: { role: string } } }> =
      [];

    await new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(`${baseUrl}${Routes.agentStream(agentId)}?token=${encodeURIComponent(token)}`);
      const timer = setTimeout(() => {
        ws.close();
        reject(new Error("timeout waiting for stream"));
      }, 10000);

      const maybeDone = () => {
        const hasAssistant = events.some(
          (e) => e.type === "event" && e.event?.type === "message_done" && e.event.message?.role === "assistant",
        );
        const idle = events.some(
          (e) => e.type === "event" && e.event?.type === "status" && e.event.status === "idle",
        );
        if (hasAssistant && idle) {
          clearTimeout(timer);
          ws.close();
          resolve();
        }
      };

      ws.on("message", (data) => {
        events.push(JSON.parse(String(data)));
        maybeDone();
      });
      ws.on("open", () => {
        void fetch(`${baseUrl}${Routes.agentPrompt(agentId)}`, {
          method: "POST",
          headers: {
            authorization: `Bearer ${token}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({ message: "hello from test" }),
        }).then((r) => {
          if (!r.ok) reject(new Error(`prompt failed: ${r.status}`));
        }, reject);
      });
      ws.on("error", reject);
    });

    assert.ok(events.some((e) => e.type === "snapshot"));
  });

  it("round-trips pairing QR payload", async () => {
    const pairing = await server.buildPairingPayload();
    assert.deepEqual(decodePairingQr(encodePairingQr(pairing)), pairing);
  });
});
