import { createHash, randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import selfsigned from "selfsigned";
import type { Workspace } from "@prime-pocket/protocol";

export interface BridgeIdentity {
  hostId: string;
  hostName: string;
  certPem: string;
  keyPem: string;
  fingerprint: string;
}

export interface StoredToken {
  token: string;
  deviceLabel: string;
  createdAt: string;
}

export interface BridgeStoreData {
  identity: BridgeIdentity;
  tokens: StoredToken[];
  pairCode: string;
  pairCodeExpiresAt: string;
  ntfyTopic?: string;
  ntfyServer?: string;
  /** Repositories / worktrees registered on this host. */
  workspaces: Workspace[];
}

function defaultDataDir(): string {
  return process.env.PRIME_POCKET_HOME ?? join(homedir(), ".prime-pocket");
}

export function ensureDataDir(dir = defaultDataDir()): string {
  mkdirSync(dir, { recursive: true });
  mkdirSync(join(dir, "artifacts"), { recursive: true });
  mkdirSync(join(dir, "worktrees"), { recursive: true });
  return dir;
}

function storePath(dir: string): string {
  return join(dir, "bridge.json");
}

function fingerprintFromCert(certPem: string): string {
  const b64 = certPem
    .replace(/-----BEGIN CERTIFICATE-----/, "")
    .replace(/-----END CERTIFICATE-----/, "")
    .replace(/\s+/g, "");
  const der = Buffer.from(b64, "base64");
  return createHash("sha256").update(der).digest("hex");
}

function createIdentity(hostName: string): BridgeIdentity {
  const attrs = [{ name: "commonName", value: hostName }];
  const pems = selfsigned.generate(attrs, {
    days: 3650,
    keySize: 2048,
    algorithm: "sha256",
    extensions: [{ name: "basicConstraints", cA: true }],
  });
  const certPem = pems.cert;
  const keyPem = pems.private;
  return {
    hostId: `host_${randomBytes(8).toString("hex")}`,
    hostName,
    certPem,
    keyPem,
    fingerprint: fingerprintFromCert(certPem),
  };
}

export class BridgeStore {
  readonly dataDir: string;
  data: BridgeStoreData;

  constructor(dataDir = defaultDataDir(), hostName = "prime-pocket") {
    this.dataDir = ensureDataDir(dataDir);
    const path = storePath(this.dataDir);
    if (existsSync(path)) {
      const loaded = JSON.parse(readFileSync(path, "utf8")) as BridgeStoreData;
      this.data = { ...loaded, workspaces: loaded.workspaces ?? [] };
    } else {
      this.data = {
        identity: createIdentity(hostName),
        tokens: [],
        pairCode: randomBytes(4).toString("hex"),
        pairCodeExpiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
        workspaces: [],
      };
      this.save();
    }
  }

  save(): void {
    writeFileSync(storePath(this.dataDir), JSON.stringify(this.data, null, 2));
  }

  /** Reload mutable pairing/auth fields from disk so CLI `pair-code` works while bridge runs. */
  reloadAuthFromDisk(): void {
    const path = storePath(this.dataDir);
    if (!existsSync(path)) return;
    try {
      const onDisk = JSON.parse(readFileSync(path, "utf8")) as BridgeStoreData;
      this.data.pairCode = onDisk.pairCode;
      this.data.pairCodeExpiresAt = onDisk.pairCodeExpiresAt;
      this.data.tokens = onDisk.tokens ?? this.data.tokens;
      this.data.ntfyTopic = onDisk.ntfyTopic;
      this.data.ntfyServer = onDisk.ntfyServer;
    } catch {
      // keep in-memory state if disk is temporarily unreadable
    }
  }

  rotatePairCode(ttlMs = 15 * 60_000): string {
    this.reloadAuthFromDisk();
    this.data.pairCode = randomBytes(4).toString("hex");
    this.data.pairCodeExpiresAt = new Date(Date.now() + ttlMs).toISOString();
    this.save();
    return this.data.pairCode;
  }

  pairCodeValid(code: string): boolean {
    this.reloadAuthFromDisk();
    if (code !== this.data.pairCode) return false;
    return Date.now() <= Date.parse(this.data.pairCodeExpiresAt);
  }

  issueToken(deviceLabel: string): string {
    this.reloadAuthFromDisk();
    const token = `pp_${randomBytes(24).toString("base64url")}`;
    this.data.tokens.push({
      token,
      deviceLabel,
      createdAt: new Date().toISOString(),
    });
    // One-time pair code; rotate after successful pair
    this.data.pairCode = randomBytes(4).toString("hex");
    this.data.pairCodeExpiresAt = new Date(Date.now() + 15 * 60_000).toISOString();
    this.save();
    return token;
  }

  revokeToken(token: string): boolean {
    this.reloadAuthFromDisk();
    const before = this.data.tokens.length;
    this.data.tokens = this.data.tokens.filter((t) => t.token !== token);
    this.save();
    return this.data.tokens.length < before;
  }

  authorize(bearer: string | undefined): boolean {
    if (!bearer) return false;
    this.reloadAuthFromDisk();
    return this.data.tokens.some((t) => t.token === bearer);
  }

  setNtfy(topic: string | undefined, server?: string): void {
    this.data.ntfyTopic = topic;
    this.data.ntfyServer = server;
    this.save();
  }

  artifactPath(agentId: string, artifactId: string): string {
    return join(this.dataDir, "artifacts", agentId, artifactId);
  }

  listWorkspaces(): Workspace[] {
    return [...(this.data.workspaces ?? [])].sort((a, b) => b.addedAt.localeCompare(a.addedAt));
  }

  getWorkspace(id: string): Workspace | undefined {
    return (this.data.workspaces ?? []).find((w) => w.id === id);
  }

  findWorkspaceByCwd(cwd: string): Workspace | undefined {
    return (this.data.workspaces ?? []).find((w) => w.cwd === cwd);
  }

  findWorkspaceByFullName(fullName: string): Workspace | undefined {
    const key = fullName.trim().toLowerCase();
    return (this.data.workspaces ?? []).find((w) => w.fullName?.toLowerCase() === key);
  }

  upsertWorkspace(workspace: Workspace): Workspace {
    const list = this.data.workspaces ?? [];
    const idx = list.findIndex((w) => w.id === workspace.id);
    if (idx >= 0) list[idx] = workspace;
    else list.push(workspace);
    this.data.workspaces = list;
    this.save();
    return workspace;
  }

  removeWorkspace(id: string): boolean {
    const before = (this.data.workspaces ?? []).length;
    this.data.workspaces = (this.data.workspaces ?? []).filter((w) => w.id !== id);
    this.save();
    return this.data.workspaces.length < before;
  }

  /** Local path under dataDir/worktrees for a GitHub full name. */
  worktreePathFor(fullName: string): string {
    const safe = fullName.replace(/[^\w.-]+/g, "-").replace(/^-+|-+$/g, "");
    return join(this.dataDir, "worktrees", safe);
  }
}
