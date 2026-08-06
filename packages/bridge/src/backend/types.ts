import type {
  AgentEvent,
  AgentId,
  AgentSnapshot,
  AgentSummary,
  ArtifactMeta,
  EventCursor,
  HostCapabilities,
  LaunchAgentRequest,
  PromptRequest,
  TranscriptMessage,
} from "@prime-pocket/protocol";

export type AgentEventListener = (agentId: AgentId, event: AgentEvent) => void;

/**
 * Backend that backs the Pocket bridge API.
 * DemoAdapter runs in-process; PrimeDaemonAdapter attaches to a local Prime daemon when available.
 */
export interface AgentBackend {
  readonly capabilities: HostCapabilities;
  listAgents(): Promise<AgentSummary[]>;
  getSnapshot(agentId: AgentId): Promise<AgentSnapshot | undefined>;
  launch(req: LaunchAgentRequest): Promise<AgentSummary>;
  prompt(agentId: AgentId, req: PromptRequest): Promise<void>;
  steer(agentId: AgentId, message: string): Promise<void>;
  followUp(agentId: AgentId, message: string): Promise<void>;
  cancel(agentId: AgentId): Promise<void>;
  replyNeedsInput(agentId: AgentId, requestId: string, value: string | boolean): Promise<void>;
  readArtifact(agentId: AgentId, artifactId: string): Promise<{ meta: ArtifactMeta; body: Buffer } | undefined>;
  onEvent(listener: AgentEventListener): () => void;
  dispose(): Promise<void>;
}

export interface MutableAgentState {
  summary: AgentSummary;
  messages: TranscriptMessage[];
  artifacts: ArtifactMeta[];
  cursor: EventCursor;
  streaming: boolean;
  pendingInput?: { requestId: string; prompt: string };
}
