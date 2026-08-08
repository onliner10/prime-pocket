/**
 * GitHub catalog for Pocket workspaces.
 * Demo/e2e use a mock catalog (no credentials); live hosts use a personal access token
 * that stays on this machine (bridge store / host env) and never reaches the phone.
 */
import type {
  GitHubBranch,
  GitHubCatalogRepo,
  GitHubConnectRequest,
  GitHubStatus,
} from "@prime-pocket/protocol";

const MOCK_LOGIN = "pocket-demo";

const MOCK_REPOS: GitHubCatalogRepo[] = [
  {
    id: "gh_mock_1",
    fullName: "acme/checkout-web",
    description: "Storefront and checkout flows",
    private: false,
    defaultBranch: "main",
    htmlUrl: "https://github.com/acme/checkout-web",
    language: "TypeScript",
  },
  {
    id: "gh_mock_2",
    fullName: "acme/payments-api",
    description: "Payment intents and webhooks",
    private: true,
    defaultBranch: "main",
    htmlUrl: "https://github.com/acme/payments-api",
    language: "Go",
  },
  {
    id: "gh_mock_3",
    fullName: "acme/design-system",
    description: "Shared UI kit",
    private: false,
    defaultBranch: "main",
    htmlUrl: "https://github.com/acme/design-system",
    language: "TypeScript",
  },
  {
    id: "gh_mock_4",
    fullName: "prime-intellect/prime-agent",
    description: "Prime Agent daemon and tooling",
    private: false,
    defaultBranch: "main",
    htmlUrl: "https://github.com/prime-intellect/prime-agent",
    language: "TypeScript",
  },
  {
    id: "gh_mock_5",
    fullName: "onliner10/prime-pocket",
    description: "Mobile access to Prime Agent",
    private: false,
    defaultBranch: "horde",
    htmlUrl: "https://github.com/onliner10/prime-pocket",
    language: "TypeScript",
  },
];

const MOCK_BRANCHES: Record<string, GitHubBranch[]> = {
  "acme/checkout-web": [
    { name: "main", isDefault: true },
    { name: "develop" },
    { name: "feat/hello-world" },
    { name: "feat/cart-drawer" },
    { name: "fix/payment-retry" },
  ],
  "acme/payments-api": [
    { name: "main", isDefault: true },
    { name: "release/2026.08" },
    { name: "feat/webhooks-v2" },
  ],
  "acme/design-system": [
    { name: "main", isDefault: true },
    { name: "feat/button-tokens" },
  ],
  "prime-intellect/prime-agent": [
    { name: "main", isDefault: true },
    { name: "develop" },
    { name: "feat/daemon-protocol-7" },
  ],
  "onliner10/prime-pocket": [
    { name: "horde", isDefault: true },
    { name: "main" },
    { name: "feat/mobile-workspaces" },
  ],
};

export type GitHubProviderMode = "mock" | "token" | "oauth" | "disconnected";

export interface GitHubProvider {
  status(): GitHubStatus;
  listRepos(query?: string): Promise<GitHubCatalogRepo[]>;
  listBranches(fullName: string): Promise<GitHubBranch[]>;
  /** Connect GitHub; mock needs no credentials. */
  connect(opts?: GitHubConnectRequest): Promise<GitHubStatus>;
  disconnect(): Promise<GitHubStatus>;
  findRepo(fullName: string): Promise<GitHubCatalogRepo | undefined>;
}

export class MockGitHubProvider implements GitHubProvider {
  /** Start disconnected so onboarding / Connect GitHub is a real step. */
  private connected = false;

  status(): GitHubStatus {
    return {
      connected: this.connected,
      mode: this.connected ? "mock" : "disconnected",
      mock: true,
      mockAvailable: true,
      login: this.connected ? MOCK_LOGIN : undefined,
    };
  }

  async connect(opts?: GitHubConnectRequest): Promise<GitHubStatus> {
    void opts;
    this.connected = true;
    return this.status();
  }

