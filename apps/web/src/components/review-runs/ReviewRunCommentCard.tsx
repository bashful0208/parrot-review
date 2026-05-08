import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import type { ReviewRunCommentItem } from "@/lib/review-runs/detail-view-model";

const COMMENT_STATUS_VARIANT: Record<string, "outline" | "default" | "secondary" | "destructive"> = {
  draft: "secondary",
  posted: "outline",
  skipped: "secondary",
  failed: "destructive",
  hidden: "outline",
};

export default function ReviewRunCommentCard({
  comment,
}: {
  comment: ReviewRunCommentItem;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-2">
          <Badge
            variant={COMMENT_STATUS_VARIANT[comment.status] ?? "secondary"}
            className="capitalize"
          >
            {comment.status}
          </Badge>
          {comment.isInline && (
            <span className="text-xs text-muted-foreground">Inline</span>
          )}
          {comment.provider && (
            <Badge variant="outline">{comment.provider}</Badge>
          )}
          {comment.fileLocation && (
            <span className="font-mono text-xs text-muted-foreground">
              {comment.fileLocation}
            </span>
          )}
          <span className="text-xs text-muted-foreground ml-auto">
            {comment.postedAtLabel ? `Posted ${comment.postedAtLabel}` : "Not posted"}
          </span>
        </div>
        <pre className="whitespace-pre-wrap text-sm font-sans">
          {comment.body}
        </pre>
      </CardContent>
    </Card>
  );
}
