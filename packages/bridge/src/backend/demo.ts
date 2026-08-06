import { randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import {
  bumpGeneration,
  initialCursor,
  nextCursor,
  type AgentEvent,
  type AgentId,
  type AgentSnapshot,
  type AgentSummary,
  type ArtifactMeta,
  type HostCapabilities,
  type HostId,
  type LaunchAgentRequest,
  type PromptRequest,
  type TranscriptMessage,
} from "@prime-pocket/protocol";
import type { AgentBackend, AgentEventListener, MutableAgentState } from "./types.js";

function nowIso(): string {
  return new Date().toISOString();
}

function id(prefix: string): string {
  return `${prefix}_${randomBytes(6).toString("hex")}`;
}

/**
 * In-process demo backend so Pocket works without a live Prime daemon.
 * Simulates streaming replies and optional needs_input / artifacts.
 */
export class DemoBackend implements AgentBackend {
  readonly capabilities: HostCapabilities = {
    prompt: true,
    steer: true,
    followUp: true,
    cancel: true,
    artifacts: true,
    launch: true,
    demoMode: true,
  };

  private readonly hostId: HostId;
  private readonly artifactRoot: string;
  private readonly agents = new Map<AgentId, MutableAgentState>();
  private readonly listeners = new Set<AgentEventListener>();
  private readonly timers = new Set<NodeJS.Timeout>();

  constructor(hostId: HostId, artifactRoot: string) {
    this.hostId = hostId;
    this.artifactRoot = artifactRoot;
    this.seedDemoAgent();
  }

  private seedDemoAgent(): void {
    const agentId = id("agent");
    const createdAt = nowIso();
    const state: MutableAgentState = {
      summary: {
        id: agentId,
        hostId: this.hostId,
        name: "demo-welcome",
        status: "idle",
        cwd: process.cwd(),
        model: "demo",
        preview: "Ready for a prompt from your phone.",
        createdAt,
        updatedAt: createdAt,
      },
      messages: [
        {
          id: id("msg"),
          role: "system",
          text: "Demo mode: this bridge is not attached to a live Prime Agent daemon. Prompts get simulated replies.",
          createdAt,
        },
      ],
      artifacts: [],
      cursor: initialCursor(),
      streaming: false,
    };
    this.agents.set(agentId, state);
  }

  private emit(agentId: AgentId, event: AgentEvent): void {
    for (const l of this.listeners) l(agentId, event);
  }

  private require(agentId: AgentId): MutableAgentState {
    const state = this.agents.get(agentId);
    if (!state) throw new Error(`Agent not found: ${agentId}`);
    return state;
  }

  private advance(state: MutableAgentState): void {
    state.cursor = nextCursor(state.cursor);
    state.summary.updatedAt = nowIso();
  }

  listAgents(): Promise<AgentSummary[]> {
    return Promise.resolve([...this.agents.values()].map((a) => ({ ...a.summary })));
  }

  getSnapshot(agentId: AgentId): Promise<AgentSnapshot | undefined> {
    const state = this.agents.get(agentId);
    if (!state) return Promise.resolve(undefined);
    return Promise.resolve({
      agent: { ...state.summary },
      messages: state.messages.map((m) => ({ ...m })),
      artifacts: state.artifacts.map((a) => ({ ...a })),
      cursor: { ...state.cursor },
      streaming: state.streaming,
    });
  }

  async launch(req: LaunchAgentRequest): Promise<AgentSummary> {
    const agentId = req.resumeId && this.agents.has(req.resumeId) ? req.resumeId : id("agent");
    const createdAt = nowIso();
    if (!this.agents.has(agentId)) {
      const state: MutableAgentState = {
        summary: {
          id: agentId,
          hostId: this.hostId,
          name: req.name ?? `agent-${agentId.slice(-4)}`,
          status: "idle",
          cwd: req.cwd ?? process.cwd(),
          model: req.model ?? "demo",
          preview: req.prompt?.slice(0, 80),
          createdAt,
          updatedAt: createdAt,
        },
        messages: [],
        artifacts: [],
        cursor: initialCursor(),
        streaming: false,
      };
      this.agents.set(agentId, state);
    }
    if (req.prompt) {
      await this.prompt(agentId, { message: req.prompt });
    }
    return { ...this.require(agentId).summary };
  }

  async prompt(agentId: AgentId, req: PromptRequest): Promise<void> {
    const state = this.require(agentId);
    if (state.streaming) {
      if (req.streamingBehavior === "steer") return this.steer(agentId, req.message);
      if (req.streamingBehavior === "followUp") return this.followUp(agentId, req.message);
      throw new Error("Agent is streaming; pass streamingBehavior steer|followUp");
    }
    this.pushUser(state, agentId, req.message);
    this.simulateReply(agentId, req.message);
  }

  async steer(agentId: AgentId, message: string): Promise<void> {
    const state = this.require(agentId);
    this.pushUser(state, agentId, `[steer] ${message}`);
    if (!state.streaming) this.simulateReply(agentId, message);
  }

  async followUp(agentId: AgentId, message: string): Promise<void> {
    const state = this.require(agentId);
    this.pushUser(state, agentId, `[follow-up] ${message}`);
    if (!state.streaming) this.simulateReply(agentId, message);
  }

  async cancel(agentId: AgentId): Promise<void> {
    const state = this.require(agentId);
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
    state.streaming = false;
    state.summary.status = "idle";
    this.advance(state);
    this.emit(agentId, { type: "status", status: "idle", cursor: { ...state.cursor } });
  }

  async replyNeedsInput(agentId: AgentId, requestId: string, value: string | boolean): Promise<void> {
    const state = this.require(agentId);
    if (!state.pendingInput || state.pendingInput.requestId !== requestId) {
      throw new Error("No matching needs_input request");
    }
    state.pendingInput = undefined;
    const text = typeof value === "boolean" ? (value ? "yes" : "no") : value;
    this.pushUser(state, agentId, text);
    state.summary.status = "running";
    this.advance(state);
    this.emit(agentId, { type: "status", status: "running", cursor: { ...state.cursor } });
    this.simulateReply(agentId, `Thanks, continuing with: ${text}`);
  }

  async readArtifact(
    agentId: AgentId,
    artifactId: string,
  ): Promise<{ meta: ArtifactMeta; body: Buffer } | undefined> {
    const state = this.agents.get(agentId);
    if (!state) return undefined;
    const meta = state.artifacts.find((a) => a.id === artifactId);
    if (!meta) return undefined;
    const path = `${this.artifactRoot}/${agentId}/${artifactId}`;
    if (!existsSync(path)) return undefined;
    return { meta, body: readFileSync(path) };
  }

  onEvent(listener: AgentEventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async dispose(): Promise<void> {
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
    this.listeners.clear();
  }

  private pushUser(state: MutableAgentState, agentId: AgentId, message: string): void {
    const msg: TranscriptMessage = {
      id: id("msg"),
      role: "user",
      text: message,
      createdAt: nowIso(),
    };
    state.messages.push(msg);
    state.summary.preview = message.slice(0, 80);
    state.summary.status = "running";
    this.advance(state);
    this.emit(agentId, { type: "message_done", message: msg, cursor: { ...state.cursor } });
    this.emit(agentId, { type: "status", status: "running", cursor: { ...state.cursor } });
  }

  private simulateReply(agentId: AgentId, userMessage: string): void {
    const state = this.require(agentId);
    state.streaming = true;
    const messageId = id("msg");
    const chunks = this.planReply(userMessage);
    let i = 0;

    const tick = () => {
      const current = this.agents.get(agentId);
      if (!current || !current.streaming) return;
      if (i < chunks.length) {
        const text = chunks[i++]!;
        this.advance(current);
        this.emit(agentId, {
          type: "message_delta",
          messageId,
          role: "assistant",
          text,
          cursor: { ...current.cursor },
        });
        const t = setTimeout(tick, 120);
        this.timers.add(t);
        return;
      }
      const full = chunks.join("");
      const message: TranscriptMessage = {
        id: messageId,
        role: "assistant",
        text: full,
        createdAt: nowIso(),
      };
      current.messages.push(message);
      current.streaming = false;
      current.summary.preview = full.slice(0, 80);
      current.summary.status = "idle";
      this.advance(current);
      this.emit(agentId, { type: "message_done", message, cursor: { ...current.cursor } });
      this.emit(agentId, { type: "status", status: "idle", cursor: { ...current.cursor } });

      if (/confirm|approve|permission/i.test(userMessage)) {
        this.requestInput(agentId, "Approve the proposed change?");
      } else if (/artifact|screenshot|log/i.test(userMessage)) {
        this.addDemoArtifact(agentId);
      }
    };
    const t = setTimeout(tick, 80);
    this.timers.add(t);
  }

  private planReply(userMessage: string): string[] {
    const body =
      `Got it. (demo)\n\n` +
      `You said: ${userMessage}\n\n` +
      `In a live setup this would go through Prime Agent's daemon via AgentConnection.`;
    const parts: string[] = [];
    for (let i = 0; i < body.length; i += 24) parts.push(body.slice(i, i + 24));
    return parts;
  }

  private requestInput(agentId: AgentId, prompt: string): void {
    const state = this.require(agentId);
    const requestId = id("need");
    state.pendingInput = { requestId, prompt };
    state.summary.status = "needs_input";
    this.advance(state);
    this.emit(agentId, { type: "needs_input", prompt, requestId, cursor: { ...state.cursor } });
    this.emit(agentId, { type: "status", status: "needs_input", cursor: { ...state.cursor } });
  }

  private addDemoArtifact(agentId: AgentId): void {
    const state = this.require(agentId);
    const artifactId = id("art");
    const body = Buffer.from(
      `# Demo artifact\n\nGenerated at ${nowIso()} for agent ${agentId}\n`,
      "utf8",
    );
    const dir = `${this.artifactRoot}/${agentId}`;
    mkdirSync(dir, { recursive: true });
    const path = `${dir}/${artifactId}`;
    writeFileSync(path, body);
    const meta: ArtifactMeta = {
      id: artifactId,
      name: "demo-notes.md",
      mimeType: "text/markdown",
      sizeBytes: body.length,
      createdAt: nowIso(),
    };
    state.artifacts.push(meta);
    this.advance(state);
    this.emit(agentId, { type: "artifact", artifact: meta, cursor: { ...state.cursor } });
  }

  /** Used by tests / reconnect simulation. */
  resync(agentId: AgentId): void {
    const state = this.require(agentId);
    state.cursor = bumpGeneration(state.cursor);
    void this.getSnapshot(agentId).then((snapshot) => {
      if (snapshot) this.emit(agentId, { type: "resync", snapshot });
    });
  }
}