  async disconnect(): Promise<GitHubStatus> {
    this.connected = false;
    return this.status();
  }

  async listRepos(query?: string): Promise<GitHubCatalogRepo[]> {
    if (!this.connected) return [];
    const q = query?.trim().toLowerCase();
    if (!q) return [...MOCK_REPOS];
    return MOCK_REPOS.filter(
      (r) =>
        r.fullName.toLowerCase().includes(q) ||
        (r.description?.toLowerCase().includes(q) ?? false) ||
        (r.language?.toLowerCase().includes(q) ?? false),
    );
  }

  async listBranches(fullName: string): Promise<GitHubBranch[]> {
    if (!this.connected) return [];
    const key = fullName.trim().toLowerCase();
    const exact = Object.keys(MOCK_BRANCHES).find((k) => k.toLowerCase() === key);
    if (exact) return [...MOCK_BRANCHES[exact]!];
    const repo = MOCK_REPOS.find((r) => r.fullName.toLowerCase() === key);
    return [{ name: repo?.defaultBranch ?? "main", isDefault: true }];
  }

  async findRepo(fullName: string): Promise<GitHubCatalogRepo | undefined> {
    const key = fullName.trim().toLowerCase();
    return MOCK_REPOS.find((r) => r.fullName.toLowerCase() === key);
  }
}

const GITHUB_API_BASE = "https://api.github.com";
const GITHUB_LOGIN_BASE = "https://github.com";
const GITHUB_USER_AGENT = "prime-pocket";
/** Classic OAuth scopes for private + public repo catalog access. */
const OAUTH_SCOPES = "repo read:user";
/** `/user/repos` pages to walk before falling back to an exact lookup. */
const REPO_PAGES = 3;
const PER_PAGE = 100;

/** Failure talking to api.github.com / login.github.com, carrying a code the bridge can map. */
export class GitHubApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code = "github_error",
  ) {
    super(message);
    this.name = "GitHubApiError";
  }
}

interface RestRepo {
  id?: number;
  full_name: string;
  description?: string | null;
  private?: boolean;
  default_branch?: string | null;
  html_url?: string | null;
  language?: string | null;
}

interface RestBranch {
  name: string;
  protected?: boolean;
}

interface DeviceCodeResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  expires_in: number;
  interval: number;
}

interface DeviceTokenResponse {
  access_token?: string;
  token_type?: string;
  scope?: string;
  error?: string;
  error_description?: string;
  interval?: number;
}

type AuthMode = "token" | "oauth";

interface PendingOAuth {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  expiresAtMs: number;
  intervalSec: number;
  generation: number;
}

function mapRepo(repo: RestRepo): GitHubCatalogRepo {
  return {
    id: repo.id ? `gh_${repo.id}` : `gh_${repo.full_name}`,
    fullName: repo.full_name,
    description: repo.description ?? undefined,
    private: Boolean(repo.private),
    defaultBranch: repo.default_branch ?? "main",
    htmlUrl: repo.html_url ?? `https://github.com/${repo.full_name}`,
    language: repo.language ?? undefined,
  };
}

function matchesQuery(repo: GitHubCatalogRepo, query: string): boolean {
  return (
    repo.fullName.toLowerCase().includes(query) ||
    (repo.description?.toLowerCase().includes(query) ?? false) ||
    (repo.language?.toLowerCase().includes(query) ?? false)
  );
}

function splitFullName(fullName: string): { owner: string; repo: string } | undefined {
  const [owner, repo] = fullName.trim().split("/");
  if (!owner || !repo) return undefined;
  return { owner, repo };
}

export interface TokenGitHubProviderOptions {
  /** Token to start connected with (persisted store or host env). */
  token?: string;
  /** Login for a persisted token; refreshed from GitHub when unknown. */
  login?: string;
  /** Whether a restored token came from PAT paste or browser OAuth. */
  mode?: AuthMode;
  /** Persist a validated token, or clear it on disconnect. */
  setToken?: (auth: { token: string; login: string; mode: AuthMode } | null) => void;
  /** Public OAuth App client id (device flow — no client secret). */
  clientId?: string;
  /** Injected in tests; defaults to global fetch. */
  fetchImpl?: typeof fetch;
  apiBase?: string;
  loginBase?: string;
  /** Injected in tests so polling can run without real timers. */
  schedule?: (fn: () => void | Promise<void>, ms: number) => { clear: () => void };
}

