import type { AgentStatus, AgentSummary } from "@prime-pocket/protocol";

export type InboxFilter = "all" | "working" | "needs_attention" | "in_review";

/** Tamagui child theme that carries a status' colour in both schemes. */
export type StatusTheme = "agents" | "working" | "attention" | "review" | "danger";

export function filterAgents(agents: AgentSummary[], filter: InboxFilter): AgentSummary[] {
  switch (filter) {
    case "working":
      return agents.filter((a) => a.status === "running");
    case "needs_attention":
      return agents.filter((a) => a.status === "needs_input" || a.status === "error");
    case "in_review":
      return agents.filter((a) => a.status === "idle" || a.status === "saved");
    default:
      return agents;
  }
}

export function countByFilter(agents: AgentSummary[]) {
  return {
    all: agents.length,
    working: filterAgents(agents, "working").length,
    needs_attention: filterAgents(agents, "needs_attention").length,
    in_review: filterAgents(agents, "in_review").length,
  };
}

export function statusLabel(status: AgentStatus): string {
  switch (status) {
    case "running":
      return "Working";
    case "needs_input":
      return "Needs Attention";
    case "idle":
    case "saved":
      return "In Review";
    case "error":
      return "Error";
    case "stopped":
      return "Stopped";
    default:
      return status;
  }
}

export function statusTheme(status: AgentStatus): StatusTheme | undefined {
  switch (status) {
    case "running":
      return "working";
    case "needs_input":
      return "attention";
    case "error":
      return "danger";
    case "idle":
    case "saved":
      return "review";
    default:
      return undefined;
  }
}
