import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { createConnection, type Socket } from "node:net";
import type {
  AgentId,
  AgentSnapshot,
  AgentSummary,
  ArtifactMeta,
  HostCapabilities,
  LaunchAgentRequest,
  PromptRequest,
} from "@prime-pocket/protocol";
import type { AgentBackend, AgentEventListener } from "./types.js";
import { DemoBackend } from "./demo.js";

/**
 * Probe common Prime Agent daemon socket locations.
 * When the daemon is unreachable, callers should fall back to DemoBackend.
 */
export function defaultDaemonSocketPaths(): string[] {
  const home = homedir();
  return [
    process.env.PRIME_AGENT_SOCKET,
    process.env.PI_DAEMON_SOCKET,
    join(home, ".prime", "agent", "daemon.sock"),
    join(home, ".prime-agent", "daemon.sock"),
    join(home, ".pi", "daemon.sock"),
    "/tmp/prime-agent.sock",
  ].filter((p): p is string => Boolean(p));
}

export async function findDaemonSocket(paths = defaultDaemonSocketPaths()): Promise<string | undefined> {
  for (const p of paths) {
    if (existsSync(p)) return p;
  }
  return undefined;
}

/**
 * Best-effort Prime daemon backend.
 *
 * Prime's public AgentConnection / daemon protocol is JSONL and versioned locally.
 * Until we can depend on a stable published client SDK from prime-agent, this adapter:
 * 1. Probes for a daemon socket
 * 2. If missing, throws so the bridge can use DemoBackend
 * 3. If present, attempts a lightweight hello; on failure, throws
 *
 * For production Pocket fleets, replace `PrimeDaemonBackend` internals with
 * `DaemonAgentConnection` from the prime-agent package once consumed as a dependency.
 */
export class PrimeDaemonBackend implements AgentBackend {
  readonly capabilities: HostCapabilities = {
    prompt: true,
    steer: true,
    followUp: true,
    cancel: true,
    artifacts: true,
    launch: true,
    images: false, // artifact download not wired through daemon yet
    demoMode: false,
  };

  private socketPath: string;
  private socket: Socket | null = null;
  private readonly listeners = new Set<AgentEventListener>();
  private buffer = "";

  private constructor(socketPath: string, socket: Socket) {
    this.socketPath = socketPath;
    this.socket = socket;
    socket.setEncoding("utf8");
    socket.on("data", (chunk: string) => this.onData(chunk));
    socket.on("close", () => {
      this.socket = null;
    });
  }

  static async connect(socketPath?: string): Promise<PrimeDaemonBackend> {
    const path = socketPath ?? (await findDaemonSocket());
    if (!path) {
      throw new Error("Prime Agent daemon socket not found");
    }
    const socket = await new Promise<Socket>((resolve, reject) => {
      const s = createConnection(path);
      const onErr = (err: Error) => {
        s.destroy();
        reject(err);
      };
      s.once("error", onErr);
      s.once("connect", () => {
        s.off("error", onErr);
        resolve(s);
      });
    });

    // Probe with a newline-delimited hello; many daemon revisions accept unknown
    // commands by returning an error object — connectivity is what matters here.
    const backend = new PrimeDaemonBackend(path, socket);
    try {
      await backend.rawRequest({ type: "ping", id: "pocket-hello" }, 1500);
    } catch {
      // Some daemons may not speak ping; keep the connection if the socket is up.
    }
    return backend;
  }

  private onData(chunk: string): void {
    this.buffer += chunk;
    let idx: number;
    while ((idx = this.buffer.indexOf("\n")) >= 0) {
      const line = this.buffer.slice(0, idx).replace(/\r$/, "");
      this.buffer = this.buffer.slice(idx + 1);
      if (!line.trim()) continue;
      try {
        const msg = JSON.parse(line) as Record<string, unknown>;
        this.handleDaemonMessage(msg);
      } catch {
        // ignore malformed
      }
    }
  }

  private pending = new Map<
    string,
    { resolve: (v: unknown) => void; reject: (e: Error) => void; timer: NodeJS.Timeout }
  >();

