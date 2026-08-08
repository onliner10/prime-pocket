import { createServer as createHttpsServer, type Server as HttpsServer } from "node:https";
import { createServer as createHttpServer, type IncomingMessage, type ServerResponse } from "node:http";
import { URL } from "node:url";
import { WebSocketServer, type WebSocket } from "ws";
import {
  BEARER_PREFIX,
  MAX_HTTP_BODY_BYTES,
  Routes,
  encodePairingQr,
  sanitizeArtifactFilename,
  validatePromptImages,
  type AddLocalWorkspaceRequest,
  type AddWorkspaceFromGitHubRequest,
  type AgentEvent,
  type AgentId,
  type ApiErrorBody,
  type FollowUpRequest,
  type HostInfo,
  type LaunchAgentRequest,
  type NeedsInputReply,
  type PairRequest,
  type PairResponse,
  type PairingQrPayload,
  type PromptRequest,
  type SteerRequest,
  type StreamClientMessage,
  type StreamServerMessage,
  type Workspace,
} from "@prime-pocket/protocol";
import { randomBytes } from "node:crypto";
import { mkdirSync } from "node:fs";
import type { AgentBackend } from "./backend/types.js";
import { BridgeStore } from "./store.js";
import { collectAdvertisedUrls, pickPreferredUrl } from "./network.js";
import { publishNtfy } from "./ntfy.js";
import type { GitHubProvider } from "./github.js";
import { createGitHubProvider } from "./github.js";

export interface BridgeServerOptions {
  store: BridgeStore;
  backend: AgentBackend;
  port: number;
  /** Prefer HTTPS with the store identity cert. Set false only for local tests. */
  tls?: boolean;
  /** GitHub catalog provider; defaults from demo/env. */
  github?: GitHubProvider;
}

function readBody(req: IncomingMessage, maxBytes = MAX_HTTP_BODY_BYTES): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    req.on("data", (c: Buffer) => {
      total += c.length;
      if (total > maxBytes) {
        reject(Object.assign(new Error("Request body too large"), { code: "payload_too_large" }));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(data),
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "authorization, content-type",
      "access-control-allow-methods": "GET,POST,DELETE,OPTIONS",
  });
  res.end(data);
}

function sendError(res: ServerResponse, status: number, error: string, code?: string): void {
  const body: ApiErrorBody = { error, code };
  sendJson(res, status, body);
}

function bearerToken(req: IncomingMessage, url?: URL): string | undefined {
  const h = req.headers.authorization;
  if (h?.startsWith(BEARER_PREFIX)) {
    return h.slice(BEARER_PREFIX.length).trim();
  }
  const fromQuery = url?.searchParams.get("token");
  return fromQuery?.trim() || undefined;
}

export class BridgeServer {
  readonly store: BridgeStore;
  readonly backend: AgentBackend;
  readonly github: GitHubProvider;
  readonly port: number;
  private readonly tls: boolean;
  private server: HttpsServer | ReturnType<typeof createHttpServer> | null = null;
  private wss: WebSocketServer | null = null;
  private urls: string[] = [];
  private unsubBackend: (() => void) | null = null;
  private readonly agentSockets = new Map<AgentId, Set<WebSocket>>();

  constructor(opts: BridgeServerOptions) {
    this.store = opts.store;
    this.backend = opts.backend;
    this.port = opts.port;
    this.tls = opts.tls !== false;
    this.github =
      opts.github ??
      createGitHubProvider({ mock: Boolean(this.backend.capabilities.demoMode) });
  }

