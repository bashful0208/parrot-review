"use client";

import { useState } from "react";
import {
  AlertCircle,
  FileCode,
  MessageSquare,
  Activity,
  GitCommit,
  Calendar,
  Search,
  Hash,
  Target,
  Shield,
  Languages,
  Cpu,
  Flag,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import ReviewRunCommentCard from "./ReviewRunCommentCard";
import ReviewRunIssueCard from "./ReviewRunIssueCard";
import { MarkdownRenderer } from "@/components/ui/markdown";
import GraphTab from "./GraphTab";
import type { ReviewRunDetailViewModel } from "@/lib/review-runs/detail-view-model";

const STATUS_VARIANT: Record<string, "outline" | "default" | "secondary" | "destructive"> = {
  queued: "secondary",
  running: "default",
  succeeded: "outline",
  failed: "destructive",
  retrying: "secondary",
  cancelled: "outline",
};

const META_ICONS: Record<string, React.ReactNode> = {
  "Status": <Flag className="h-4 w-4" />,
  "Trigger": <Target className="h-4 w-4" />,
  "Review mode": <Search className="h-4 w-4" />,
  "Output language": <Languages className="h-4 w-4" />,
  "AI model": <Cpu className="h-4 w-4" />,
  "Base SHA": <GitCommit className="h-4 w-4" />,
  "Head SHA": <GitCommit className="h-4 w-4" />,
  "Started at": <Calendar className="h-4 w-4" />,
  "Finished at": <Calendar className="h-4 w-4" />,
  "Files analyzed": <FileCode className="h-4 w-4" />,
  "Total findings": <Search className="h-4 w-4" />,
  "Security findings": <Shield className="h-4 w-4" />,
};

const MONO_LABELS = new Set(["Base SHA", "Head SHA"]);

export default function ReviewRunDetail({
  detail,
}: {
  detail: ReviewRunDetailViewModel;
}) {
  const [tab, setTab] = useState("overview");

  return (
    <div className="space-y-6">
      {/* Error banner */}
      {detail.isFailed && (
        <div className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
          <div>
            <p className="text-sm font-medium">Review run failed</p>
            {detail.errorCode && (
              <p className="mt-0.5 text-sm text-muted-foreground">
                Code: {detail.errorCode}
              </p>
            )}
            {detail.errorMessage && (
              <p className="mt-0.5 text-sm text-muted-foreground">
                {detail.errorMessage}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Status header */}
      <div className="flex items-center gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border bg-card shadow-sm">
          <Activity className="h-5 w-5 text-primary" />
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-xl font-semibold tracking-[-0.03em]">
              {detail.topbar.title}
            </h1>
            <Badge
              variant={STATUS_VARIANT[detail.status] ?? "secondary"}
              className="capitalize"
            >
              {detail.status}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {detail.topbar.summary}
          </p>
        </div>
      </div>

      <Separator />

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList variant="line">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="graph">
            <Activity className="mr-1.5 h-4 w-4" />
            Graph
          </TabsTrigger>
          <TabsTrigger value="issues">
            <FileCode className="mr-1.5 h-4 w-4" />
            Issues ({detail.issues.length})
          </TabsTrigger>
          <TabsTrigger value="comments">
            <MessageSquare className="mr-1.5 h-4 w-4" />
            Comments ({detail.comments.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-6 space-y-6">
          {/* KPI cards grid */}
          <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
            {detail.metadata.map((m) => (
              <Card key={m.label}>
                <CardContent className="flex items-center gap-3 p-4">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                    {META_ICONS[m.label] ?? <Hash className="h-4 w-4" />}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-muted-foreground">
                      {m.label}
                    </p>
                    <p className={`text-sm font-semibold ${MONO_LABELS.has(m.label) ? "font-mono" : ""}`}>
                      {m.value}
                    </p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Summary */}
          {detail.summaryMd && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold tracking-[-0.02em]">
                  Summary
                </CardTitle>
              </CardHeader>
              <Separator />
              <CardContent className="pt-4">
                <div className="text-muted-foreground">
                  <MarkdownRenderer>{detail.summaryMd}</MarkdownRenderer>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="graph" className="mt-6">
          <GraphTab
            initial={detail.graphStatus}
            reviewRunId={detail.reviewRunId}
            status={detail.status}
          />
        </TabsContent>

        <TabsContent value="issues" className="mt-6">
          <IssuesTab issues={detail.issues} />
        </TabsContent>

        <TabsContent value="comments" className="mt-6">
          {detail.comments.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No comments posted for this run.
            </p>
          ) : (
            <div className="space-y-2">
              {detail.comments.map((comment) => (
                <ReviewRunCommentCard key={comment.id} comment={comment} />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function IssuesTab({
  issues,
}: {
  issues: ReviewRunDetailViewModel["issues"];
}) {
  const [showResolved, setShowResolved] = useState(false);
  const resolvedCount = issues.filter((i) => i.relation === "resolved").length;
  const visible = showResolved
    ? issues
    : issues.filter((i) => i.relation !== "resolved");

  if (issues.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No issues found in this run.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {resolvedCount > 0 && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>{resolvedCount} resolved in this run</span>
          <button
            type="button"
            onClick={() => setShowResolved((v) => !v)}
            className="underline underline-offset-2 hover:text-foreground"
          >
            {showResolved ? "Hide resolved" : "Show resolved"}
          </button>
        </div>
      )}
      <div className="space-y-2">
        {visible.map((issue) => (
          <ReviewRunIssueCard key={issue.id} issue={issue} />
        ))}
      </div>
    </div>
  );
}