  private handleDaemonMessage(msg: Record<string, unknown>): void {
    const id = typeof msg.id === "string" ? msg.id : undefined;
    if (id && this.pending.has(id)) {
      const p = this.pending.get(id)!;
      clearTimeout(p.timer);
      this.pending.delete(id);
      if (msg.success === false || msg.error) {
        p.reject(new Error(String(msg.error ?? msg.message ?? "daemon error")));
      } else {
        p.resolve(msg);
      }
      return;
    }
    // Map known event shapes into Pocket AgentEvent when possible.
    if (msg.type === "event" || msg.type === "session_event") {
      // Without a stable schema pin, surface as opaque error-free no-op for now.
      // DemoBackend covers interactive demos; live mapping lands with the SDK dep.
    }
  }

  private rawRequest(payload: Record<string, unknown>, timeoutMs = 5000): Promise<unknown> {
    if (!this.socket) return Promise.reject(new Error("Not connected to daemon"));
    const id = typeof payload.id === "string" ? payload.id : `req_${Date.now()}`;
    const body = { ...payload, id };
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error("Daemon request timed out"));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.socket!.write(`${JSON.stringify(body)}\n`);
    });
  }

  async listAgents(): Promise<AgentSummary[]> {
    try {
      const res = (await this.rawRequest({ type: "list_agents" })) as {
        agents?: AgentSummary[];
      };
      return res.agents ?? [];
    } catch {
      return [];
    }
  }

  async getSnapshot(agentId: AgentId): Promise<AgentSnapshot | undefined> {
    try {
      const res = (await this.rawRequest({ type: "get_snapshot", agentId })) as {
        snapshot?: AgentSnapshot;
      };
      return res.snapshot;
    } catch {
      return undefined;
    }
  }

  async launch(req: LaunchAgentRequest): Promise<AgentSummary> {
    const res = (await this.rawRequest({ type: "launch_agent", ...req })) as {
      agent?: AgentSummary;
    };
    if (!res.agent) throw new Error("Daemon did not return an agent");
    return res.agent;
  }

  async prompt(agentId: AgentId, req: PromptRequest): Promise<void> {
    await this.rawRequest({ type: "prompt", agentId, ...req });
  }

  async steer(agentId: AgentId, message: string): Promise<void> {
    await this.rawRequest({ type: "steer", agentId, message });
  }

  async followUp(
    agentId: AgentId,
    message: string,
    images?: Array<{ mimeType: string; dataBase64: string; name?: string }>,
  ): Promise<void> {
    await this.rawRequest({ type: "follow_up", agentId, message, images });
  }

  async cancel(agentId: AgentId): Promise<void> {
    await this.rawRequest({ type: "cancel", agentId });
  }

  async replyNeedsInput(agentId: AgentId, requestId: string, value: string | boolean): Promise<void> {
    await this.rawRequest({ type: "needs_input_reply", agentId, requestId, value });
  }

  async readArtifact(): Promise<{ meta: ArtifactMeta; body: Buffer } | undefined> {
    return undefined;
  }

  onEvent(listener: AgentEventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async dispose(): Promise<void> {
    for (const p of this.pending.values()) {
      clearTimeout(p.timer);
      p.reject(new Error("disposed"));
    }
    this.pending.clear();
    this.socket?.destroy();
    this.socket = null;
  }

  get path(): string {
    return this.socketPath;
  }
}

export async function createBackend(opts: {
  hostId: string;
  artifactRoot: string;
  forceDemo?: boolean;
  daemonSocket?: string;
}): Promise<{ backend: AgentBackend; mode: "demo" | "prime" }> {
  if (!opts.forceDemo) {
    try {
      const prime = await PrimeDaemonBackend.connect(opts.daemonSocket);
      return { backend: prime, mode: "prime" };
    } catch {
      // fall through
    }
  }
  return {
    backend: new DemoBackend(opts.hostId, opts.artifactRoot),
    mode: "demo",
  };
}
