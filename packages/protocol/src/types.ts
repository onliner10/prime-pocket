/**
 * Prime Pocket wire protocol — shared DTOs for phone ↔ bridge.
 * Snapshot-first, generation/cursor-aware like Prime's AgentConnection.
 */

/** Opaque host id assigned by the bridge at first boot. */
export type HostId = string;

/** Opaque agent/session id (maps to a Prime session when attached). */
export type AgentId = string;

/** Opaque artifact id within an agent. */
export type ArtifactId = string;

/** Event cursor: generation changes invalidate bare sequence comparisons. */
export interface EventCursor {
  generation: number;
  sequence: number;
}

export type AgentStatus =
  | "running"
  | "idle"
  | "saved"
  | "needs_input"
  | "error"
  | "stopped";

export interface HostCapabilities {
  prompt: boolean;
  steer: boolean;
  followUp: boolean;
  cancel: boolean;
  artifacts: boolean;
  launch: boolean;
  /** Client may attach images on prompts; agent may return image artifacts/messages. */
  images: boolean;
  /** Bridge is using a mock/demo adapter instead of a live Prime daemon. */
  demoMode: boolean;
  /** Host can list/add workspaces (local folders / GitHub worktrees). */
  workspaces: boolean;
  /** Host exposes a GitHub catalog (live token/OAuth or mock). */
  github: boolean;
}

export interface HostInfo {
  id: HostId;
  name: string;
  /** Advertised base URL(s) the phone can try (LAN, Tailscale, tunnel). */
  urls: string[];
  /** SHA-256 fingerprint of the TLS cert (hex). */
  fingerprint: string;
  capabilities: HostCapabilities;
  /** ISO timestamp when the bridge started. */
  startedAt: string;
  /** Optional ntfy topic the bridge publishes to (may be unset). */
  ntfyTopic?: string;
}

export type AgentSummary = {
  id: AgentId;
  hostId: HostId;
  name: string;
  status: AgentStatus;
  cwd?: string;
  model?: string;
  /** Short preview of the latest assistant/user text. */
  preview?: string;
  updatedAt: string;
  createdAt: string;
};

export type MessageRole = "user" | "assistant" | "system" | "tool";

/** Image attached to a transcript message (phone→agent or agent→phone). */
export interface MessageImage {
  mimeType: string;
  /** Prefer artifact download for larger payloads. */
  artifactId?: ArtifactId;
  /** Inline base64 (no data: prefix) for small images. */
  dataBase64?: string;
  width?: number;
  height?: number;
  name?: string;
}

export interface TranscriptMessage {
  id: string;
  role: MessageRole;
  text: string;
  createdAt: string;
  /** Tool name when role is tool. */
  toolName?: string;
  /** Images shared on this message (both directions). */
  images?: MessageImage[];
}

export interface ArtifactMeta {
  id: ArtifactId;
  name: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
  /** Image artifacts are shown inline in the mobile UI. */
  kind?: "image" | "file";
}


export interface AgentSnapshot {
  agent: AgentSummary;
  messages: TranscriptMessage[];
  artifacts: ArtifactMeta[];
  cursor: EventCursor;
  /** True when an assistant turn is currently streaming. */
  streaming: boolean;
}

/** Live events after the initial snapshot. */
export type AgentEvent =
  | { type: "message_delta"; messageId: string; role: MessageRole; text: string; cursor: EventCursor }
  | { type: "message_done"; message: TranscriptMessage; cursor: EventCursor }
  | { type: "status"; status: AgentStatus; cursor: EventCursor }
  | { type: "artifact"; artifact: ArtifactMeta; cursor: EventCursor }
  | { type: "needs_input"; prompt: string; requestId: string; cursor: EventCursor }
  | { type: "error"; message: string; cursor: EventCursor }
  | { type: "resync"; snapshot: AgentSnapshot };

export interface PairingQrPayload {
  v: 1;
  /** Preferred base URL (usually LAN or Tailscale). */
  url: string;
  /** Alternate URLs the phone may try. */
  urls: string[];
  pairCode: string;
  fingerprint: string;
  hostId: HostId;
  hostName: string;
}

export interface PairRequest {
  pairCode: string;
  /** Human-readable device label, e.g. "Mateusz iPhone". */
  deviceLabel: string;
}

export interface PairResponse {
  host: HostInfo;
  /** Long-lived bearer token for subsequent API calls. */
  token: string;
}

export interface LaunchAgentRequest {
  cwd?: string;
  /** Launch into a concrete worktree (preferred). */
  worktreeId?: WorktreeId;
  /** Falls back to the newest worktree on this workspace when worktreeId is omitted. */
  workspaceId?: WorkspaceId;
  name?: string;
  prompt?: string;
  model?: string;
  /** Resume an existing saved session id when supported. */
  resumeId?: string;
}