/**
 * Live GitHub via a personal access token or browser device-flow OAuth.
 * Credentials stay on this host; the phone only initiates and polls status.
 */
export class TokenGitHubProvider implements GitHubProvider {
  private auth: { token: string; login?: string; mode: AuthMode } | undefined;
  private pending: PendingOAuth | undefined;
  private pollHandle: { clear: () => void } | undefined;
  private oauthGeneration = 0;
  private readonly setToken?: (auth: { token: string; login: string; mode: AuthMode } | null) => void;
  private readonly clientId?: string;
  private readonly fetchImpl: typeof fetch;
  private readonly apiBase: string;
  private readonly loginBase: string;
  private readonly schedule: (fn: () => void | Promise<void>, ms: number) => { clear: () => void };

  constructor(opts: TokenGitHubProviderOptions = {}) {
    const token = opts.token?.trim();
    this.auth = token
      ? { token, login: opts.login, mode: opts.mode ?? "token" }
      : undefined;
    this.setToken = opts.setToken;
    this.clientId = opts.clientId?.trim() || undefined;
    this.fetchImpl = opts.fetchImpl ?? ((input, init) => fetch(input, init));
    this.apiBase = (opts.apiBase ?? GITHUB_API_BASE).replace(/\/$/, "");
    this.loginBase = (opts.loginBase ?? GITHUB_LOGIN_BASE).replace(/\/$/, "");
    this.schedule =
      opts.schedule ??
      ((fn, ms) => {
        const id = setTimeout(() => {
          void fn();
        }, ms);
        return { clear: () => clearTimeout(id) };
      });
  }

  status(): GitHubStatus {
    const oauth = this.pending
      ? {
          userCode: this.pending.userCode,
          verificationUri: this.pending.verificationUri,
          expiresAt: new Date(this.pending.expiresAtMs).toISOString(),
          interval: this.pending.intervalSec,
        }
      : undefined;
    return {
      connected: Boolean(this.auth),
      mode: this.auth ? this.auth.mode : "disconnected",
      mock: false,
      mockAvailable: false,
      oauthAvailable: Boolean(this.clientId),
      login: this.auth?.login,
      oauth,
    };
  }

  async connect(opts?: GitHubConnectRequest): Promise<GitHubStatus> {
    const mode = opts?.mode ?? (opts?.token ? "token" : this.clientId ? "oauth" : "token");
    if (mode === "mock") {
      throw new GitHubApiError(
        "This host does not serve mock GitHub. Restart the bridge with --demo for mock mode.",
        400,
        "github_mock_unavailable",
      );
    }
    if (mode === "oauth") {
      return this.startOAuth();
    }
    const token = opts?.token?.trim();
    if (!token) {
      throw new GitHubApiError(
        "A GitHub personal access token is required (classic: repo scope; fine-grained: read access to contents and metadata).",
        400,
        "github_token_required",
      );
    }
    this.cancelOAuth();
    const user = await this.gh<{ login?: string }>("/user", token);
    const login = user.login ?? "github";
    this.auth = { token, login, mode: "token" };
    this.setToken?.({ token, login, mode: "token" });
    return this.status();
  }

  async disconnect(): Promise<GitHubStatus> {
    this.cancelOAuth();
    this.auth = undefined;
    this.setToken?.(null);
    return this.status();
  }