  async start(): Promise<{ urls: string[]; pairing: PairingQrPayload; pairingDeepLink: string }> {
    this.urls = await collectAdvertisedUrls(this.port);
    const identity = this.store.data.identity;

    const handler = (req: IncomingMessage, res: ServerResponse) => {
      void this.handleHttp(req, res);
    };

    if (this.tls) {
      this.server = createHttpsServer(
        { key: identity.keyPem, cert: identity.certPem },
        handler,
      );
    } else {
      this.server = createHttpServer(handler);
      // Rewrite advertised urls to http for test mode
      this.urls = this.urls.map((u) => u.replace(/^https:/, "http:"));
    }

    this.wss = new WebSocketServer({ noServer: true });
    this.server.on("upgrade", (req, socket, head) => {
      void this.handleUpgrade(req, socket, head);
    });

    await new Promise<void>((resolve, reject) => {
      this.server!.listen(this.port, "0.0.0.0", () => resolve());
      this.server!.once("error", reject);
    });

    this.unsubBackend = this.backend.onEvent((agentId, event) => {
      this.broadcast(agentId, event);
      void this.maybeNotify(agentId, event);
    });

    // Ensure pair code is fresh on start
    if (!this.store.pairCodeValid(this.store.data.pairCode)) {
      this.store.rotatePairCode();
    }

    const pairing = await this.buildPairingPayload();
    return {
      urls: this.urls,
      pairing,
      pairingDeepLink: encodePairingQr(pairing),
    };
  }

  async stop(): Promise<void> {
    this.unsubBackend?.();
    this.unsubBackend = null;
    for (const set of this.agentSockets.values()) {
      for (const ws of set) ws.close();
    }
    this.agentSockets.clear();
    await new Promise<void>((resolve) => this.wss?.close(() => resolve()));
    await new Promise<void>((resolve, reject) => {
      this.server?.close((err) => (err ? reject(err) : resolve()));
    });
    await this.backend.dispose();
  }

  async buildPairingPayload(): Promise<PairingQrPayload> {
    this.urls = await collectAdvertisedUrls(this.port);
    if (!this.tls) {
      this.urls = this.urls.map((u) => u.replace(/^https:/, "http:"));
    }
    const preferred = pickPreferredUrl(this.urls);
    const id = this.store.data.identity;
    return {
      v: 1,
      url: preferred,
      urls: this.urls,
      pairCode: this.store.data.pairCode,
      fingerprint: id.fingerprint,
      hostId: id.hostId,
      hostName: id.hostName,
    };
  }

  private hostInfo(): HostInfo {
    const id = this.store.data.identity;
    return {
      id: id.hostId,
      name: id.hostName,
      urls: this.urls,
      fingerprint: id.fingerprint,
      capabilities: this.backend.capabilities,
      startedAt: new Date().toISOString(),
      ntfyTopic: this.store.data.ntfyTopic,
    };
  }

  private requireAuth(req: IncomingMessage, res: ServerResponse, url?: URL): boolean {
    const token = bearerToken(req, url);
    if (!this.store.authorize(token)) {
      sendError(res, 401, "Unauthorized", "unauthorized");
      return false;
    }
    return true;
  }

