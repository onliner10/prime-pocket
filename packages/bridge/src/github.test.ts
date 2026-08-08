import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
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

describe("github workspaces + worktrees", () => {
  it("adds a repo workspace, creates a worktree, then launches an agent there", async () => {
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

      const addRes = await fetch(`${base}/v1/workspaces/from-github`, {
        method: "POST",
        headers,
        body: JSON.stringify({ fullName: "acme/checkout-web" }),
      });
      assert.equal(addRes.status, 201);
      const { workspace } = (await addRes.json()) as {
        workspace: { id: string; fullName?: string; worktreeCount?: number; repoRoot?: string };
      };
      assert.equal(workspace.fullName, "acme/checkout-web");
      assert.equal(workspace.worktreeCount ?? 0, 0);
      assert.ok(workspace.repoRoot?.includes("repos"));

      const launchTooSoon = await fetch(`${base}/v1/agents`, {
        method: "POST",
        headers,
        body: JSON.stringify({ workspaceId: workspace.id, name: "x", prompt: "y" }),
      });
      assert.equal(launchTooSoon.status, 400);

      const wtRes = await fetch(`${base}/v1/workspaces/${workspace.id}/worktrees`, {
        method: "POST",
        headers,
        body: JSON.stringify({ branch: "feat/hello-world" }),
      });
      assert.equal(wtRes.status, 201);
      const { worktree } = (await wtRes.json()) as {
        worktree: { id: string; branch: string; cwd: string };
      };
      assert.equal(worktree.branch, "feat/hello-world");
      assert.ok(worktree.cwd.includes("worktrees"));
      assert.ok(existsSync(join(worktree.cwd, ".pocket-worktree.json")));

      const launchRes = await fetch(`${base}/v1/agents`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          worktreeId: worktree.id,
          name: "First task",
          prompt: "Add a hello world script",
        }),
      });
      assert.equal(launchRes.status, 201);
      const { agent } = (await launchRes.json()) as { agent: { cwd?: string } };
      assert.equal(agent.cwd, worktree.cwd);

      await server.stop();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