  /** Fill in the login for a token restored from disk/env; drops tokens GitHub has revoked. */
  async refreshLogin(): Promise<GitHubStatus> {
    const auth = this.auth;
    if (!auth || auth.login) return this.status();
    try {
      const user = await this.gh<{ login?: string }>("/user", auth.token);
      if (this.auth?.token === auth.token) {
        this.auth = { token: auth.token, login: user.login ?? "github", mode: auth.mode };
      }
    } catch (e) {
      if (e instanceof GitHubApiError && e.code === "github_token_invalid") {
        this.auth = undefined;
        this.setToken?.(null);
      }
    }
    return this.status();
  }

  async listRepos(query?: string): Promise<GitHubCatalogRepo[]> {
    const auth = this.auth;
    if (!auth) return [];
    const repos: GitHubCatalogRepo[] = [];
    for (let page = 1; page <= REPO_PAGES; page += 1) {
      const batch = await this.gh<RestRepo[]>("/user/repos", auth.token, {
        per_page: PER_PAGE,
        page,
        sort: "updated",
        affiliation: "owner,collaborator,organization_member",
      });
      if (!Array.isArray(batch)) break;
      repos.push(...batch.map(mapRepo));
      if (batch.length < PER_PAGE) break;
    }
    const q = query?.trim().toLowerCase();
    if (!q) return repos;
    const matches = repos.filter((r) => matchesQuery(r, q));
    if (matches.length) return matches;
    // Beyond the first pages of the token's own list, an exact owner/repo still resolves.
    const exact = q.includes("/") ? await this.findRepo(q) : undefined;
    return exact ? [exact] : [];
  }

  async listBranches(fullName: string): Promise<GitHubBranch[]> {
    const auth = this.auth;
    if (!auth) return [];
    const parts = splitFullName(fullName);
    if (!parts) return [];
    const path = `/repos/${encodeURIComponent(parts.owner)}/${encodeURIComponent(parts.repo)}`;
    const [repo, branches] = await Promise.all([
      this.gh<RestRepo>(path, auth.token),
      this.gh<RestBranch[]>(`${path}/branches`, auth.token, { per_page: PER_PAGE }),
    ]);
    const defaultBranch = repo.default_branch ?? undefined;
    return (Array.isArray(branches) ? branches : []).map((b) => ({
      name: b.name,
      protected: b.protected,
      isDefault: b.name === defaultBranch ? true : undefined,
    }));
  }

  async findRepo(fullName: string): Promise<GitHubCatalogRepo | undefined> {
    const auth = this.auth;
    if (!auth) return undefined;
    const parts = splitFullName(fullName);
    if (!parts) return undefined;
    try {
      const repo = await this.gh<RestRepo>(
        `/repos/${encodeURIComponent(parts.owner)}/${encodeURIComponent(parts.repo)}`,
        auth.token,
      );
      return repo.full_name ? mapRepo(repo) : undefined;
    } catch (e) {
      if (e instanceof GitHubApiError && e.status === 404) return undefined;
      throw e;
    }
  }

  private async startOAuth(): Promise<GitHubStatus> {
    if (!this.clientId) {
      throw new GitHubApiError(
        "Browser login needs a GitHub OAuth App on this host. Create one with Device Flow enabled, then set PRIME_POCKET_GITHUB_CLIENT_ID (or --github-client-id).",
        400,
        "github_oauth_unconfigured",
      );
    }
    this.cancelOAuth();
    const device = await this.requestDeviceCode();
    const generation = ++this.oauthGeneration;
    this.pending = {
      deviceCode: device.device_code,
      userCode: device.user_code,
      verificationUri: device.verification_uri,
      expiresAtMs: Date.now() + device.expires_in * 1000,
      intervalSec: Math.max(1, device.interval || 5),
      generation,
    };
    this.schedulePoll(this.pending.intervalSec * 1000, generation);
    return this.status();
  }

  private cancelOAuth(): void {
    this.oauthGeneration += 1;
    this.pollHandle?.clear();
    this.pollHandle = undefined;
    this.pending = undefined;
  }

  private schedulePoll(delayMs: number, generation: number): void {
    this.pollHandle?.clear();
    this.pollHandle = this.schedule(() => this.pollOAuth(generation), delayMs);
  }

