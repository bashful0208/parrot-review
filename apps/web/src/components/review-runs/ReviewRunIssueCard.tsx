import { Lightbulb } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { MarkdownRenderer } from "@/components/ui/markdown";
import type { ReviewRunIssueItem } from "@/lib/review-runs/detail-view-model";

const SEVERITY_VARIANT: Record<string, "outline" | "default" | "secondary" | "destructive"> = {
  critical: "destructive",
  high: "default",
  medium: "secondary",
  low: "outline",
};

const RELATION_LABEL: Record<string, string> = {
  new: "New",
  persisted: "Persisted",
  resolved: "Resolved",
};

const RELATION_VARIANT: Record<string, "outline" | "default" | "secondary" | "destructive"> = {
  new: "default",
  persisted: "secondary",
  resolved: "outline",
};

export default function ReviewRunIssueCard({
  issue,
}: {
  issue: ReviewRunIssueItem;
}) {
  const isResolved = issue.relation === "resolved";
  return (
    <Card className={isResolved ? "opacity-60" : undefined}>
      <CardContent className="p-4">
        <div className="flex flex-wrap items-center gap-2 mb-1.5">
          <Badge
            variant={SEVERITY_VARIANT[issue.severity] ?? "secondary"}
            className="capitalize"
          >
            {issue.severity}
          </Badge>
          <Badge variant="outline">{issue.issueType}</Badge>
          <Badge variant={RELATION_VARIANT[issue.relation] ?? "outline"}>
            {RELATION_LABEL[issue.relation] ?? issue.relation}
          </Badge>
          <span className="text-xs text-muted-foreground">
            {issue.confidencePercent} confidence
          </span>
        </div>
        <h4 className="text-sm font-semibold">{issue.title}</h4>
        <p className="mt-1 text-sm text-muted-foreground">{issue.summary}</p>
        {issue.fileLocation && (
          <span className="inline-block mt-1.5 rounded-md border bg-muted/50 px-2 py-0.5 font-mono text-xs text-muted-foreground">
            {issue.fileLocation}
          </span>
        )}
        {issue.suggestion && (
          <div className="mt-2 rounded-lg border bg-muted/50 p-3">
            <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground mb-1">
              <Lightbulb className="h-3.5 w-3.5" />
              Suggestion
            </p>
            <MarkdownRenderer>{issue.suggestion}</MarkdownRenderer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
