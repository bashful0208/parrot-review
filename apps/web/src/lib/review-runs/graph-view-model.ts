import type { GraphProgress, GraphNodeState, GraphMetrics } from "@reviewer/core";

export interface GraphNodeViewModel {
  id: string;
  label: string;
  status: "pending" | "running" | "completed";
  type: "reviewer" | "aggregator" | "critic" | "collect" | "summarizer";
  startedAt: string | null;
  completedAt: string | null;
  durationMs: number | null;
}

export interface GraphMetricsViewModel {
  draftFindingsCount: number;
  aggregatedFindingsCount: number;
  perFindingApproved: number;
  perFindingExhausted: number;
  perFindingPending: number;
  finalFindingsCount: number;
  hasSummary: boolean;
}

export type GraphPhase = "idle" | "reviewing" | "aggregating" | "reflecting" | "summarizing" | "complete";

export interface GraphStatusViewModel {
  graphThreadId: string;
  phase: GraphPhase;
  phaseLabel: string;
  metrics: GraphMetricsViewModel;
  reviewerErrors: number;
  criticErrors: number;
  summaryError: string | null;
  updatedAt: string | null;
  nodes: GraphNodeViewModel[];
  mermaidDef: string;
  hasCheckpoint: boolean;
  diagnostic: string | null;
}

const PHASE_LABELS: Record<string, string> = {
  idle: "Waiting to start",
  reviewing: "Reviewing code",
  aggregating: "Aggregating findings",
  reflecting: "Critic reflection",
  summarizing: "Generating summary",
  complete: "Complete",
};

const PHASE_ORDER = ["idle", "reviewing", "aggregating", "reflecting", "summarizing", "complete"];

function buildMermaidDef(nodes: GraphNodeViewModel[]): string {
  const statusClass = (id: string) => {
    const node = nodes.find((n) => n.id === id);
    if (!node || node.status === "pending") return ":::pending";
    if (node.status === "running") return ":::running";
    return ":::done";
  };

  return [
    "graph TD",
    `  START --> quality_reviewer${statusClass("quality_reviewer")}`,
    `  START --> security_reviewer${statusClass("security_reviewer")}`,
    `  START --> error_handler_reviewer${statusClass("error_handler_reviewer")}`,
    `  quality_reviewer${statusClass("quality_reviewer")} --> aggregator${statusClass("aggregator")}`,
    `  security_reviewer${statusClass("security_reviewer")} --> aggregator${statusClass("aggregator")}`,
    `  error_handler_reviewer${statusClass("error_handler_reviewer")} --> aggregator${statusClass("aggregator")}`,
    `  aggregator${statusClass("aggregator")} --> fanOutFindings{{fanOutFindings}}`,
    `  fanOutFindings -->|pending findings| critic${statusClass("critic")}`,
    `  fanOutFindings -->|no pending| collect_findings${statusClass("collect_findings")}`,
    `  critic${statusClass("critic")} --> collect_findings${statusClass("collect_findings")}`,
    `  collect_findings${statusClass("collect_findings")} --> summarizer${statusClass("summarizer")}`,
    `  summarizer${statusClass("summarizer")} --> END`,
    "  classDef done fill:#dcfce7,stroke:#22c55e,stroke-width:2px",
    "  classDef running fill:#dbeafe,stroke:#3b82f6,stroke-width:2px",
    "  classDef pending fill:#f3f4f6,stroke:#d1d5db,stroke-width:1px,color:#9ca3af",
  ].join("\n");
}

export function buildGraphStatusViewModel(
  progress: GraphProgress | null,
  diagnostic?: string
): GraphStatusViewModel {
  const nodes: GraphNodeViewModel[] = progress?.nodes ?? [
    { id: "quality_reviewer", label: "Quality Reviewer", status: "pending", type: "reviewer", startedAt: null, completedAt: null, durationMs: null },
    { id: "security_reviewer", label: "Security Reviewer", status: "pending", type: "reviewer", startedAt: null, completedAt: null, durationMs: null },
    { id: "error_handler_reviewer", label: "Error Handler Reviewer", status: "pending", type: "reviewer", startedAt: null, completedAt: null, durationMs: null },
    { id: "aggregator", label: "Aggregator", status: "pending", type: "aggregator", startedAt: null, completedAt: null, durationMs: null },
    { id: "critic", label: "Critic", status: "pending", type: "critic", startedAt: null, completedAt: null, durationMs: null },
    { id: "collect_findings", label: "Collect Findings", status: "pending", type: "collect", startedAt: null, completedAt: null, durationMs: null },
    { id: "summarizer", label: "Summarizer", status: "pending", type: "summarizer", startedAt: null, completedAt: null, durationMs: null },
  ];

  const m = progress?.metrics;
  const metrics: GraphMetricsViewModel = {
    draftFindingsCount: m?.draftFindingsCount ?? 0,
    aggregatedFindingsCount: m?.aggregatedFindingsCount ?? 0,
    perFindingApproved: m?.perFindingApproved ?? 0,
    perFindingExhausted: m?.perFindingExhausted ?? 0,
    perFindingPending: (m?.perFindingTotal ?? 0) - (m?.perFindingApproved ?? 0) - (m?.perFindingExhausted ?? 0),
    finalFindingsCount: m?.finalFindingsCount ?? 0,
    hasSummary: m?.hasSummary ?? false,
  };

  return {
    graphThreadId: progress?.graphThreadId ?? "unknown",
    phase: progress?.phase ?? "idle",
    phaseLabel: PHASE_LABELS[progress?.phase ?? "idle"] ?? "Unknown",
    metrics,
    reviewerErrors: progress?.reviewerErrors ?? 0,
    criticErrors: progress?.criticErrors ?? 0,
    summaryError: progress?.summaryError ?? null,
    updatedAt: progress?.updatedAt ?? null,
    nodes,
    mermaidDef: buildMermaidDef(nodes),
    hasCheckpoint: progress !== null,
    diagnostic: diagnostic ?? null,
  };
}

export function getPhaseIndex(phase: GraphPhase): number {
  return PHASE_ORDER.indexOf(phase);
}

export function getPhaseTotal(): number {
  return PHASE_ORDER.length - 1; // exclude idle
}