  private async pollOAuth(generation: number): Promise<void> {
    const pending = this.pending;
    if (!pending || pending.generation !== generation || !this.clientId) return;
    if (Date.now() >= pending.expiresAtMs) {
      this.pending = undefined;
      this.pollHandle = undefined;
      return;
    }

    let body: DeviceTokenResponse;
    try {
      body = await this.postLoginForm<DeviceTokenResponse>("/login/oauth/access_token", {
        client_id: this.clientId,
        device_code: pending.deviceCode,
        grant_type: "urn:ietf:params:oauth:grant-type:device_code",
      });
    } catch {
      // Transient network blip — keep waiting until expiry.
      this.schedulePoll(pending.intervalSec * 1000, generation);
      return;
    }

    if (pending.generation !== this.oauthGeneration || this.pending?.generation !== generation) {
      return;
    }

    if (body.access_token) {
      const token = body.access_token;
      this.pending = undefined;
      this.pollHandle = undefined;
      try {
        const user = await this.gh<{ login?: string }>("/user", token);
        const login = user.login ?? "github";
        this.auth = { token, login, mode: "oauth" };
        this.setToken?.({ token, login, mode: "oauth" });
      } catch (e) {
        // Token arrived but /user failed — still store the token; login fills in later.
        if (e instanceof GitHubApiError && e.code === "github_token_invalid") {
          return;
        }
        this.auth = { token, mode: "oauth" };
        this.setToken?.({ token, login: "github", mode: "oauth" });
        void this.refreshLogin();
      }
      return;
    }

    const error = body.error ?? "";
    if (error === "authorization_pending") {
      this.schedulePoll(pending.intervalSec * 1000, generation);
      return;
    }
    if (error === "slow_down") {
      const next = Math.max(pending.intervalSec, body.interval ?? pending.intervalSec) + 5;
      pending.intervalSec = next;
      this.schedulePoll(next * 1000, generation);
      return;
    }
    if (error === "expired_token" || error === "access_denied" || error === "incorrect_device_code") {
      this.pending = undefined;
      this.pollHandle = undefined;
      return;
    }
    // Unknown error — stop pending so the phone can restart.
    this.pending = undefined;
    this.pollHandle = undefined;
  }

  private async requestDeviceCode(): Promise<DeviceCodeResponse> {
    if (!this.clientId) {
      throw new GitHubApiError(
        "Browser login needs a GitHub OAuth App client id on this host.",
        400,
        "github_oauth_unconfigured",
      );
    }
    const body = await this.postLoginForm<DeviceCodeResponse & { error?: string; error_description?: string }>(
      "/login/device/code",
      {
        client_id: this.clientId,
        scope: OAUTH_SCOPES,
      },
    );
    if (!body.device_code || !body.user_code || !body.verification_uri) {
      throw new GitHubApiError(
        body.error_description ||
          body.error ||
          "GitHub did not return a device code. Enable Device Flow on the OAuth App.",
        400,
        "github_oauth_start_failed",
      );
    }
    return {
      device_code: body.device_code,
      user_code: body.user_code,
      verification_uri: body.verification_uri,
      expires_in: body.expires_in || 900,
      interval: body.interval || 5,
    };
  }

