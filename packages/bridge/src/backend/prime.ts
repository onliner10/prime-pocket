import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { createConnection, type Socket } from "node:net";
import { randomUUID } from "node:crypto";
import {
  initialCursor,
  nextCursor,
  type AgentEvent,
  type AgentId,
  type AgentSnapshot,
  type AgentStatus,
  type AgentSummary,
  type ArtifactMeta,
  type EventCursor,
  type HostCapabilities,
  type HostId,
  type LaunchAgentRequest,
  type MessageRole,
  type PromptRequest,
  type TranscriptMessage,
} from "@prime-pocket/protocol";
import type { AgentBackend, AgentEventListener } from "./types.js";
import { DemoBackend } from "./demo.js";

const DAEMON_PROTOCOL_NAME = "prime-agent.daemon";
const DAEMON_PROTOCOL_VERSION = 7;

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

type DaemonSessionRow = {
  activeSessionId?: string;
  id?: string;
  sessionName?: string;
  name?: string;
  cwd?: string;
  model?: { id?: string; name?: string } | string;
  activity?: string;
  lifecycle?: string;
  isStreaming?: boolean;
  isSessionActive?: boolean;
  isBashRunning?: boolean;
  isRunningTools?: boolean;
  hasRunningRlmChildren?: boolean;
  created?: string;
  modified?: string;
  lastActivityAt?: string;
  messageCount?: number;
};

type DaemonContentPart = {
  type?: string;
  text?: string;
  thinking?: string;
};

type DaemonMessage = {
  role?: string;
  content?: DaemonContentPart[] | string;
  timestamp?: number;
  id?: string;
};

type DaemonOutbound = {
  type?: string;
  id?: string;
  success?: boolean;
  error?: string;
  message?: string;
  command?: string;
  data?: unknown;
  activeSessionId?: string;
  event?: {
    type?: string;
    message?: DaemonMessage;
    messages?: DaemonMessage[];
  };
  meta?: {
    sequence?: number;
    cursor?: { generation?: string | number; sequence?: number };
  };
};

function messageText(message: DaemonMessage | undefined): string {
  if (!message) return "";
  const content = message.content;
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((part) => part?.type === "text" && typeof part.text === "string")
    .map((part) => part.text!)
    .join("");
}

function mapRole(role: string | undefined): MessageRole {
  if (role === "assistant" || role === "system" || role === "tool" || role === "user") return role;
  return "assistant";
}

function mapStatus(row: DaemonSessionRow): AgentStatus {
  // Prefer live execution signals. Fresh daemon "draft" sessions often report
  // activity=working with zero messages and no streaming — that is not Working.
  const activelyExecuting =
    Boolean(row.isStreaming) ||
    Boolean(row.isBashRunning) ||
    Boolean(row.isRunningTools) ||
    Boolean(row.hasRunningRlmChildren);
  if (activelyExecuting) return "running";
  if (row.activity === "working") {
    const hasWork =
      Boolean(row.isSessionActive) ||
      (typeof row.messageCount === "number" && row.messageCount > 0) ||
      (row.lifecycle !== undefined && row.lifecycle !== "draft");
    if (hasWork) return "running";
  }
  if (row.activity === "needs_input" || row.activity === "waiting") return "needs_input";
  if (row.activity === "error" || row.activity === "failed") return "error";
  if (row.activity === "stopped") return "stopped";
  return "idle";
}

function modelLabel(model: DaemonSessionRow["model"]): string | undefined {
  if (!model) return undefined;
  if (typeof model === "string") return model;
  return model.name ?? model.id;
}

/**
 * Minimal protocol-7 JSONL client. Prime Agent ≥0.7 rejects bare command objects
 * and requires versioned envelopes (`type:"command"` + `protocol.version >= 7`).
 */
class Protocol7Client {
  private socket: Socket | null = null;
  private buffer = "";
  private readonly clientId = `pocket-bridge:${randomUUID()}`;
  private reqSeq = 0;
  private readonly pending = new Map<
    string,
    { resolve: (v: DaemonOutbound) => void; reject: (e: Error) => void; timer: NodeJS.Timeout }
  >();
  private readonly messageListeners = new Set<(msg: DaemonOutbound) => void>();
  private hello: DaemonOutbound | null = null;
  private helloWaiters: Array<(h: DaemonOutbound) => void> = [];

