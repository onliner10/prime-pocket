import {
  Routes,
  type AgentSnapshot,
  type AgentSummary,
  type FollowUpRequest,
  type HostInfo,
  type LaunchAgentRequest,
  type NeedsInputReply,
  type PairRequest,
  type PairResponse,
  type PairedHost,
  type PromptRequest,
  type SteerRequest,
  type StreamServerMessage,
} from "@prime-pocket/protocol";

export class PocketApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = "PocketApiError";
  }
}

async function parseJson<T>(res: Response): Promise<T> {
  const body = (await res.json().catch(() => ({}))) as { error?: string; code?: string };
  if (!res.ok) {
    throw new PocketApiError(body.error ?? res.statusText, res.status, body.code);
  }
  return body as T;
}

function authHeaders(token: string): HeadersInit {
  return {
    authorization: `Bearer ${token}`,
    "content-type": "application/json",
  };
}

/** Try each advertised URL until one responds. */
export async function resolveReachableBaseUrl(
  urls: string[],
  opts?: { timeoutMs?: number },
): Promise<string> {
  const timeoutMs = opts?.timeoutMs ?? 2500;
  const errors: string[] = [];
  for (const url of urls) {
    const base = url.replace(/\/$/, "");
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), timeoutMs);
      const res = await fetch(`${base}/health`, { signal: ctrl.signal });
      clearTimeout(t);
      if (res.ok) return base;
      errors.push(`${base}: ${res.status}`);
    } catch (e) {
      errors.push(`${base}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  throw new Error(`No reachable bridge URL. Tried:\n${errors.join("\n")}`);
}

export async function pairWithHost(
  baseUrl: string,
  req: PairRequest,
  opts?: { fingerprint?: string },
): Promise<PairResponse> {
  const res = await fetch(`${baseUrl.replace(/\/$/, "")}${Routes.pair}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(req),
  });
  const data = await parseJson<PairResponse>(res);
  if (opts?.fingerprint && data.host.fingerprint !== opts.fingerprint) {
    throw new Error("TLS fingerprint mismatch — aborting pair");
  }
  return data;
}

export class PocketHostClient {
  constructor(readonly host: PairedHost) {}

  private url(path: string): string {
    return `${this.host.baseUrl.replace(/\/$/, "")}${path}`;
  }

  async getHost(): Promise<HostInfo> {
    const res = await fetch(this.url(Routes.host), { headers: authHeaders(this.host.token) });
    return parseJson(res);
  }

  async listAgents(): Promise<AgentSummary[]> {
    const res = await fetch(this.url(Routes.agents), { headers: authHeaders(this.host.token) });
    const data = await parseJson<{ agents: AgentSummary[] }>(res);
    return data.agents;
  }

  async launch(req: LaunchAgentRequest): Promise<AgentSummary> {
    const res = await fetch(this.url(Routes.agents), {
      method: "POST",
      headers: authHeaders(this.host.token),
      body: JSON.stringify(req),
    });
    const data = await parseJson<{ agent: AgentSummary }>(res);
    return data.agent;
  }

  async getSnapshot(agentId: string): Promise<AgentSnapshot> {
    const res = await fetch(this.url(Routes.agent(agentId)), {
      headers: authHeaders(this.host.token),
    });
    return parseJson(res);
  }

  async prompt(agentId: string, req: PromptRequest): Promise<void> {
    const res = await fetch(this.url(Routes.agentPrompt(agentId)), {
      method: "POST",
      headers: authHeaders(this.host.token),
      body: JSON.stringify(req),
    });
    await parseJson(res);
  }

  async steer(agentId: string, req: SteerRequest): Promise<void> {
    const res = await fetch(this.url(Routes.agentSteer(agentId)), {
      method: "POST",
      headers: authHeaders(this.host.token),
      body: JSON.stringify(req),
    });
    await parseJson(res);
  }

  async followUp(agentId: string, req: FollowUpRequest): Promise<void> {
    const res = await fetch(this.url(Routes.agentFollowUp(agentId)), {
      method: "POST",
      headers: authHeaders(this.host.token),
      body: JSON.stringify(req),
    });
    await parseJson(res);
  }

  async cancel(agentId: string): Promise<void> {
    const res = await fetch(this.url(Routes.agentCancel(agentId)), {
      method: "POST",
      headers: authHeaders(this.host.token),
    });
    await parseJson(res);
  }

  async replyNeedsInput(agentId: string, req: NeedsInputReply): Promise<void> {
    const res = await fetch(this.url(Routes.agentNeedsInput(agentId)), {
      method: "POST",
      headers: authHeaders(this.host.token),
      body: JSON.stringify(req),
    });
    await parseJson(res);
  }

  artifactUrl(agentId: string, artifactId: string): string {
    return this.url(Routes.agentArtifact(agentId, artifactId));
  }

  /**
   * Open a live event stream. Uses ws/wss derived from the HTTP base URL.
   * Token is passed as a query param because RN WebSocket cannot set headers reliably.
   */
  openAgentStream(
    agentId: string,
    handlers: {
      onMessage: (msg: StreamServerMessage) => void;
      onError?: (err: Event) => void;
      onClose?: () => void;
    },
  ): { close: () => void } {
    const http = this.host.baseUrl.replace(/\/$/, "");
    const wsBase = http.replace(/^http/, "ws");
    const url = `${wsBase}${Routes.agentStream(agentId)}?token=${encodeURIComponent(this.host.token)}`;
    const ws = new WebSocket(url);
    ws.onmessage = (ev) => {
      try {
        handlers.onMessage(JSON.parse(String(ev.data)) as StreamServerMessage);
      } catch {
        // ignore
      }
    };
    ws.onerror = (e) => handlers.onError?.(e as unknown as Event);
    ws.onclose = () => handlers.onClose?.();
    return {
      close: () => {
        try {
          ws.close();
        } catch {
          // ignore
        }
      },
    };
  }
}

/** Aggregate agents across all paired hosts (client-side fleet). */
export async function listFleetAgents(
  hosts: PairedHost[],
): Promise<{ agents: AgentSummary[]; errors: Array<{ hostId: string; error: string }> }> {
  const agents: AgentSummary[] = [];
  const errors: Array<{ hostId: string; error: string }> = [];
  await Promise.all(
    hosts.map(async (host) => {
      try {
        const client = new PocketHostClient(host);
        const list = await client.listAgents();
        agents.push(...list);
      } catch (e) {
        errors.push({
          hostId: host.hostId,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }),
  );
  agents.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return { agents, errors };
}

/** Re-resolve a reachable base URL from the host's advertised list (Tailscale/LAN failover). */
export async function reconnectPairedHost(host: PairedHost): Promise<PairedHost> {
  const candidates = [...new Set([host.baseUrl, ...host.urls].filter(Boolean))];
  const baseUrl = await resolveReachableBaseUrl(candidates);
  const next: PairedHost = { ...host, baseUrl };
  const client = new PocketHostClient(next);
  const info = await client.getHost();
  return {
    ...next,
    urls: info.urls.length ? info.urls : next.urls,
    label: info.name || next.label,
    fingerprint: info.fingerprint || next.fingerprint,
  };
}
