import Link from "next/link";
import { FileText, AlertTriangle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import type { ReviewRunListItem } from "@/lib/review-runs/list-view-model";

const STATUS_VARIANT: Record<string, "outline" | "default" | "secondary" | "destructive"> = {
  queued: "secondary",
  running: "default",
  succeeded: "outline",
  failed: "destructive",
  retrying: "secondary",
  cancelled: "outline",
};

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed px-6 py-16 text-center">
      <FileText className="mb-4 h-10 w-10 text-muted-foreground/50" />
      <h3 className="text-sm font-semibold">No review runs yet</h3>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">
        Automated review runs appear here after a connected repository receives
        a pull request or a manual review is triggered.
      </p>
      <Link
        href="/repositories"
        className="mt-4 inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
      >
        Connect a repository
      </Link>
    </div>
  );
}

export default function ReviewRunList({
  runs,
}: {
  runs: ReviewRunListItem[];
}) {
  if (runs.length === 0) return <EmptyState />;

  return (
    <div className="space-y-2">
      {runs.map((run) => (
        <Link
          key={run.id}
          href={run.detailHref}
          className="block rounded-lg border bg-card p-4 transition-colors hover:bg-accent/50"
        >
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span className="font-medium text-foreground truncate">
                  {run.repositoryFullName}
                </span>
                <span>·</span>
                <span className="font-mono">{run.prLabel}</span>
              </div>
              <p className="mt-0.5 text-sm truncate">{run.prTitle}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {run.securityFindingsCount > 0 ? (
                <Badge
                  variant="destructive"
                  className="gap-1"
                >
                  <AlertTriangle className="h-3 w-3" />
                  {run.securityFindingsCount} security
                </Badge>
              ) : run.findingsCount > 0 ? (
                <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-800">
                  {run.findingsCount} findings
                </Badge>
              ) : (
                <Badge variant="secondary">No findings</Badge>
              )}
              <Badge
                variant={STATUS_VARIANT[run.status] ?? "secondary"}
                className="capitalize"
              >
                {run.status}
              </Badge>
              <span className="hidden text-xs text-muted-foreground sm:inline w-20 text-right">
                {run.startedAtLabel}
              </span>
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}