  constructor(readonly socketPath: string) {}

  async connect(timeoutMs = 5000): Promise<void> {
    const socket = await new Promise<Socket>((resolve, reject) => {
      const s = createConnection(this.socketPath);
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
    this.socket = socket;
    socket.setEncoding("utf8");
    socket.on("data", (chunk: string) => this.onData(chunk));
    socket.on("close", () => {
      this.socket = null;
      this.rejectAll(new Error("Daemon socket closed"));
    });
    socket.on("error", () => {
      /* close handler rejects pending */
    });
    await this.waitForHello(timeoutMs);
  }

  get isConnected(): boolean {
    return Boolean(this.socket);
  }

  onMessage(listener: (msg: DaemonOutbound) => void): () => void {
    this.messageListeners.add(listener);
    return () => this.messageListeners.delete(listener);
  }

  async waitForHello(timeoutMs = 5000): Promise<DaemonOutbound> {
    if (this.hello) return this.hello;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.helloWaiters = this.helloWaiters.filter((w) => w !== onHello);
        reject(new Error("Timed out waiting for daemon_hello"));
      }, timeoutMs);
      const onHello = (h: DaemonOutbound) => {
        clearTimeout(timer);
        resolve(h);
      };
      this.helloWaiters.push(onHello);
    });
  }

  async request(command: Record<string, unknown>, timeoutMs = 15_000): Promise<DaemonOutbound> {
    if (!this.socket) throw new Error("Not connected to daemon");
    const id = `pocket_${++this.reqSeq}`;
    const envelope = {
      type: "command",
      id,
      protocol: { name: DAEMON_PROTOCOL_NAME, version: DAEMON_PROTOCOL_VERSION },
      clientId: this.clientId,
      command,
    };
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Daemon request timed out (${String(command.type)})`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.socket!.write(`${JSON.stringify(envelope)}\n`);
    });
  }

  close(): void {
    this.rejectAll(new Error("disposed"));
    this.socket?.destroy();
    this.socket = null;
  }

  private rejectAll(err: Error): void {
    for (const p of this.pending.values()) {
      clearTimeout(p.timer);
      p.reject(err);
    }
    this.pending.clear();
  }

  private onData(chunk: string): void {
    this.buffer += chunk;
    let idx: number;
    while ((idx = this.buffer.indexOf("\n")) >= 0) {
      const line = this.buffer.slice(0, idx).replace(/\r$/, "");
      this.buffer = this.buffer.slice(idx + 1);
      if (!line.trim()) continue;
      let msg: DaemonOutbound;
      try {
        msg = JSON.parse(line) as DaemonOutbound;
      } catch {
        continue;
      }
      this.handleMessage(msg);
    }
  }

  private handleMessage(msg: DaemonOutbound): void {
    if (msg.type === "daemon_hello") {
      this.hello = msg;
      for (const w of this.helloWaiters) w(msg);
      this.helloWaiters = [];
      return;
    }

    if (msg.type === "response" && typeof msg.id === "string" && this.pending.has(msg.id)) {
      const p = this.pending.get(msg.id)!;
      clearTimeout(p.timer);
      this.pending.delete(msg.id);
      if (msg.success === false || msg.error) {
        p.reject(new Error(String(msg.error ?? msg.message ?? "daemon error")));
      } else {
        p.resolve(msg);
      }
      return;
    }

    for (const listener of this.messageListeners) {
      try {
        listener(msg);
      } catch {
        // listener errors must not break the socket reader
      }
    }
  }
}

/**
 * Prime daemon backend using protocol 7 command envelopes.
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

  private readonly hostId: HostId;
  private readonly client: Protocol7Client;
  private readonly listeners = new Set<AgentEventListener>();
  private readonly attached = new Set<string>();
  private readonly genMap = new Map<string, number>();
  private nextGen = 1;
  private unsubMessages: (() => void) | null = null;
  /** Local cursor per agent for Pocket EventCursor (numeric generation). */
  private readonly cursors = new Map<string, EventCursor>();
  /**
   * Pocket clients append `message_delta.text`. Daemon `message_update` sends the
   * full accumulated body, so we keep per-message baselines and emit only the
   * suffix. Message ids must stay stable across update/end for a turn.
   */
  private readonly inflight = new Map<
    string,
    { messageId: string; role: MessageRole; text: string }
  >();
  private msgSeq = 0;

  private constructor(hostId: HostId, client: Protocol7Client) {
    this.hostId = hostId;
    this.client = client;
  }

  static async connect(hostId: HostId, socketPath?: string): Promise<PrimeDaemonBackend> {
    const path = socketPath ?? (await findDaemonSocket());
    if (!path) {
      throw new Error("Prime Agent daemon socket not found");
    }
    const client = new Protocol7Client(path);
    await client.connect();
    const backend = new PrimeDaemonBackend(hostId, client);
    backend.unsubMessages = client.onMessage((msg) => backend.onDaemonMessage(msg));
    return backend;
  }

  get path(): string {
    return this.client.socketPath;
  }

  private pocketCursor(agentId: string, daemonGen?: string | number, sequence?: number): EventCursor {
    let gen = this.cursors.get(agentId)?.generation ?? 1;
    if (daemonGen !== undefined && daemonGen !== null) {
      const key = String(daemonGen);
      let mapped = this.genMap.get(key);
      if (!mapped) {
        mapped = this.nextGen++;
        this.genMap.set(key, mapped);
      }
      gen = mapped;
    }
    const cursor: EventCursor = {
      generation: gen,
      sequence: typeof sequence === "number" ? sequence : (this.cursors.get(agentId)?.sequence ?? 0) + 1,
    };
    this.cursors.set(agentId, cursor);
    return cursor;
  }

  private bumpCursor(agentId: string): EventCursor {
    const prev = this.cursors.get(agentId) ?? initialCursor();
    const cursor = nextCursor(prev);
    this.cursors.set(agentId, cursor);
    return cursor;
  }

  private toSummary(row: DaemonSessionRow): AgentSummary {
    const id = String(row.activeSessionId ?? row.id ?? "");
    return {
      id,
      hostId: this.hostId,
      name: String(row.sessionName ?? row.name ?? id.slice(0, 8) ?? "agent"),
      status: mapStatus(row),
      cwd: row.cwd,
      model: modelLabel(row.model),
      updatedAt: String(row.modified ?? row.lastActivityAt ?? new Date().toISOString()),
      createdAt: String(row.created ?? row.lastActivityAt ?? new Date().toISOString()),
    };
  }

  private toTranscriptMessage(message: DaemonMessage, fallbackId: string): TranscriptMessage {
    const ts =
      typeof message.timestamp === "number"
        ? new Date(message.timestamp).toISOString()
        : new Date().toISOString();
    return {
      id: String(message.id ?? fallbackId),
      role: mapRole(message.role),
      text: messageText(message),
      createdAt: ts,
    };
  }

  private emit(agentId: AgentId, event: AgentEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(agentId, event);
      } catch {
        // ignore
      }
    }
  }

  private inflightKey(agentId: string, role: MessageRole): string {
    return `${agentId}:${role}`;
  }

  private ensureInflight(agentId: string, role: MessageRole, daemonMessageId?: string): string {
    const key = this.inflightKey(agentId, role);
    const existing = this.inflight.get(key);
    if (existing) return existing.messageId;
    const messageId = String(daemonMessageId ?? `msg_${agentId}_${role}_${++this.msgSeq}`);
    this.inflight.set(key, { messageId, role, text: "" });
    return messageId;
  }

  private onDaemonMessage(msg: DaemonOutbound): void {
    const agentId = typeof msg.activeSessionId === "string" ? msg.activeSessionId : undefined;
    if (!agentId) return;

    if (msg.type === "session_status") {
      const cursor = this.pocketCursor(
        agentId,
        msg.meta?.cursor?.generation,
        msg.meta?.cursor?.sequence ?? msg.meta?.sequence,
      );
      this.emit(agentId, { type: "status", status: "idle", cursor });
      return;
    }

    if (msg.type !== "session_event" || !msg.event) return;

    const cursor = this.pocketCursor(
      agentId,
      msg.meta?.cursor?.generation,
      msg.meta?.cursor?.sequence ?? msg.meta?.sequence,
    );
    const ev = msg.event;

    if (ev.type === "message_start" && ev.message) {
      const role = mapRole(ev.message.role);
      this.ensureInflight(agentId, role, ev.message.id);
      if (role === "assistant") {
        this.emit(agentId, { type: "status", status: "running", cursor });
      }
      return;
    }

    if (ev.type === "message_update" && ev.message) {
      const role = mapRole(ev.message.role);
      const text = messageText(ev.message);
      if (!text) return;
      const key = this.inflightKey(agentId, role);
      const messageId = this.ensureInflight(agentId, role, ev.message.id);
      const prev = this.inflight.get(key)?.text ?? "";
      let suffix = "";
      if (text.startsWith(prev)) {
        suffix = text.slice(prev.length);
      } else if (!prev.startsWith(text)) {
        // Non-monotonic update (rare): replace by sending full text as a fresh delta
        // after clients clear on message_done; for live view, skip to avoid duplication.
        suffix = "";
      }
      this.inflight.set(key, { messageId, role, text });
      if (!suffix) return;
      this.emit(agentId, {
        type: "message_delta",
        messageId,
        role,
        text: suffix,
        cursor,
      });
      return;
    }

    if (ev.type === "message_end" && ev.message) {
      const role = mapRole(ev.message.role);
      const key = this.inflightKey(agentId, role);
      const messageId = this.ensureInflight(agentId, role, ev.message.id);
      const text = messageText(ev.message);
      const createdAt =
        typeof ev.message.timestamp === "number"
          ? new Date(ev.message.timestamp).toISOString()
          : new Date().toISOString();
      this.inflight.delete(key);
      this.emit(agentId, {
        type: "message_done",
        message: {
          id: messageId,
          role,
          text,
          createdAt,
        },
        cursor,
      });
      return;
    }

    if (ev.type === "turn_start") {
      this.emit(agentId, { type: "status", status: "running", cursor });
      return;
    }

    if (ev.type === "turn_end" || ev.type === "agent_end") {
      // Drop any orphaned streaming baselines for this agent.
      for (const key of [...this.inflight.keys()]) {
        if (key.startsWith(`${agentId}:`)) this.inflight.delete(key);
      }
      this.emit(agentId, { type: "status", status: "idle", cursor });
    }
  }

  private async ensureAttached(agentId: AgentId): Promise<void> {
    if (this.attached.has(agentId)) return;
    await this.client.request({ type: "attach", activeSessionId: agentId }, 30_000);
    this.attached.add(agentId);
  }

  async listAgents(): Promise<AgentSummary[]> {
    try {
      const res = await this.client.request({ type: "list", includeClientOwned: true });
      const data = res.data as { sessions?: DaemonSessionRow[] } | undefined;
      const sessions = data?.sessions ?? [];
      return sessions
        .map((row) => this.toSummary(row))
        .filter((a) => Boolean(a.id));
    } catch {
      return [];
    }
  }

  async getSnapshot(agentId: AgentId): Promise<AgentSnapshot | undefined> {
    try {
      await this.ensureAttached(agentId);
      // Re-attach to refresh snapshot (attach is idempotent for same client).
      const res = await this.client.request(
        { type: "attach", activeSessionId: agentId },
        30_000,
      );
      this.attached.add(agentId);
      const data = res.data as {
        snapshot?: {
          summary?: DaemonSessionRow;
          messages?: DaemonMessage[];
          state?: { isStreaming?: boolean };
          lastEventCursor?: { generation?: string | number; sequence?: number };
          lastEventSequence?: number;
        };
      };
      const snapshot = data?.snapshot;
      if (!snapshot?.summary) {
        // Fall back to list row
        const agents = await this.listAgents();
        const agent = agents.find((a) => a.id === agentId);
        if (!agent) return undefined;
        return {
          agent,
          messages: [],
          artifacts: [],
          cursor: this.cursors.get(agentId) ?? initialCursor(),
          streaming: agent.status === "running",
        };
      }
      const agent = this.toSummary(snapshot.summary);
      const messages = (snapshot.messages ?? []).map((m, i) =>
        this.toTranscriptMessage(m, `${agentId}:msg:${i}`),
      );
      const cursor = this.pocketCursor(
        agentId,
        snapshot.lastEventCursor?.generation,
        snapshot.lastEventCursor?.sequence ?? snapshot.lastEventSequence,
      );
      return {
        agent,
        messages,
        artifacts: [],
        cursor,
        streaming: Boolean(snapshot.state?.isStreaming || snapshot.summary.isStreaming),
      };
    } catch {
      return undefined;
    }
  }

  async launch(req: LaunchAgentRequest): Promise<AgentSummary> {
    const baseName = req.name?.trim() || "agent";
    const attempts = [baseName, `${baseName} · ${randomUUID().slice(0, 6)}`];
    let row: DaemonSessionRow | undefined;
    let lastError: Error | undefined;
    for (const name of attempts) {
      const command: Record<string, unknown> = {
        type: "create",
        name,
        lifecycle: "resident",
      };
      if (req.cwd) {
        command.config = { cwd: req.cwd };
      }
      try {
        const res = await this.client.request(command, 30_000);
        row = res.data as DaemonSessionRow;
        lastError = undefined;
        break;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        const msg = lastError.message.toLowerCase();
        // Prime rejects duplicate display names under the same parent.
        if (!msg.includes("unavailable") && !msg.includes("already exists")) {
          throw lastError;
        }
      }
    }
    if (!row?.activeSessionId && !row?.id) {
      throw lastError ?? new Error("Daemon did not return an agent");
    }
    const summary = this.toSummary(row!);
    // Inbox composer launches with an initial prompt — match DemoBackend.
    if (req.prompt?.trim()) {
      await this.prompt(summary.id, { message: req.prompt.trim() });
    }
    return summary;
  }

  async prompt(agentId: AgentId, req: PromptRequest): Promise<void> {
    await this.ensureAttached(agentId);
    const command: Record<string, unknown> = {
      type: "prompt",
      activeSessionId: agentId,
      message: req.message,
    };
    if (req.streamingBehavior === "steer" || req.streamingBehavior === "followUp") {
      command.streamingBehavior = req.streamingBehavior;
    }
    // Images are not yet mapped into daemon ImageContent; capability is false.
    await this.client.request(command, 30_000);
    this.bumpCursor(agentId);
  }

  async steer(agentId: AgentId, message: string): Promise<void> {
    await this.ensureAttached(agentId);
    await this.client.request({ type: "steer", activeSessionId: agentId, message }, 30_000);
  }

  async followUp(
    agentId: AgentId,
    message: string,
    _images?: Array<{ mimeType: string; dataBase64: string; name?: string }>,
  ): Promise<void> {
    await this.ensureAttached(agentId);
    await this.client.request({ type: "follow_up", activeSessionId: agentId, message }, 30_000);
  }

  async cancel(agentId: AgentId): Promise<void> {
    await this.ensureAttached(agentId);
    await this.client.request({ type: "abort", activeSessionId: agentId }, 15_000);
  }

  async replyNeedsInput(agentId: AgentId, requestId: string, value: string | boolean): Promise<void> {
    await this.ensureAttached(agentId);
    await this.client.request(
      {
        type: "extension_ui_response",
        activeSessionId: agentId,
        requestId,
        response: value,
      },
      15_000,
    );
  }

  async readArtifact(): Promise<{ meta: ArtifactMeta; body: Buffer } | undefined> {
    return undefined;
  }

  onEvent(listener: AgentEventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async dispose(): Promise<void> {
    this.unsubMessages?.();
    this.unsubMessages = null;
    this.client.close();
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
      const prime = await PrimeDaemonBackend.connect(opts.hostId, opts.daemonSocket);
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
