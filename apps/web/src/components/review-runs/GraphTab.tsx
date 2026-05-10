"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import {
  GitBranch,
  AlertTriangle,
  Layers,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
} from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import {
  type GraphStatusViewModel,
  type GraphPhase,
  getPhaseIndex,
  getPhaseTotal,
} from "@/lib/review-runs/graph-view-model";

const STATUS_COLORS: Record<string, string> = {
  completed: "bg-green-100 text-green-700 border-green-300",
  running: "bg-blue-100 text-blue-700 border-blue-300",
  pending: "bg-gray-100 text-gray-400 border-gray-200",
};

const STATUS_ICONS: Record<string, React.ReactNode> = {
  completed: <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />,
  running: <Loader2 className="h-3.5 w-3.5 text-blue-600 animate-spin" />,
  pending: <Clock className="h-3.5 w-3.5 text-gray-400" />,
};

const PHASE_STEPS: { phase: GraphPhase; label: string }[] = [
  { phase: "idle", label: "Waiting" },
  { phase: "reviewing", label: "Reviewing" },
  { phase: "aggregating", label: "Aggregating" },
  { phase: "reflecting", label: "Reflecting" },
  { phase: "summarizing", label: "Summarizing" },
  { phase: "complete", label: "Complete" },
];

function useMermaid(mermaidDef: string) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const render = useCallback(async () => {
    if (!mermaidDef) return;
    try {
      const mermaid = (await import("mermaid")).default;
      mermaid.initialize({
        startOnLoad: false,
        theme: "neutral",
        themeVariables: {
          fontFamily: "inherit",
          fontSize: "13px",
        },
        flowchart: { useMaxWidth: true, htmlLabels: true, curve: "basis" },
      });
      const id = "mermaid-graph-canvas";
      const { svg: rendered } = await mermaid.render(id, mermaidDef);
      setSvg(rendered);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to render diagram");
    }
  }, [mermaidDef]);

  useEffect(() => {
    void render();
  }, [render]);

  return { containerRef, svg, error };
}

