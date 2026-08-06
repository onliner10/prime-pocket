/** HTTP path constants for the Pocket Bridge API. */
export const API_PREFIX = "/v1" as const;

export const Routes = {
  host: `${API_PREFIX}/host`,
  pair: `${API_PREFIX}/pair`,
  pairInfo: `${API_PREFIX}/pair/info`,
  agents: `${API_PREFIX}/agents`,
  agent: (id: string) => `${API_PREFIX}/agents/${encodeURIComponent(id)}`,
  agentPrompt: (id: string) => `${API_PREFIX}/agents/${encodeURIComponent(id)}/prompt`,
  agentSteer: (id: string) => `${API_PREFIX}/agents/${encodeURIComponent(id)}/steer`,
  agentFollowUp: (id: string) => `${API_PREFIX}/agents/${encodeURIComponent(id)}/follow-up`,
  agentCancel: (id: string) => `${API_PREFIX}/agents/${encodeURIComponent(id)}/cancel`,
  agentNeedsInput: (id: string) => `${API_PREFIX}/agents/${encodeURIComponent(id)}/needs-input`,
  agentStream: (id: string) => `${API_PREFIX}/agents/${encodeURIComponent(id)}/stream`,
  agentArtifact: (agentId: string, artifactId: string) =>
    `${API_PREFIX}/agents/${encodeURIComponent(agentId)}/artifacts/${encodeURIComponent(artifactId)}`,
} as const;

export const DEFAULT_BRIDGE_PORT = 7420;

export const AUTH_HEADER = "authorization";
export const BEARER_PREFIX = "Bearer ";
