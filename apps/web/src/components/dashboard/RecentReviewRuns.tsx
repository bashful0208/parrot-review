import type { DashboardRun } from "@/lib/dashboard/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const statusVariant: Record<DashboardRun["status"], "outline" | "default" | "secondary" | "destructive"> = {
  queued: "secondary",
  running: "default",
  succeeded: "outline",
  failed: "destructive",
};

export default function RecentReviewRuns({ runs }: { runs: DashboardRun[] }) {
  if (runs.length === 0) {
    return (
      <Card className="rounded-2xl">
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold tracking-[-0.03em]">
                Recent review runs
              </h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                No review activity yet. Start your first review to populate this workspace.
              </p>
            </div>
            <Badge variant="outline">Live queue</Badge>
          </div>
          <a
            href="/api/reviews/enqueue"
            className="mt-5 inline-flex h-10 items-center justify-center rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Start your first review
          </a>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="rounded-2xl">
      <CardHeader className="pb-0">
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle className="text-base tracking-[-0.03em]">
              Recent review runs
            </CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Continue active work and spot runs that need attention.
            </p>
          </div>
          <Badge variant="outline">Live queue</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-2 p-4">
        {runs.map((run) => (
          <article
            key={run.id}
            className="rounded-xl border bg-muted/30 px-4 py-3"
          >
            <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0 space-y-0.5">
                <p className="text-xs font-medium text-muted-foreground">
                  {run.repositoryName} · {run.pullRequestLabel}
                </p>
                <h3 className="text-sm font-semibold tracking-[-0.02em]">
                  {run.title}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {run.startedAtLabel}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                <Badge variant={statusVariant[run.status]} className="capitalize">
                  {run.status}
                </Badge>
                <Badge>{run.severityLabel}</Badge>
              </div>
            </div>
          </article>
        ))}
      </CardContent>
    </Card>
  );
}
