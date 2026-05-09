import { AlertCircle, FileCode, MessageSquare } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import ReviewRunCommentCard from "./ReviewRunCommentCard";
import ReviewRunIssueCard from "./ReviewRunIssueCard";
import type { ReviewRunDetailViewModel } from "@/lib/review-runs/detail-view-model";

const STATUS_VARIANT: Record<string, "outline" | "default" | "secondary" | "destructive"> = {
  queued: "secondary",
  running: "default",
  succeeded: "outline",
  failed: "destructive",
  retrying: "secondary",
  cancelled: "outline",
};

export default function ReviewRunDetail({
  detail,
}: {
  detail: ReviewRunDetailViewModel;
}) {
  return (
    <div className="space-y-5">
      {/* Error banner */}
      {detail.isFailed && (
        <div className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
          <div>
            <p className="text-sm font-semibold">Review run failed</p>
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
      <div className="flex items-center gap-3">
        <Badge
          variant={STATUS_VARIANT[detail.status] ?? "secondary"}
          className="capitalize"
        >
          {detail.status}
        </Badge>
        <div>
          <h1 className="text-lg font-semibold">{detail.topbar.title}</h1>
          <p className="text-sm text-muted-foreground">
            {detail.topbar.summary}
          </p>
        </div>
      </div>

      {/* Metadata grid */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {detail.metadata.map((m) => (
          <div key={m.label}>
            <dt className="text-xs text-muted-foreground">{m.label}</dt>
            <dd className="mt-0.5 text-sm font-medium">{m.value}</dd>
          </div>
        ))}
      </div>

      {/* Summary */}
      {detail.summaryMd && (
        <Card>
          <CardContent className="p-4">
            <h2 className="mb-2 text-sm font-semibold">Summary</h2>
            <pre className="whitespace-pre-wrap text-sm text-muted-foreground font-sans">
              {detail.summaryMd}
            </pre>
          </CardContent>
        </Card>
      )}

      {/* Issues */}
      <section>
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
          <FileCode className="h-4 w-4" />
          Issues ({detail.issues.length})
        </h2>
        {detail.issues.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No issues found in this run.
          </p>
        ) : (
          <div className="space-y-2">
            {detail.issues.map((issue) => (
              <ReviewRunIssueCard key={issue.id} issue={issue} />
            ))}
          </div>
        )}
      </section>

      {/* Comments */}
      <section>
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
          <MessageSquare className="h-4 w-4" />
          Comments ({detail.comments.length})
        </h2>
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
      </section>
    </div>
  );
}
