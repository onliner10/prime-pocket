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
const GITHUB_USER_AGENT = "prime-pocket";
/** `/user/repos` pages to walk before falling back to an exact lookup. */
const REPO_PAGES = 3;
const PER_PAGE = 100;

/** Failure talking to api.github.com, carrying a code the bridge can map to a response. */
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
  /** Persist a validated token, or clear it on disconnect. */
  setToken?: (auth: { token: string; login: string } | null) => void;
  /** Injected in tests; defaults to global fetch. */
  fetchImpl?: typeof fetch;
  apiBase?: string;
}

/**
 * Live GitHub via a personal access token held by this host.
 * Starts disconnected until a token arrives from the store, host env, or a connect call.
 */
export class TokenGitHubProvider implements GitHubProvider {
  private auth: { token: string; login?: string } | undefined;
  private readonly setToken?: (auth: { token: string; login: string } | null) => void;
  private readonly fetchImpl: typeof fetch;
  private readonly apiBase: string;

  constructor(opts: TokenGitHubProviderOptions = {}) {
    const token = opts.token?.trim();
    this.auth = token ? { token, login: opts.login } : undefined;
    this.setToken = opts.setToken;
    this.fetchImpl = opts.fetchImpl ?? ((input, init) => fetch(input, init));
    this.apiBase = (opts.apiBase ?? GITHUB_API_BASE).replace(/\/$/, "");
  }

  status(): GitHubStatus {
    return {
      connected: Boolean(this.auth),
      mode: this.auth ? "token" : "disconnected",
      mock: false,
      mockAvailable: false,
      login: this.auth?.login,
    };
  }

  async connect(opts?: GitHubConnectRequest): Promise<GitHubStatus> {
    const mode = opts?.mode ?? "token";
    if (mode === "mock") {
      throw new GitHubApiError(
        "This host does not serve mock GitHub. Restart the bridge with --demo for mock mode.",
        400,
        "github_mock_unavailable",
      );
    }
    if (mode === "oauth") {
      throw new GitHubApiError(
        "Browser OAuth is not available on this host. Paste a personal access token instead.",
        400,
        "github_oauth_unavailable",
      );
    }
    const token = opts?.token?.trim();
    if (!token) {
      throw new GitHubApiError(
        "A GitHub personal access token is required (classic: repo scope; fine-grained: read access to contents and metadata).",
        400,
        "github_token_required",
      );
    }
    const user = await this.gh<{ login?: string }>("/user", token);
    const login = user.login ?? "github";
    this.auth = { token, login };
    this.setToken?.({ token, login });
    return this.status();
  }

  async disconnect(): Promise<GitHubStatus> {
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
        this.auth = { token: auth.token, login: user.login ?? "github" };
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

export function createGitHubProvider(opts: {
  mock: boolean;
  /** Persisted live token, if the host already connected once. */
  getToken?: () => { token: string; login?: string } | undefined;
  setToken?: (auth: { token: string; login: string } | null) => void;
}): GitHubProvider {
  if (opts.mock || process.env.PRIME_POCKET_GITHUB_MOCK === "1") {
    return new MockGitHubProvider();
  }
  const persisted = opts.getToken?.();
  const provider = new TokenGitHubProvider({
    token: persisted?.token ?? githubTokenFromEnv(),
    login: persisted?.login,
    setToken: opts.setToken,
  });
  // A token from disk/env has no login yet; fetch it without blocking startup.
  void provider.refreshLogin();
  return provider;
}
