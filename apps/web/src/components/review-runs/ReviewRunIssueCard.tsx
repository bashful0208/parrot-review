import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import type { ReviewRunIssueItem } from "@/lib/review-runs/detail-view-model";

const SEVERITY_VARIANT: Record<string, "outline" | "default" | "secondary" | "destructive"> = {
  critical: "destructive",
  high: "default",
  medium: "secondary",
  low: "outline",
};

export default function ReviewRunIssueCard({
  issue,
}: {
  issue: ReviewRunIssueItem;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-1.5">
          <Badge
            variant={SEVERITY_VARIANT[issue.severity] ?? "secondary"}
            className="capitalize"
          >
            {issue.severity}
          </Badge>
          <Badge variant="outline">{issue.issueType}</Badge>
          <span className="text-xs text-muted-foreground">
            {issue.confidencePercent} confidence
          </span>
        </div>
        <h4 className="text-sm font-semibold">{issue.title}</h4>
        <p className="mt-1 text-sm text-muted-foreground">{issue.summary}</p>
        {issue.fileLocation && (
          <p className="mt-1.5 font-mono text-xs text-muted-foreground">
            {issue.fileLocation}
          </p>
        )}
        {issue.suggestion && (
          <div className="mt-2 rounded-md bg-muted p-3">
            <p className="text-xs font-medium text-muted-foreground mb-1">
              Suggestion
            </p>
            <pre className="whitespace-pre-wrap text-sm font-sans">
              {issue.suggestion}
            </pre>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
