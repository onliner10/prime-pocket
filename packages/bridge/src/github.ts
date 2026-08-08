/**
 * GitHub catalog for Pocket workspaces.
 * Demo/e2e use a mock catalog (no credentials). Live token/OAuth can replace the provider later.
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

/** Placeholder for a future real GitHub token/OAuth provider. */
export class DisconnectedGitHubProvider implements GitHubProvider {
  status(): GitHubStatus {
    return { connected: false, mode: "disconnected", mock: false, mockAvailable: false };
  }

  async connect(): Promise<GitHubStatus> {
    throw new Error(
      "GitHub is not configured on this host. Start the bridge with --demo (mock) or configure a GitHub token.",
    );
  }

  async disconnect(): Promise<GitHubStatus> {
    return this.status();
  }

  async listRepos(): Promise<GitHubCatalogRepo[]> {
    return [];
  }

  async listBranches(): Promise<GitHubBranch[]> {
    return [];
  }

  async findRepo(): Promise<GitHubCatalogRepo | undefined> {
    return undefined;
  }
}

export function createGitHubProvider(opts: { mock: boolean }): GitHubProvider {
  if (opts.mock || process.env.PRIME_POCKET_GITHUB_MOCK === "1") {
    return new MockGitHubProvider();
  }
  return new DisconnectedGitHubProvider();
}
