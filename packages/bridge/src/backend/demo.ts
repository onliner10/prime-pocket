import { randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { deflateSync } from "node:zlib";
import {
  bumpGeneration,
  initialCursor,
  isImageMime,
  nextCursor,
  type AgentEvent,
  type AgentId,
  type AgentSnapshot,
  type AgentSummary,
  type ArtifactMeta,
  type HostCapabilities,
  type HostId,
  type LaunchAgentRequest,
  type MessageImage,
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

/** Solid-color PNG generator (no external deps) for demo screenshots. */
function demoPngBytes(width = 240, height = 140, rgb: [number, number, number] = [61, 220, 151]): Buffer {
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) {
    const row = y * (width * 3 + 1);
    raw[row] = 0;
    for (let x = 0; x < width; x++) {
      const i = row + 1 + x * 3;
      // Simple gradient so the image is visibly non-trivial
      raw[i] = Math.min(255, rgb[0] + Math.floor((x / width) * 40));
      raw[i + 1] = Math.min(255, rgb[1] - Math.floor((y / height) * 30));
      raw[i + 2] = rgb[2];
    }
  }
  const compressed = deflateSync(raw);

  function chunk(type: string, data: Buffer): Buffer {
    const typeBuf = Buffer.from(type, "ascii");
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const crc = Buffer.alloc(4);
    const crcVal = crc32(Buffer.concat([typeBuf, data]));
    crc.writeUInt32BE(crcVal >>> 0, 0);
    return Buffer.concat([len, typeBuf, data, crc]);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type RGB
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", compressed),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i]!;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
  }
  return (c ^ 0xffffffff) >>> 0;
}

/**
 * In-process demo backend so Pocket works without a live Prime daemon.
 * Simulates streaming replies, image attach/return, needs_input, and artifacts.
 */
export class DemoBackend implements AgentBackend {
  readonly capabilities: HostCapabilities = {
    prompt: true,
    steer: true,
    followUp: true,
    cancel: true,
    artifacts: true,
    launch: true,
    images: true,
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
      if (req.streamingBehavior === "followUp") {
        return this.followUp(agentId, req.message, req.images);
      }
      throw new Error("Agent is streaming; pass streamingBehavior steer|followUp");
    }
    const images = this.persistPromptImages(agentId, req.images ?? []);
    this.pushUser(state, agentId, req.message, images);
    this.simulateReply(agentId, req.message, images.length);
  }

  async steer(agentId: AgentId, message: string): Promise<void> {
    const state = this.require(agentId);
    this.pushUser(state, agentId, `[steer] ${message}`);
    if (!state.streaming) this.simulateReply(agentId, message, 0);
  }

  async followUp(
    agentId: AgentId,
    message: string,
    images?: Array<{ mimeType: string; dataBase64: string; name?: string }>,
  ): Promise<void> {
    const state = this.require(agentId);
    const persisted = this.persistPromptImages(agentId, images ?? []);
    this.pushUser(state, agentId, `[follow-up] ${message}`, persisted);
    if (!state.streaming) this.simulateReply(agentId, message, persisted.length);
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
    this.simulateReply(agentId, `Thanks, continuing with: ${text}`, 0);
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

  private pushUser(
    state: MutableAgentState,
    agentId: AgentId,
    message: string,
    images: MessageImage[] = [],
  ): void {
    const msg: TranscriptMessage = {
      id: id("msg"),
      role: "user",
      text: message,
      createdAt: nowIso(),
      images: images.length ? images : undefined,
    };
    state.messages.push(msg);
    state.summary.preview = message.slice(0, 80) || (images.length ? "[image]" : "");
    state.summary.status = "running";
    this.advance(state);
    this.emit(agentId, { type: "message_done", message: msg, cursor: { ...state.cursor } });
    this.emit(agentId, { type: "status", status: "running", cursor: { ...state.cursor } });
  }

  private persistPromptImages(
    agentId: AgentId,
    images: Array<{ mimeType: string; dataBase64: string; name?: string }>,
  ): MessageImage[] {
    const out: MessageImage[] = [];
    for (const img of images) {
      if (!img.dataBase64 || !isImageMime(img.mimeType)) continue;
      const body = Buffer.from(img.dataBase64, "base64");
      if (!body.length) continue;
      const artifactId = id("art");
      const ext = img.mimeType.includes("png")
        ? "png"
        : img.mimeType.includes("webp")
          ? "webp"
          : img.mimeType.includes("gif")
            ? "gif"
            : "jpg";
      const name = img.name ?? `upload-${artifactId.slice(-6)}.${ext}`;
      const meta = this.writeArtifact(agentId, artifactId, name, img.mimeType, body, "image");
      out.push({
        mimeType: img.mimeType,
        artifactId: meta.id,
        name,
      });
    }
    return out;
  }

  private simulateReply(agentId: AgentId, userMessage: string, inboundImageCount: number): void {
    const state = this.require(agentId);
    state.streaming = true;
    const messageId = id("msg");
    const wantScreenshot = /screenshot|image|photo|picture|png|jpeg|jpg/i.test(userMessage);
    const chunks = this.planReply(userMessage, inboundImageCount, wantScreenshot);
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
      let replyImages: MessageImage[] | undefined;
      if (wantScreenshot || inboundImageCount > 0) {
        const shot = this.addDemoScreenshot(agentId);
        replyImages = [
          {
            mimeType: shot.mimeType,
            artifactId: shot.id,
            name: shot.name,
          },
        ];
      }
      const message: TranscriptMessage = {
        id: messageId,
        role: "assistant",
        text: full,
        createdAt: nowIso(),
        images: replyImages,
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
      } else if (/artifact|log/i.test(userMessage) && !wantScreenshot) {
        this.addDemoArtifact(agentId);
      }
    };
    const t = setTimeout(tick, 80);
    this.timers.add(t);
  }

  private planReply(userMessage: string, inboundImageCount: number, wantScreenshot: boolean): string[] {
    const bits = [`Got it. (demo)\n\nYou said: ${userMessage}\n\n`];
    if (inboundImageCount > 0) {
      bits.push(`Received ${inboundImageCount} image${inboundImageCount === 1 ? "" : "s"} from your phone.\n\n`);
    }
    if (wantScreenshot) {
      bits.push("Returning a demo screenshot artifact so you can preview agent→phone images.");
    } else {
      bits.push("In a live setup this would go through Prime Agent's daemon via AgentConnection.");
    }
    const body = bits.join("");
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

  private writeArtifact(
    agentId: AgentId,
    artifactId: string,
    name: string,
    mimeType: string,
    body: Buffer,
    kind: "image" | "file",
  ): ArtifactMeta {
    const state = this.require(agentId);
    const dir = `${this.artifactRoot}/${agentId}`;
    mkdirSync(dir, { recursive: true });
    writeFileSync(`${dir}/${artifactId}`, body);
    const meta: ArtifactMeta = {
      id: artifactId,
      name,
      mimeType,
      sizeBytes: body.length,
      createdAt: nowIso(),
      kind,
    };
    state.artifacts.push(meta);
    this.advance(state);
    this.emit(agentId, { type: "artifact", artifact: meta, cursor: { ...state.cursor } });
    return meta;
  }

  private addDemoArtifact(agentId: AgentId): void {
    const artifactId = id("art");
    const body = Buffer.from(
      `# Demo artifact\n\nGenerated at ${nowIso()} for agent ${agentId}\n`,
      "utf8",
    );
    this.writeArtifact(agentId, artifactId, "demo-notes.md", "text/markdown", body, "file");
  }

  private addDemoScreenshot(agentId: AgentId): ArtifactMeta {
    const artifactId = id("art");
    return this.writeArtifact(
      agentId,
      artifactId,
      "demo-screenshot.png",
      "image/png",
      demoPngBytes(),
      "image",
    );
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
