import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BridgeStore } from "./store.js";
import { BridgeServer } from "./server.js";
import { DemoBackend } from "./backend/demo.js";
import {
  GitHubApiError,
  MockGitHubProvider,
  TokenGitHubProvider,
  createGitHubProvider,
} from "./github.js";

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
  it("connects mock GitHub, adds repo, picks branch worktree, launches agent", async () => {
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

      const before = await fetch(`${base}/v1/github/status`, { headers });
      const beforeStatus = (await before.json()) as { connected: boolean; mockAvailable?: boolean };
      assert.equal(beforeStatus.connected, false);
      assert.equal(beforeStatus.mockAvailable, true);

      const connect = await fetch(`${base}/v1/github/connect`, {
        method: "POST",
        headers,
        body: JSON.stringify({ mode: "mock" }),
      });
      assert.equal(connect.status, 200);
      const connected = (await connect.json()) as { connected: boolean; login?: string; mock: boolean };
      assert.equal(connected.connected, true);
      assert.equal(connected.mock, true);
      assert.equal(connected.login, "pocket-demo");

      const branchesRes = await fetch(`${base}/v1/github/repos/acme/checkout-web/branches`, {
        headers,
      });
      assert.equal(branchesRes.status, 200);
      const { branches } = (await branchesRes.json()) as {
        branches: Array<{ name: string; isDefault?: boolean }>;
      };
      assert.ok(branches.some((b) => b.name === "feat/hello-world"));
      assert.ok(branches.some((b) => b.isDefault));

      const addRes = await fetch(`${base}/v1/workspaces/from-github`, {
        method: "POST",
        headers,
        body: JSON.stringify({ fullName: "acme/checkout-web" }),
      });
      assert.equal(addRes.status, 201);
      const { workspace } = (await addRes.json()) as {
        workspace: { id: string; fullName?: string; worktreeCount?: number };
      };
      assert.equal(workspace.fullName, "acme/checkout-web");
      assert.equal(workspace.worktreeCount ?? 0, 0);

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

const API_BASE = "https://api.github.test";

type FakeRoute = unknown | ((url: URL) => unknown);

/** Minimal api.github.com stand-in: route by pathname, record request headers. */
function fakeGitHub(routes: Record<string, FakeRoute>) {
  const calls: Array<{ url: URL; headers: Headers }> = [];
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    calls.push({ url, headers: new Headers(init?.headers) });
    const route = routes[url.pathname];
    if (route === undefined) {
      return new Response(JSON.stringify({ message: "Not Found" }), { status: 404 });
    }
    const body = typeof route === "function" ? (route as (u: URL) => unknown)(url) : route;
    if (body instanceof Response) return body;
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
  return { calls, fetchImpl };
}

function repoPayload(overrides: Record<string, unknown> = {}) {
  return {
    id: 42,
    full_name: "acme/checkout-web",
    description: "Storefront",
    private: true,
    default_branch: "main",
    html_url: "https://github.com/acme/checkout-web",
    language: "TypeScript",
    ...overrides,
  };
}

describe("TokenGitHubProvider", () => {
  it("starts disconnected and reports no mock catalog", () => {
    const provider = new TokenGitHubProvider({ apiBase: API_BASE });
    const status = provider.status();
    assert.equal(status.connected, false);
    assert.equal(status.mode, "disconnected");
    assert.equal(status.mock, false);
    assert.equal(status.mockAvailable, false);
  });

  it("connects with a token, records the login, and persists it", async () => {
    const { calls, fetchImpl } = fakeGitHub({ "/user": { login: "octocat" } });
    const saved: Array<{ token: string; login: string } | null> = [];
    const provider = new TokenGitHubProvider({
      apiBase: API_BASE,
      fetchImpl,
      setToken: (auth) => saved.push(auth),
    });

    const status = await provider.connect({ mode: "token", token: " ghp_secret " });
    assert.equal(status.connected, true);
    assert.equal(status.mode, "token");
    assert.equal(status.mock, false);
    assert.equal(status.login, "octocat");
    assert.deepEqual(saved, [{ token: "ghp_secret", login: "octocat" }]);

    assert.equal(calls.length, 1);
    const headers = calls[0]!.headers;
    assert.equal(headers.get("authorization"), "Bearer ghp_secret");
    assert.equal(headers.get("accept"), "application/vnd.github+json");
    assert.equal(headers.get("x-github-api-version"), "2022-11-28");
    assert.equal(headers.get("user-agent"), "prime-pocket");
  });

  it("rejects an empty token without calling GitHub", async () => {
    const { calls, fetchImpl } = fakeGitHub({ "/user": { login: "octocat" } });
    const provider = new TokenGitHubProvider({ apiBase: API_BASE, fetchImpl });
    await assert.rejects(
      () => provider.connect({ mode: "token", token: "   " }),
      /personal access token is required/i,
    );
    assert.equal(calls.length, 0);
    assert.equal(provider.status().connected, false);
  });

  it("surfaces a rejected token as an actionable error", async () => {
    const { fetchImpl } = fakeGitHub({
      "/user": new Response(JSON.stringify({ message: "Bad credentials" }), { status: 401 }),
    });
    const provider = new TokenGitHubProvider({ apiBase: API_BASE, fetchImpl });
    await assert.rejects(
      () => provider.connect({ mode: "token", token: "ghp_bad" }),
      (e: unknown) => {
        assert.ok(e instanceof GitHubApiError);
        assert.equal(e.code, "github_token_invalid");
        assert.match(e.message, /rejected this token/i);
        return true;
      },
    );
    assert.equal(provider.status().connected, false);
  });

  it("explains that mock and OAuth connects are not available live", async () => {
    const provider = new TokenGitHubProvider({ apiBase: API_BASE });
    await assert.rejects(() => provider.connect({ mode: "mock" }), /--demo/);
    await assert.rejects(() => provider.connect({ mode: "oauth" }), /personal access token/i);
  });

  it("maps repositories from /user/repos and filters by query", async () => {
    const { calls, fetchImpl } = fakeGitHub({
      "/user/repos": [
        repoPayload(),
        repoPayload({
          id: 43,
          full_name: "acme/payments-api",
          description: null,
          private: false,
          language: "Go",
          html_url: null,
          default_branch: null,
        }),
      ],
    });
    const provider = new TokenGitHubProvider({
      apiBase: API_BASE,
      fetchImpl,
      token: "ghp_secret",
      login: "octocat",
    });

    const repos = await provider.listRepos();
    assert.deepEqual(repos[0], {
      id: "gh_42",
      fullName: "acme/checkout-web",
      description: "Storefront",
      private: true,
      defaultBranch: "main",
      htmlUrl: "https://github.com/acme/checkout-web",
      language: "TypeScript",
    });
    assert.deepEqual(repos[1], {
      id: "gh_43",
      fullName: "acme/payments-api",
      description: undefined,
      private: false,
      defaultBranch: "main",
      htmlUrl: "https://github.com/acme/payments-api",
      language: "Go",
    });
    assert.equal(calls[0]!.url.searchParams.get("per_page"), "100");
    assert.equal(calls[0]!.url.searchParams.get("sort"), "updated");

    const filtered = await provider.listRepos("payments");
    assert.deepEqual(
      filtered.map((r) => r.fullName),
      ["acme/payments-api"],
    );

    const byLanguage = await provider.listRepos("typescript");
    assert.deepEqual(
      byLanguage.map((r) => r.fullName),
      ["acme/checkout-web"],
    );
  });

  it("falls back to an exact owner/repo lookup outside the token's own list", async () => {
    const { fetchImpl } = fakeGitHub({
      "/user/repos": [],
      "/repos/prime-intellect/prime-agent": repoPayload({
        id: 7,
        full_name: "prime-intellect/prime-agent",
        private: false,
      }),
    });
    const provider = new TokenGitHubProvider({ apiBase: API_BASE, fetchImpl, token: "ghp_secret" });
    const repos = await provider.listRepos("prime-intellect/prime-agent");
    assert.deepEqual(
      repos.map((r) => r.fullName),
      ["prime-intellect/prime-agent"],
    );
  });

  it("marks the default branch and keeps protection flags", async () => {
    const { fetchImpl } = fakeGitHub({
      "/repos/acme/checkout-web": repoPayload({ default_branch: "develop" }),
      "/repos/acme/checkout-web/branches": [
        { name: "main", protected: true },
        { name: "develop", protected: false },
        { name: "feat/cart-drawer" },
      ],
    });
    const provider = new TokenGitHubProvider({ apiBase: API_BASE, fetchImpl, token: "ghp_secret" });
    const branches = await provider.listBranches("acme/checkout-web");
    assert.deepEqual(branches, [
      { name: "main", protected: true, isDefault: undefined },
      { name: "develop", protected: false, isDefault: true },
      { name: "feat/cart-drawer", protected: undefined, isDefault: undefined },
    ]);
  });

  it("returns undefined for a repo GitHub cannot see", async () => {
    const { fetchImpl } = fakeGitHub({});
    const provider = new TokenGitHubProvider({ apiBase: API_BASE, fetchImpl, token: "ghp_secret" });
    assert.equal(await provider.findRepo("acme/missing"), undefined);
  });

  it("reports an unreachable GitHub instead of a bare fetch failure", async () => {
    const fetchImpl = (async () => {
      throw new TypeError("fetch failed");
    }) as typeof fetch;
    const provider = new TokenGitHubProvider({ apiBase: API_BASE, fetchImpl });
    await assert.rejects(
      () => provider.connect({ mode: "token", token: "ghp_secret" }),
      /cannot reach api\.github\.com/i,
    );
  });

  it("clears the persisted token on disconnect", async () => {
    const { fetchImpl } = fakeGitHub({ "/user": { login: "octocat" } });
    const saved: Array<{ token: string; login: string } | null> = [];
    const provider = new TokenGitHubProvider({
      apiBase: API_BASE,
      fetchImpl,
      token: "ghp_secret",
      login: "octocat",
      setToken: (auth) => saved.push(auth),
    });
    const status = await provider.disconnect();
    assert.equal(status.connected, false);
    assert.equal(status.mode, "disconnected");
    assert.equal(status.login, undefined);
    assert.deepEqual(saved, [null]);
    assert.deepEqual(await provider.listRepos(), []);
    assert.deepEqual(await provider.listBranches("acme/checkout-web"), []);
  });

  it("drops a token GitHub has revoked while restoring the login", async () => {
    const { fetchImpl } = fakeGitHub({
      "/user": new Response(JSON.stringify({ message: "Bad credentials" }), { status: 401 }),
    });
    const saved: Array<{ token: string; login: string } | null> = [];
    const provider = new TokenGitHubProvider({
      apiBase: API_BASE,
      fetchImpl,
      token: "ghp_revoked",
      setToken: (auth) => saved.push(auth),
    });
    assert.equal(provider.status().connected, true);
    const status = await provider.refreshLogin();
    assert.equal(status.connected, false);
    assert.deepEqual(saved, [null]);
  });
});

/** api.github.com stand-in that only honours one token, for the HTTP round trip below. */
function scriptedGitHub(): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    if (new Headers(init?.headers).get("authorization") !== "Bearer ghp_secret") {
      return new Response(JSON.stringify({ message: "Bad credentials" }), { status: 401 });
    }
    const bodies: Record<string, unknown> = {
      "/user": { login: "octocat" },
      "/user/repos": [repoPayload()],
      "/repos/acme/checkout-web": repoPayload(),
      "/repos/acme/checkout-web/branches": [
        { name: "main", protected: true },
        { name: "feat/cart-drawer" },
      ],
    };
    const body = bodies[url.pathname];
    if (!body) return new Response(JSON.stringify({ message: "Not Found" }), { status: 404 });
    return new Response(JSON.stringify(body), { status: 200 });
  }) as typeof fetch;
}