  private async postLoginForm<T>(path: string, fields: Record<string, string>): Promise<T> {
    const url = `${this.loginBase}${path}`;
    const body = new URLSearchParams(fields).toString();
    let res: Awaited<ReturnType<typeof fetch>>;
    try {
      res = await this.fetchImpl(url, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": GITHUB_USER_AGENT,
        },
        body,
      });
    } catch (e) {
      throw new GitHubApiError(
        `Cannot reach github.com from this host: ${e instanceof Error ? e.message : String(e)}`,
        503,
        "github_unreachable",
      );
    }
    if (!res.ok) {
      let detail: string | undefined;
      try {
        const json = (await res.json()) as { error_description?: string; error?: string; message?: string };
        detail = json.error_description || json.error || json.message;
      } catch {
        detail = undefined;
      }
      throw new GitHubApiError(
        detail ? `GitHub OAuth ${res.status}: ${detail}` : `GitHub OAuth error ${res.status}`,
        res.status,
        "github_oauth_start_failed",
      );
    }
    return (await res.json()) as T;
  }

  private async gh<T>(
    path: string,
    token: string,
    query?: Record<string, string | number>,
  ): Promise<T> {
    const url = new URL(`${this.apiBase}${path}`);
    for (const [key, value] of Object.entries(query ?? {})) {
      url.searchParams.set(key, String(value));
    }
    let res: Awaited<ReturnType<typeof fetch>>;
    try {
      res = await this.fetchImpl(url.toString(), {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          "User-Agent": GITHUB_USER_AGENT,
        },
      });
    } catch (e) {
      throw new GitHubApiError(
        `Cannot reach api.github.com from this host: ${e instanceof Error ? e.message : String(e)}`,
        503,
        "github_unreachable",
      );
    }
    if (res.status === 401) {
      throw new GitHubApiError(
        "GitHub rejected this token. Create a new personal access token with repo access and connect again.",
        401,
        "github_token_invalid",
      );
    }
    if (res.status === 403 || res.status === 429) {
      const detail = await githubMessage(res);
      throw new GitHubApiError(
        detail ?? "GitHub refused the request (rate limit, or the token is missing repo access).",
        res.status,
        "github_forbidden",
      );
    }
    if (res.status === 404) {
      throw new GitHubApiError(
        "Not found on GitHub, or this token cannot see it.",
        404,
        "github_not_found",
      );
    }
    if (!res.ok) {
      const detail = await githubMessage(res);
      throw new GitHubApiError(
        detail ? `GitHub API ${res.status}: ${detail}` : `GitHub API error ${res.status}`,
        res.status,
      );
    }
    return (await res.json()) as T;
  }
}

async function githubMessage(res: { json: () => Promise<unknown> }): Promise<string | undefined> {
  try {
    const body = (await res.json()) as { message?: string };
    return body.message?.trim() || undefined;
  } catch {
    return undefined;
  }
}

/** Token from the host environment, used when nothing is persisted yet. */
export function githubTokenFromEnv(env = process.env): string | undefined {
  return env.PRIME_POCKET_GITHUB_TOKEN?.trim() || env.GITHUB_TOKEN?.trim() || undefined;
}

/** Public OAuth App client id (device flow). Not a secret. */
export function githubOAuthClientIdFromEnv(env = process.env): string | undefined {
  return env.PRIME_POCKET_GITHUB_CLIENT_ID?.trim() || env.GITHUB_CLIENT_ID?.trim() || undefined;
}

export function createGitHubProvider(opts: {
  mock: boolean;
  /** Persisted live token, if the host already connected once. */
  getToken?: () => { token: string; login?: string; mode?: AuthMode } | undefined;
  setToken?: (auth: { token: string; login: string; mode: AuthMode } | null) => void;
  clientId?: string;
}): GitHubProvider {
  // PRIME_POCKET_GITHUB_MOCK=0 keeps live GitHub on a host that fell back to the demo backend.
  const forced = process.env.PRIME_POCKET_GITHUB_MOCK;
  if (forced === "1" || (opts.mock && forced !== "0")) {
    return new MockGitHubProvider();
  }
  const persisted = opts.getToken?.();
  const provider = new TokenGitHubProvider({
    token: persisted?.token ?? githubTokenFromEnv(),
    login: persisted?.login,
    mode: persisted?.mode,
    setToken: opts.setToken,
    clientId: opts.clientId ?? githubOAuthClientIdFromEnv(),
    apiBase: process.env.PRIME_POCKET_GITHUB_API?.trim() || undefined,
    loginBase: process.env.PRIME_POCKET_GITHUB_LOGIN?.trim() || undefined,
  });
  // A token from disk/env has no login yet; fetch it without blocking startup.
  void provider.refreshLogin();
  return provider;
}
