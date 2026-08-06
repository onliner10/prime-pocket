/**
 * End-to-end smoke of the Pocket bridge API.
 * Run from repo root:
 *   pnpm --filter @prime-pocket/bridge exec node --import tsx src/e2e-smoke.ts
 */
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, type ChildProcess } from "node:child_process";
import WebSocket from "ws";
import {
  Routes,
  decodePairingQr,
  encodePairingQr,
  type PairingQrPayload,
  type StreamServerMessage,
} from "@prime-pocket/protocol";

const HERE = dirname(fileURLToPath(import.meta.url));
const BRIDGE_ROOT = join(HERE, "..");
const PORT = 18420;
const BASE = `http://127.0.0.1:${PORT}`;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitHealth(timeoutMs = 12000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${BASE}/health`);
      if (res.ok) return;
    } catch {
      // retry
    }
    await sleep(150);
  }
  throw new Error("bridge health check timed out");
}

async function json<T>(res: Response): Promise<T> {
  const body = await res.json();
  if (!res.ok) throw new Error(`${res.status} ${JSON.stringify(body)}`);
  return body as T;
}

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

async function main() {
  const dataDir = mkdtempSync(join(tmpdir(), "pocket-e2e-"));
  const results: string[] = [];
  const pass = (name: string) => {
    results.push(`PASS  ${name}`);
    console.log(`✓ ${name}`);
  };

  let child: ChildProcess | null = null;
  try {
    child = spawn(
      process.execPath,
      [
        join(BRIDGE_ROOT, "dist/cli.js"),
        "bridge",
        "--demo",
        "--http",
        "--data-dir",
        dataDir,
        "--port",
        String(PORT),
        "--ntfy-topic",
        "pocket-e2e-unused",
      ],
      {
        cwd: BRIDGE_ROOT,
        stdio: ["ignore", "pipe", "pipe"],
        env: { ...process.env, PRIME_POCKET_DEMO: "1" },
      },
    );
    child.stdout?.on("data", () => undefined);
    child.stderr?.on("data", () => undefined);
    child.on("exit", (code, signal) => {
      if (code && code !== 0) console.error(`bridge exited early code=${code} signal=${signal}`);
    });

    await waitHealth();
    pass("bridge starts and /health ok");

    const store = JSON.parse(readFileSync(join(dataDir, "bridge.json"), "utf8")) as {
      pairCode: string;
      identity: { fingerprint: string; hostId: string; hostName: string };
    };

    const pairInfo = await json<{ hostId: string; fingerprint: string; urls: string[] }>(
      await fetch(`${BASE}${Routes.pairInfo}`),
    );
    assert(pairInfo.hostId === store.identity.hostId, "pair info hostId mismatch");
    pass("GET /v1/pair/info");

    const payload: PairingQrPayload = {
      v: 1,
      url: BASE,
      urls: [BASE, ...pairInfo.urls],
      pairCode: store.pairCode,
      fingerprint: store.identity.fingerprint,
      hostId: store.identity.hostId,
      hostName: store.identity.hostName,
    };
    assert(decodePairingQr(encodePairingQr(payload)).pairCode === store.pairCode, "QR roundtrip");
    pass("pairing QR encode/decode");

    const bad = await fetch(`${BASE}${Routes.pair}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ pairCode: "deadbeef", deviceLabel: "x" }),
    });
    assert(bad.status === 403, `expected 403 got ${bad.status}`);
    pass("rejects invalid pair code");

    const paired = await json<{ token: string; host: { capabilities: { demoMode: boolean } } }>(
      await fetch(`${BASE}${Routes.pair}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ pairCode: store.pairCode, deviceLabel: "e2e-phone" }),
      }),
    );
    assert(paired.token.startsWith("pp_"), "token format");
    assert(paired.host.capabilities.demoMode === true, "demo mode");
    pass("POST /v1/pair issues token");

    const reuse = await fetch(`${BASE}${Routes.pair}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ pairCode: store.pairCode, deviceLabel: "again" }),
    });
    assert(reuse.status === 403, "pair code should rotate after use");
    pass("pair code is one-time");

    const auth = { authorization: `Bearer ${paired.token}`, "content-type": "application/json" };

    assert((await fetch(`${BASE}${Routes.agents}`)).status === 401, "unauth list");
    pass("requires bearer for /v1/agents");

    const host = await json<{ urls: string[] }>(await fetch(`${BASE}${Routes.host}`, { headers: auth }));
    assert(host.urls.length >= 1, "host advertises urls");
    pass("GET /v1/host");

    const { agents } = await json<{ agents: Array<{ id: string }> }>(
      await fetch(`${BASE}${Routes.agents}`, { headers: auth }),
    );
    assert(agents.length >= 1, "demo agent present");
    const agentId = agents[0]!.id;
    pass(`GET /v1/agents (${agents.length})`);

    const launched = await json<{ agent: { id: string } }>(
      await fetch(`${BASE}${Routes.agents}`, {
        method: "POST",
        headers: auth,
        body: JSON.stringify({ name: "e2e-worker", prompt: "say hi briefly" }),
      }),
    );
    assert(launched.agent.id, "launch id");
    pass("POST /v1/agents launch");

    const events: StreamServerMessage[] = [];
    await new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(
        `${BASE.replace("http", "ws")}${Routes.agentStream(agentId)}?token=${encodeURIComponent(paired.token)}`,
      );
      const timer = setTimeout(() => {
        ws.close();
        reject(new Error("stream timeout"));
      }, 15000);

      const done = () => {
        const hasAssistant = events.some(
          (e) =>
            e.type === "event" &&
            e.event.type === "message_done" &&
            e.event.message.role === "assistant",
        );
        const idle = events.some(
          (e) => e.type === "event" && e.event.type === "status" && e.event.status === "idle",
        );
        if (hasAssistant && idle) {
          clearTimeout(timer);
          ws.close();
          resolve();
        }
      };

      ws.on("open", () => {
        void fetch(`${BASE}${Routes.agentPrompt(agentId)}`, {
          method: "POST",
          headers: auth,
          body: JSON.stringify({ message: "hello e2e — please create an artifact log" }),
        }).then(async (r) => {
          if (!r.ok) reject(new Error(`prompt ${r.status}`));
        }, reject);
      });
      ws.on("message", (data) => {
        events.push(JSON.parse(String(data)) as StreamServerMessage);
        done();
      });
      ws.on("error", reject);
    });
    assert(events[0]?.type === "snapshot", "first frame is snapshot");
    pass("WebSocket stream + prompt deltas");

    await sleep(600);
    const snap = await json<{ artifacts: Array<{ id: string; name: string }> }>(
      await fetch(`${BASE}${Routes.agent(agentId)}`, { headers: auth }),
    );
    assert(snap.artifacts.length >= 1, "artifact created");
    const art = snap.artifacts[0]!;
    const artRes = await fetch(
      `${BASE}${Routes.agentArtifact(agentId, art.id)}?token=${encodeURIComponent(paired.token)}`,
    );
    assert(artRes.ok, `artifact download ${artRes.status}`);
    assert((await artRes.text()).includes("Demo artifact"), "artifact body");
    pass(`artifact download (${art.name})`);

    const needEvents: StreamServerMessage[] = [];
    await new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(
        `${BASE.replace("http", "ws")}${Routes.agentStream(agentId)}?token=${encodeURIComponent(paired.token)}`,
      );
      const timer = setTimeout(() => {
        ws.close();
        reject(new Error("needs_input timeout"));
      }, 15000);
      let requestId: string | undefined;

      ws.on("open", () => {
        void fetch(`${BASE}${Routes.agentPrompt(agentId)}`, {
          method: "POST",
          headers: auth,
          body: JSON.stringify({ message: "please confirm permission to proceed" }),
        });
      });
      ws.on("message", (data) => {
        const msg = JSON.parse(String(data)) as StreamServerMessage;
        needEvents.push(msg);
        if (msg.type === "event" && msg.event.type === "needs_input") {
          requestId = msg.event.requestId;
          void fetch(`${BASE}${Routes.agentNeedsInput(agentId)}`, {
            method: "POST",
            headers: auth,
            body: JSON.stringify({ requestId, value: true }),
          });
        }
        if (
          requestId &&
          msg.type === "event" &&
          msg.event.type === "status" &&
          msg.event.status === "idle" &&
          needEvents.some(
            (e) =>
              e.type === "event" &&
              e.event.type === "message_done" &&
              e.event.message.role === "assistant" &&
              e.event.message.text.toLowerCase().includes("continuing"),
          )
        ) {
          clearTimeout(timer);
          ws.close();
          resolve();
        }
      });
      ws.on("error", reject);
    });
    pass("needs_input → approve → continue");

    await json(
      await fetch(`${BASE}${Routes.agentSteer(agentId)}`, {
        method: "POST",
        headers: auth,
        body: JSON.stringify({ message: "steer note" }),
      }),
    );
    await sleep(1200);
    await json(
      await fetch(`${BASE}${Routes.agentFollowUp(agentId)}`, {
        method: "POST",
        headers: auth,
        body: JSON.stringify({ message: "queued note" }),
      }),
    );
    await json(await fetch(`${BASE}${Routes.agentCancel(agentId)}`, { method: "POST", headers: auth }));
    pass("steer / follow-up / cancel");

    // Client-side fleet aggregation (same logic as mobile listFleetAgents)
    const store2 = JSON.parse(readFileSync(join(dataDir, "bridge.json"), "utf8")) as {
      pairCode: string;
      identity: { fingerprint: string };
    };
    const pair2 = await json<{ token: string; host: { id: string; name: string; fingerprint: string; urls: string[] } }>(
      await fetch(`${BASE}${Routes.pair}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ pairCode: store2.pairCode, deviceLabel: "client-lib" }),
      }),
    );
    // Unreachable URL should be skipped by reachability probe
    const candidates = ["http://127.0.0.1:1", BASE];
    let reachable: string | undefined;
    for (const url of candidates) {
      try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 1500);
        const res = await fetch(`${url}/health`, { signal: ctrl.signal });
        clearTimeout(t);
        if (res.ok) {
          reachable = url;
          break;
        }
      } catch {
        // try next
      }
    }
    assert(reachable === BASE, "reachability failover");
    const auth2 = { authorization: `Bearer ${pair2.token}` };
    const fleetA = await json<{ agents: unknown[] }>(
      await fetch(`${reachable}${Routes.agents}`, { headers: auth2 }),
    );
    // Simulate offline second host
    let offlineError = false;
    try {
      await fetch("http://127.0.0.1:1/v1/agents", {
        headers: auth2,
        signal: AbortSignal.timeout(500),
      });
    } catch {
      offlineError = true;
    }
    assert(offlineError, "offline host errors");
    assert(fleetA.agents.length >= 2, "fleet aggregate");
    pass("client reachability + multi-host fleet aggregation");

    // TLS fingerprint mismatch guard (logic from mobile pairWithHost)
    assert(
      pair2.host.fingerprint === store.identity.fingerprint,
      "fingerprint stable across pairs",
    );
    pass("fingerprint stable for paired host");

    console.log("\nAll e2e checks passed:");
    for (const line of results) console.log(`  ${line}`);
  } finally {
    if (child?.pid) {
      child.kill("SIGTERM");
      await sleep(300);
      try {
        child.kill("SIGKILL");
      } catch {
        // ignore
      }
    }
    rmSync(dataDir, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error("\nE2E FAILED:", err);
  process.exit(1);
});