describe("github over the bridge API (token host)", () => {
  it("connects with a pasted token, lists the catalog, and disconnects", async () => {
    const dir = mkdtempSync(join(tmpdir(), "pocket-gh-live-"));
    const port = await freePort();
    try {
      const store = new BridgeStore(dir, "gh-live-test");
      const backend = new DemoBackend(store.data.identity.hostId, join(dir, "artifacts"));
      const server = new BridgeServer({
        store,
        backend,
        port,
        tls: false,
        github: new TokenGitHubProvider({
          apiBase: API_BASE,
          fetchImpl: scriptedGitHub(),
          setToken: (auth) => {
            if (auth) store.setGitHubAuth(auth);
            else store.clearGitHubAuth();
          },
        }),
      });
      await server.start();
      const base = `http://127.0.0.1:${port}`;
      const pair = await fetch(`${base}/v1/pair`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ pairCode: store.data.pairCode, deviceLabel: "test" }),
      });
      const { token } = (await pair.json()) as { token: string };
      const headers = { authorization: `Bearer ${token}`, "content-type": "application/json" };

      const before = (await (await fetch(`${base}/v1/github/status`, { headers })).json()) as {
        connected: boolean;
        mockAvailable?: boolean;
      };
      assert.equal(before.connected, false);
      assert.equal(before.mockAvailable, false);

      const noToken = await fetch(`${base}/v1/github/connect`, {
        method: "POST",
        headers,
        body: JSON.stringify({ mode: "token" }),
      });
      assert.equal(noToken.status, 400);
      assert.equal(((await noToken.json()) as { code?: string }).code, "github_token_required");

      // A bad GitHub token must not answer 401 — the app reads that as a lost pairing.
      const badToken = await fetch(`${base}/v1/github/connect`, {
        method: "POST",
        headers,
        body: JSON.stringify({ mode: "token", token: "ghp_bad" }),
      });
      assert.equal(badToken.status, 400);
      assert.equal(((await badToken.json()) as { code?: string }).code, "github_token_invalid");

      const connect = await fetch(`${base}/v1/github/connect`, {
        method: "POST",
        headers,
        body: JSON.stringify({ mode: "token", token: "ghp_secret" }),
      });
      assert.equal(connect.status, 200);
      const connected = (await connect.json()) as {
        connected: boolean;
        mode: string;
        mock: boolean;
        login?: string;
      };
      assert.deepEqual(connected, {
        connected: true,
        mode: "token",
        mock: false,
        mockAvailable: false,
        login: "octocat",
      });
      assert.equal(new BridgeStore(dir, "gh-live-test").getGitHubAuth()?.token, "ghp_secret");

      const { repos } = (await (
        await fetch(`${base}/v1/github/repos?q=checkout`, { headers })
      ).json()) as { repos: Array<{ fullName: string; private: boolean }> };
      assert.deepEqual(repos, [
        {
          id: "gh_42",
          fullName: "acme/checkout-web",
          description: "Storefront",
          private: true,
          defaultBranch: "main",
          htmlUrl: "https://github.com/acme/checkout-web",
          language: "TypeScript",
        },
      ]);

      const { branches } = (await (
        await fetch(`${base}/v1/github/repos/acme/checkout-web/branches`, { headers })
      ).json()) as { branches: Array<{ name: string; isDefault?: boolean }> };
      assert.equal(branches.find((b) => b.isDefault)?.name, "main");

      const added = await fetch(`${base}/v1/workspaces/from-github`, {
        method: "POST",
        headers,
        body: JSON.stringify({ fullName: "acme/checkout-web" }),
      });
      assert.equal(added.status, 201);

      const disconnect = await fetch(`${base}/v1/github/disconnect`, { method: "POST", headers });
      assert.equal(((await disconnect.json()) as { connected: boolean }).connected, false);
      assert.equal(new BridgeStore(dir, "gh-live-test").getGitHubAuth(), undefined);

      const afterDisconnect = await fetch(`${base}/v1/github/repos`, { headers });
      assert.equal(afterDisconnect.status, 401);
      assert.equal(
        ((await afterDisconnect.json()) as { code?: string }).code,
        "github_disconnected",
      );

      await server.stop();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("createGitHubProvider", () => {
  it("serves the mock catalog in demo mode", () => {
    const provider = createGitHubProvider({ mock: true });
    assert.ok(provider instanceof MockGitHubProvider);
    assert.equal(provider.status().mockAvailable, true);
  });

  it("accepts token connects on live hosts and persists through the store", async () => {
    const dir = mkdtempSync(join(tmpdir(), "pocket-gh-token-"));
    const previous = process.env.GITHUB_TOKEN;
    const previousPocket = process.env.PRIME_POCKET_GITHUB_TOKEN;
    delete process.env.GITHUB_TOKEN;
    delete process.env.PRIME_POCKET_GITHUB_TOKEN;
    try {
      const store = new BridgeStore(dir, "gh-token-test");
      const provider = createGitHubProvider({
        mock: false,
        getToken: () => {
          const auth = store.getGitHubAuth();
          return auth ? { token: auth.token, login: auth.login } : undefined;
        },
        setToken: (auth) => {
          if (auth) store.setGitHubAuth(auth);
          else store.clearGitHubAuth();
        },
      });
      assert.ok(provider instanceof TokenGitHubProvider);
      assert.equal(provider.status().connected, false);
      assert.equal(provider.status().mockAvailable, false);

      // Connect through the same persistence callbacks the bridge wires up.
      const live = new TokenGitHubProvider({
        apiBase: API_BASE,
        fetchImpl: fakeGitHub({ "/user": { login: "octocat" } }).fetchImpl,
        setToken: (auth) => {
          if (auth) store.setGitHubAuth(auth);
          else store.clearGitHubAuth();
        },
      });
      await live.connect({ mode: "token", token: "ghp_secret" });
      assert.deepEqual(new BridgeStore(dir, "gh-token-test").getGitHubAuth()?.login, "octocat");

      await live.disconnect();
      assert.equal(new BridgeStore(dir, "gh-token-test").getGitHubAuth(), undefined);
    } finally {
      if (previous !== undefined) process.env.GITHUB_TOKEN = previous;
      if (previousPocket !== undefined) process.env.PRIME_POCKET_GITHUB_TOKEN = previousPocket;
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