/** Opaque workspace id — a linked repository on the bridge. */
export type WorkspaceId = string;

/** Opaque worktree id — a branch checkout under a workspace. */
export type WorktreeId = string;

/**
 * A repository registered on the paired host.
 * Agents do not run here directly — they run in a Worktree.
 */
export interface Workspace {
  id: WorkspaceId;
  /** Short display name, e.g. "prime-pocket". */
  name: string;
  /** owner/repo when known. */
  fullName?: string;
  /** Optional bare/clone root on the host. */
  repoRoot?: string;
  defaultBranch?: string;
  source: "github" | "local";
  github?: {
    owner: string;
    repo: string;
    private?: boolean;
    htmlUrl?: string;
  };
  addedAt: string;
  /** Convenience count for list UIs. */
  worktreeCount?: number;
}

/** A git worktree (branch + cwd) where an agent can do work. */
export interface Worktree {
  id: WorktreeId;
  workspaceId: WorkspaceId;
  /** Branch checked out in this worktree. */
  branch: string;
  /** Absolute path on the host machine. */
  cwd: string;
  /** Short label (often the branch). */
  name: string;
  createdAt: string;
}

/** In-progress GitHub device-flow (browser) authorization on the host. */
export interface GitHubOAuthPending {
  /** Short code the user types on github.com/login/device (e.g. WDJB-MJHT). */
  userCode: string;
  /** Browser URL where the user confirms the code. */
  verificationUri: string;
  /** Absolute ISO time when the device code expires. */
  expiresAt: string;
  /** Suggested seconds between status polls (from GitHub). */
  interval?: number;
}

export interface GitHubStatus {
  connected: boolean;
  /** How GitHub is backed on this host. */
  mode: "mock" | "token" | "oauth" | "disconnected";
  /** True when catalog data is synthetic (safe for demos / e2e). */
  mock: boolean;
  /** Host can offer a no-credentials mock connect (demo bridges). */
  mockAvailable?: boolean;
  /** Host has an OAuth App client id and can run browser/device login. */
  oauthAvailable?: boolean;
  login?: string;
  /** Present while the user completes browser authorization. */
  oauth?: GitHubOAuthPending;
}

export interface GitHubConnectRequest {
  /** Prefer mock when the host supports it (demos / e2e). */
  mode?: "mock" | "oauth" | "token";
  /** Optional PAT when mode is token (live hosts). */
  token?: string;
}

export interface GitHubCatalogRepo {
  id: string;
  fullName: string;
  description?: string;
  private: boolean;
  defaultBranch: string;
  htmlUrl: string;
  /** Language label for list affordance, optional. */
  language?: string;
}

export interface GitHubBranch {
  name: string;
  protected?: boolean;
  /** True when this is the repository default branch. */
  isDefault?: boolean;
}

export interface AddWorkspaceFromGitHubRequest {
  fullName: string;
  /** Optional override for the host-side repo root. */
  repoRoot?: string;
}

export interface AddLocalWorkspaceRequest {
  name: string;
  /** Local folder that is the repository root on the host. */
  repoRoot: string;
}

export interface CreateWorktreeRequest {
  branch: string;
  name?: string;
  /** Optional override; host invents a path under its worktrees dir by default. */
  cwd?: string;
}

export interface PromptImage {
  mimeType: string;
  dataBase64: string;
  name?: string;
}

export interface PromptRequest {
  message: string;
  /** Required by the bridge when the agent is already streaming. */
  streamingBehavior?: "steer" | "followUp";
  images?: PromptImage[];
}

export interface SteerRequest {
  message: string;
}

export interface FollowUpRequest {
  message: string;
  images?: PromptImage[];
}

export interface NeedsInputReply {
  requestId: string;
  value: string | boolean;
}

/** Persisted on the phone after pairing. */
export interface PairedHost {
  hostId: HostId;
  baseUrl: string;
  urls: string[];
  token: string;
  label: string;
  fingerprint: string;
  pairedAt: string;
}

export interface ApiErrorBody {
  error: string;
  code?: string;
}

/** WebSocket client → bridge control frames (optional; most actions use HTTP). */
export type StreamClientMessage =
  | { type: "subscribe"; agentId: AgentId; resumeCursor?: EventCursor }
  | { type: "ping" };

export type StreamServerMessage =
  | { type: "snapshot"; snapshot: AgentSnapshot }
  | { type: "event"; event: AgentEvent }
  | { type: "pong" }
  | { type: "error"; message: string };