  private async handleHttp(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
      if (req.method === "OPTIONS") {
        res.writeHead(204, {
          "access-control-allow-origin": "*",
          "access-control-allow-headers": "authorization, content-type",
          "access-control-allow-methods": "GET,POST,DELETE,OPTIONS",
        });
        res.end();
        return;
      }

      const host = req.headers.host ?? `127.0.0.1:${this.port}`;
      const url = new URL(req.url ?? "/", `${this.tls ? "https" : "http"}://${host}`);
      const path = url.pathname.replace(/\/$/, "") || "/";

      if (req.method === "GET" && path === "/health") {
        sendJson(res, 200, { ok: true });
        return;
      }

      if (req.method === "GET" && path === Routes.pairInfo) {
        const pairing = await this.buildPairingPayload();
        sendJson(res, 200, {
          hostId: pairing.hostId,
          hostName: pairing.hostName,
          fingerprint: pairing.fingerprint,
          urls: pairing.urls,
          pairCodeExpiresAt: this.store.data.pairCodeExpiresAt,
        });
        return;
      }

      if (req.method === "POST" && path === Routes.pair) {
        const raw = await readBody(req);
        const body = JSON.parse(raw || "{}") as PairRequest;
        if (!body.pairCode || !body.deviceLabel) {
          sendError(res, 400, "pairCode and deviceLabel required", "bad_request");
          return;
        }
        if (!this.store.pairCodeValid(body.pairCode)) {
          sendError(res, 403, "Invalid or expired pair code", "pair_invalid");
          return;
        }
        const token = this.store.issueToken(body.deviceLabel);
        const response: PairResponse = { host: this.hostInfo(), token };
        sendJson(res, 200, response);
        return;
      }

      if (req.method === "GET" && path === Routes.host) {
        if (!this.requireAuth(req, res, url)) return;
        sendJson(res, 200, this.hostInfo());
        return;
      }

      if (req.method === "GET" && path === Routes.workspaces) {
        if (!this.requireAuth(req, res, url)) return;
        sendJson(res, 200, { workspaces: this.store.listWorkspaces() });
        return;
      }

      if (req.method === "POST" && path === Routes.workspaces) {
        if (!this.requireAuth(req, res, url)) return;
        const body = JSON.parse((await readBody(req)) || "{}") as AddLocalWorkspaceRequest;
        if (!body.name?.trim() || !body.cwd?.trim()) {
          sendError(res, 400, "name and cwd required", "bad_request");
          return;
        }
        const existing = this.store.findWorkspaceByCwd(body.cwd.trim());
        if (existing) {
          sendJson(res, 200, { workspace: existing });
          return;
        }
        const workspace: Workspace = {
          id: `ws_${randomBytes(8).toString("hex")}`,
          name: body.name.trim(),
          cwd: body.cwd.trim(),
          source: "local",
          addedAt: new Date().toISOString(),
        };
        mkdirSync(workspace.cwd, { recursive: true });
        this.store.upsertWorkspace(workspace);
        sendJson(res, 201, { workspace });
        return;
      }

      if (req.method === "POST" && path === Routes.workspacesFromGitHub) {
        if (!this.requireAuth(req, res, url)) return;
        const body = JSON.parse((await readBody(req)) || "{}") as AddWorkspaceFromGitHubRequest;
        if (!body.fullName?.trim()) {
          sendError(res, 400, "fullName required", "bad_request");
          return;
        }
        const fullName = body.fullName.trim();
        const existing = this.store.findWorkspaceByFullName(fullName);
        if (existing) {
          sendJson(res, 200, { workspace: existing });
          return;
        }
        const repo = await this.github.findRepo(fullName);
        if (!repo) {
          sendError(res, 404, `GitHub repository not found: ${fullName}`, "not_found");
          return;
        }
        const [owner, repoName] = repo.fullName.split("/");
        const cwd = body.cwd?.trim() || this.store.worktreePathFor(repo.fullName);
        mkdirSync(cwd, { recursive: true });
        const workspace: Workspace = {
          id: `ws_${randomBytes(8).toString("hex")}`,
          name: repoName || repo.fullName,
          fullName: repo.fullName,
          cwd,
          defaultBranch: repo.defaultBranch,
          source: "github",
          github: {
            owner: owner || "",
            repo: repoName || repo.fullName,
            private: repo.private,
            htmlUrl: repo.htmlUrl,
          },
          addedAt: new Date().toISOString(),
        };
        this.store.upsertWorkspace(workspace);
        sendJson(res, 201, { workspace });
        return;
      }

      const workspaceMatch = path.match(/^\/v1\/workspaces\/([^/]+)$/);
      if (workspaceMatch && req.method === "DELETE") {
        if (!this.requireAuth(req, res, url)) return;
        const id = decodeURIComponent(workspaceMatch[1]!);
        const ok = this.store.removeWorkspace(id);
        if (!ok) {
          sendError(res, 404, "Workspace not found", "not_found");
          return;
        }
        sendJson(res, 200, { ok: true });
        return;
      }

      if (req.method === "GET" && path === Routes.githubStatus) {
        if (!this.requireAuth(req, res, url)) return;
        sendJson(res, 200, this.github.status());
        return;
      }

      if (req.method === "POST" && path === Routes.githubConnect) {
        if (!this.requireAuth(req, res, url)) return;
        try {
          const status = await this.github.connect();
          sendJson(res, 200, status);
        } catch (e) {
          sendError(res, 400, e instanceof Error ? e.message : String(e), "github_unavailable");
        }
        return;
      }

      if (req.method === "GET" && path === Routes.githubRepos) {
        if (!this.requireAuth(req, res, url)) return;
        const status = this.github.status();
        if (!status.connected) {
          sendError(res, 401, "GitHub not connected on this host", "github_disconnected");
          return;
        }
        const q = url.searchParams.get("q") ?? undefined;
        const repos = await this.github.listRepos(q);
        sendJson(res, 200, { repos, status });
        return;
      }

      if (req.method === "GET" && path === Routes.agents) {
        if (!this.requireAuth(req, res, url)) return;
        const agents = await this.backend.listAgents();
        sendJson(res, 200, { agents });
        return;
      }

      if (req.method === "POST" && path === Routes.agents) {
        if (!this.requireAuth(req, res, url)) return;
        const body = JSON.parse((await readBody(req)) || "{}") as LaunchAgentRequest;
        let launchReq = body;
        if (body.workspaceId) {
          const ws = this.store.getWorkspace(body.workspaceId);
          if (!ws) {
            sendError(res, 404, "Workspace not found", "not_found");
            return;
          }
          launchReq = { ...body, cwd: body.cwd ?? ws.cwd };
        }
        const agent = await this.backend.launch(launchReq);
        sendJson(res, 201, { agent });
        return;
      }

      const agentMatch = path.match(/^\/v1\/agents\/([^/]+)(?:\/(.*))?$/);
      if (agentMatch) {
        if (!this.requireAuth(req, res, url)) return;
        const agentId = decodeURIComponent(agentMatch[1]!);
        const rest = agentMatch[2] ?? "";

        if (req.method === "GET" && rest === "") {
          const snapshot = await this.backend.getSnapshot(agentId);
          if (!snapshot) {
            sendError(res, 404, "Agent not found", "not_found");
            return;
          }
          sendJson(res, 200, snapshot);
          return;
        }

        if (req.method === "POST" && rest === "prompt") {
          let raw: string;
          try {
            raw = await readBody(req);
          } catch (e) {
            const code = (e as { code?: string }).code;
            if (code === "payload_too_large") {
              sendError(res, 413, "Request body too large", "payload_too_large");
              return;
            }
            throw e;
          }
          const body = JSON.parse(raw || "{}") as PromptRequest;
          if (!body.message?.trim() && !(body.images?.length)) {
            sendError(res, 400, "message or images required", "bad_request");
            return;
          }
          const validated = validatePromptImages(body.images);
          if (!validated.ok) {
            sendError(res, 400, validated.error, validated.code);
            return;
          }
          if (validated.images.length && !this.backend.capabilities.images) {
            sendError(res, 400, "Host does not support images", "images_unsupported");
            return;
          }
          if (validated.images.length) {
            body.images = validated.images.map((img) => ({
              mimeType: img.mimeType,
              dataBase64: img.dataBase64,
              name: img.name,
            }));
          } else {
            delete body.images;
          }
          if (!body.message?.trim() && body.images?.length) {
            body.message = "Shared image(s)";
          }
          if (body.streamingBehavior === "steer" && body.images?.length) {
            sendError(res, 400, "Images are not supported with steer; use followUp", "bad_request");
            return;
          }
          await this.backend.prompt(agentId, body);
          sendJson(res, 200, { ok: true });
          return;
        }

        if (req.method === "POST" && rest === "steer") {
          const body = JSON.parse((await readBody(req)) || "{}") as SteerRequest;
          await this.backend.steer(agentId, body.message);
          sendJson(res, 200, { ok: true });
          return;
        }

        if (req.method === "POST" && rest === "follow-up") {
          let raw: string;
          try {
            raw = await readBody(req);
          } catch (e) {
            const code = (e as { code?: string }).code;
            if (code === "payload_too_large") {
              sendError(res, 413, "Request body too large", "payload_too_large");
              return;
            }
            throw e;
          }
          const body = JSON.parse(raw || "{}") as FollowUpRequest;
          if (!body.message?.trim() && !(body.images?.length)) {
            sendError(res, 400, "message or images required", "bad_request");
            return;
          }
          const validated = validatePromptImages(body.images);
          if (!validated.ok) {
            sendError(res, 400, validated.error, validated.code);
            return;
          }
          if (validated.images.length && !this.backend.capabilities.images) {
            sendError(res, 400, "Host does not support images", "images_unsupported");
            return;
          }
          const images = validated.images.length
            ? validated.images.map((img) => ({
                mimeType: img.mimeType,
                dataBase64: img.dataBase64,
                name: img.name,
              }))
            : undefined;
          if (!body.message?.trim() && images?.length) {
            body.message = "Shared image(s)";
          }
          await this.backend.followUp(agentId, body.message, images);
          sendJson(res, 200, { ok: true });
          return;
        }

        if (req.method === "POST" && rest === "cancel") {
          await this.backend.cancel(agentId);
          sendJson(res, 200, { ok: true });
          return;
        }

        if (req.method === "POST" && rest === "needs-input") {
          const body = JSON.parse((await readBody(req)) || "{}") as NeedsInputReply;
          await this.backend.replyNeedsInput(agentId, body.requestId, body.value);
          sendJson(res, 200, { ok: true });
          return;
        }

        const artMatch = rest.match(/^artifacts\/([^/]+)$/);
        if (req.method === "GET" && artMatch) {
          const artifactId = decodeURIComponent(artMatch[1]!);
          const file = await this.backend.readArtifact(agentId, artifactId);
          if (!file) {
            sendError(res, 404, "Artifact not found", "not_found");
            return;
          }
          const safeName = sanitizeArtifactFilename(file.meta.name, "artifact.bin");
          res.writeHead(200, {
            "content-type": file.meta.mimeType,
            "content-length": file.body.length,
            "content-disposition": `attachment; filename="${safeName}"`,
            "access-control-allow-origin": "*",
          });
          res.end(file.body);
          return;
        }
      }

      sendError(res, 404, "Not found", "not_found");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      sendError(res, 500, message, "internal");
    }
  }

  private async handleUpgrade(
    req: IncomingMessage,
    socket: import("node:stream").Duplex,
    head: Buffer,
  ): Promise<void> {
    try {
      const host = req.headers.host ?? `127.0.0.1:${this.port}`;
      const url = new URL(req.url ?? "/", `${this.tls ? "https" : "http"}://${host}`);
      const match = url.pathname.match(/^\/v1\/agents\/([^/]+)\/stream$/);
      if (!match) {
        socket.destroy();
        return;
      }
      const agentId = decodeURIComponent(match[1]!);
      const token =
        bearerToken(req) ??
        url.searchParams.get("token") ??
        undefined;
      if (!this.store.authorize(token)) {
        socket.write("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n");
        socket.destroy();
        return;
      }
      const snapshot = await this.backend.getSnapshot(agentId);
      if (!snapshot) {
        socket.write("HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n");
        socket.destroy();
        return;
      }

      this.wss!.handleUpgrade(req, socket, head, (ws) => {
        let set = this.agentSockets.get(agentId);
        if (!set) {
          set = new Set();
          this.agentSockets.set(agentId, set);
        }
        set.add(ws);
        const hello: StreamServerMessage = { type: "snapshot", snapshot };
        ws.send(JSON.stringify(hello));

        ws.on("message", (data) => {
          try {
            const msg = JSON.parse(String(data)) as StreamClientMessage;
            if (msg.type === "ping") {
              const pong: StreamServerMessage = { type: "pong" };
              ws.send(JSON.stringify(pong));
            }
          } catch {
            // ignore
          }
        });
        ws.on("close", () => {
          set!.delete(ws);
          if (set!.size === 0) this.agentSockets.delete(agentId);
        });
      });
    } catch {
      socket.destroy();
    }
  }

  private broadcast(agentId: AgentId, event: AgentEvent): void {
    const set = this.agentSockets.get(agentId);
    if (!set?.size) return;
    const msg: StreamServerMessage = { type: "event", event };
    const raw = JSON.stringify(msg);
    for (const ws of set) {
      if (ws.readyState === ws.OPEN) ws.send(raw);
    }
  }

  private async maybeNotify(agentId: AgentId, event: AgentEvent): Promise<void> {
    const topic = this.store.data.ntfyTopic;
    if (!topic) return;
    if (event.type === "needs_input") {
      await publishNtfy({
        topic,
        server: this.store.data.ntfyServer,
        title: "Prime Pocket — needs input",
        message: `${agentId}: ${event.prompt}`,
        priority: 4,
        tags: ["warning", "robot"],
      }).catch(() => undefined);
    } else if (event.type === "status" && event.status === "idle") {
      await publishNtfy({
        topic,
        server: this.store.data.ntfyServer,
        title: "Prime Pocket — agent idle",
        message: `Agent ${agentId} finished its turn.`,
        priority: 2,
        tags: ["white_check_mark"],
      }).catch(() => undefined);
    }
  }
}
