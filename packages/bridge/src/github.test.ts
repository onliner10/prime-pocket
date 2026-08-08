import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BridgeStore } from "./store.js";
import { BridgeServer } from "./server.js";
import { DemoBackend } from "./backend/demo.js";
import { MockGitHubProvider } from "./github.js";

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

describe("github workspaces", () => {
  it("lists mock repos and adds a workspace without credentials", async () => {
    const dir = mkdtempSync(join(tmpdir(), "pocket-gh-"));
    const port = await freePort();
    try {
      const store = new BridgeStore(dir, "gh-test");
      const backend = new DemoBackend(store.data.identity.hostId, join(dir, "artifacts"));
      const server = new BridgeServer({
        store,
        backend,
        port,
        tls: false,
        github: new MockGitHubProvider(),
      });
      await server.start();
      const base = `http://127.0.0.1:${port}`;
      const pair = await fetch(`${base}/v1/pair`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ pairCode: store.data.pairCode, deviceLabel: "test" }),
      });
      assert.equal(pair.status, 200);
      const { token } = (await pair.json()) as { token: string };
      const headers = { authorization: `Bearer ${token}`, "content-type": "application/json" };

      const statusRes = await fetch(`${base}/v1/github/status`, { headers });
      const status = (await statusRes.json()) as { mock: boolean; connected: boolean; login?: string };
      assert.equal(status.mock, true);
      assert.equal(status.connected, true);
      assert.equal(status.login, "pocket-demo");

      const reposRes = await fetch(`${base}/v1/github/repos?q=checkout`, { headers });
      const { repos } = (await reposRes.json()) as { repos: Array<{ fullName: string }> };
      assert.ok(repos.some((r) => r.fullName === "acme/checkout-web"));

      const addRes = await fetch(`${base}/v1/workspaces/from-github`, {
        method: "POST",
        headers,
        body: JSON.stringify({ fullName: "acme/checkout-web" }),
      });
      assert.equal(addRes.status, 201);
      const { workspace } = (await addRes.json()) as {
        workspace: { id: string; name: string; fullName?: string; source: string; cwd: string };
      };
      assert.equal(workspace.name, "checkout-web");
      assert.equal(workspace.fullName, "acme/checkout-web");
      assert.equal(workspace.source, "github");
      assert.ok(workspace.cwd.includes("worktrees"));

      const listRes = await fetch(`${base}/v1/workspaces`, { headers });
      const { workspaces } = (await listRes.json()) as { workspaces: unknown[] };
      assert.equal(workspaces.length, 1);

      const launchRes = await fetch(`${base}/v1/agents`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          workspaceId: workspace.id,
          name: "First task",
          prompt: "Add a hello world script",
        }),
      });
      assert.equal(launchRes.status, 201);
      const { agent } = (await launchRes.json()) as { agent: { cwd?: string } };
      assert.equal(agent.cwd, workspace.cwd);

      await server.stop();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