export default function GraphTab({
  initial,
  reviewRunId,
  status,
}: {
  initial: GraphStatusViewModel;
  reviewRunId: string;
  status: string;
}) {
  const [data, setData] = useState<GraphStatusViewModel>(initial);
  const { containerRef, svg, error: mermaidError } = useMermaid(data.mermaidDef);

  const isLive = status === "running" || status === "queued";
  useEffect(() => {
    if (!isLive) return;

    const timer = setInterval(async () => {
      try {
        const res = await fetch(`/api/review-runs/${reviewRunId}/graph-status`);
        if (res.ok) {
          const json = await res.json();
          if (json.ok) setData(json.data);
        }
      } catch {
        // polling failure silently skipped
      }
    }, 5000);

    return () => clearInterval(timer);
  }, [isLive, reviewRunId]);

  const phaseIdx = getPhaseIndex(data.phase);
  const phaseTotal = getPhaseTotal();
  const phasePercent = Math.round((phaseIdx / phaseTotal) * 100);

  const emptyMessage = (() => {
    if (status === "queued")
      return {
        icon: <Clock className="h-5 w-5" />,
        text: "Review job is queued — waiting for worker to start...",
      };
    if (status === "running")
      return {
        icon: <Loader2 className="h-5 w-5 animate-spin" />,
        text: "Graph is starting up — first checkpoint not written yet...",
      };
    return {
      icon: <GitBranch className="h-5 w-5" />,
      text: "No graph data yet",
    };
  })();

  return (
    <div className="space-y-6">
      {!data.hasCheckpoint ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-3 py-16">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
              {emptyMessage.icon}
            </div>
            <p className="text-sm text-muted-foreground">{emptyMessage.text}</p>
            {data.diagnostic && (
              <p className="text-xs text-muted-foreground/60 max-w-md text-center font-mono">
                {data.diagnostic}
              </p>
            )}
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Phase progress */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold tracking-[-0.02em]">
                Progress
              </CardTitle>
            </CardHeader>
            <Separator />
            <CardContent className="pt-4 space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-medium">Phase: {data.phaseLabel}</h4>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {phasePercent}%
                </span>
              </div>
              <Progress value={phasePercent} className="h-2" />
              <div className="flex justify-between text-xs text-muted-foreground">
                {PHASE_STEPS.slice(1).map((step) => {
                  const si = getPhaseIndex(step.phase);
                  const active = si <= phaseIdx;
                  return (
                    <span
                      key={step.phase}
                      className={cn(
                        "flex items-center gap-1",
                        active && "text-foreground font-medium"
                      )}
                    >
                      {si < phaseIdx ? (
                        <CheckCircle2 className="h-3 w-3 text-green-600" />
                      ) : si === phaseIdx ? (
                        <Loader2 className="h-3 w-3 animate-spin text-blue-600" />
                      ) : (
                        <span className="h-3 w-3 rounded-full border border-muted-foreground/30" />
                      )}
                      {step.label}
                    </span>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Mermaid diagram */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold tracking-[-0.02em]">
                Review Graph
              </CardTitle>
            </CardHeader>
            <Separator />
            <CardContent className="pt-4">
              {mermaidError ? (
                <p className="text-sm text-destructive">{mermaidError}</p>
              ) : svg ? (
                <div
                  ref={containerRef}
                  className="flex justify-center overflow-x-auto"
                  dangerouslySetInnerHTML={{ __html: svg }}
                />
              ) : (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              )}
            </CardContent>
          </Card>

          {/* Node status list */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold tracking-[-0.02em]">
                Node Status
              </CardTitle>
            </CardHeader>
            <Separator />
            <CardContent className="pt-4 space-y-2">
              {data.nodes.map((node) => (
                <div
                  key={node.id}
                  className="flex items-center justify-between rounded-lg border px-3 py-2 transition-colors hover:bg-muted/50"
                >
                  <div className="flex items-center gap-2">
                    {STATUS_ICONS[node.status] ?? STATUS_ICONS.pending}
                    <span className="text-sm">{node.label}</span>
                  </div>
                  <Badge
                    variant="outline"
                    className={cn(
                      "text-xs capitalize",
                      STATUS_COLORS[node.status] ?? STATUS_COLORS.pending
                    )}
                  >
                    {node.status}
                  </Badge>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Metrics cards */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            <MetricCard
              label="Draft Findings"
              value={data.metrics.draftFindingsCount}
              icon={<Layers className="h-4 w-4" />}
            />
            <MetricCard
              label="After Dedup"
              value={data.metrics.aggregatedFindingsCount}
              icon={<GitBranch className="h-4 w-4" />}
            />
            <MetricCard
              label="Approved"
              value={data.metrics.perFindingApproved}
              icon={<CheckCircle2 className="h-4 w-4" />}
              iconClass="text-green-600"
            />
            <MetricCard
              label="Exhausted"
              value={data.metrics.perFindingExhausted}
              icon={<XCircle className="h-4 w-4" />}
              iconClass="text-orange-500"
            />
            <MetricCard
              label="Final Findings"
              value={data.metrics.finalFindingsCount}
              icon={<Layers className="h-4 w-4" />}
            />
            <MetricCard
              label="Summary"
              value={data.metrics.hasSummary ? "Done" : "Pending"}
              icon={
                data.metrics.hasSummary ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : (
                  <Clock className="h-4 w-4" />
                )
              }
              iconClass={data.metrics.hasSummary ? "text-green-600" : ""}
            />
          </div>

          {/* Errors summary */}
          {(data.reviewerErrors > 0 ||
            data.criticErrors > 0 ||
            data.summaryError) && (
            <Card className="border-destructive/30 bg-destructive/5">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-sm font-semibold text-destructive">
                  <AlertTriangle className="h-4 w-4" />
                  Errors
                </CardTitle>
              </CardHeader>
              <Separator className="border-destructive/20" />
              <CardContent className="pt-4 space-y-2">
                {data.reviewerErrors > 0 && (
                  <p className="text-sm text-muted-foreground">
                    Reviewer errors: {data.reviewerErrors}
                  </p>
                )}
                {data.criticErrors > 0 && (
                  <p className="text-sm text-muted-foreground">
                    Critic errors: {data.criticErrors}
                  </p>
                )}
                {data.summaryError && (
                  <p className="text-sm text-muted-foreground">
                    Summary error: {data.summaryError}
                  </p>
                )}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

function MetricCard({
  label,
  value,
  icon,
  iconClass,
}: {
  label: string;
  value: number | string;
  icon: React.ReactNode;
  iconClass?: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground",
          iconClass
        )}>
          {icon}
        </div>
        <div className="min-w-0">
          <p className="text-xs font-medium text-muted-foreground">{label}</p>
          <p className="text-sm font-semibold tabular-nums">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}
