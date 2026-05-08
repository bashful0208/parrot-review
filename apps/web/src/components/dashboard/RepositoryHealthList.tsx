import type { RepositoryHealthItem } from "@/lib/dashboard/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const repositoryStatusVariant: Record<
  RepositoryHealthItem["status"],
  "outline" | "default" | "secondary" | "destructive"
> = {
  connected: "default",
  attention: "destructive",
  pending: "secondary",
};

export default function RepositoryHealthList({
  repositories,
}: {
  repositories: RepositoryHealthItem[];
}) {
  if (repositories.length === 0) {
    return (
      <Card className="rounded-2xl">
        <CardContent className="p-4">
          <h2 className="text-base font-semibold tracking-[-0.03em]">
            Repository health
          </h2>
          <p className="mt-4 text-sm leading-6 text-muted-foreground">
            No repositories are connected yet. Connect a repository to start organization-level review tracking.
          </p>
          <a
            href="/settings/repositories"
            className="mt-5 inline-flex h-10 items-center justify-center rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Connect Repository
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
              Repository health
            </CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Focus the organization on repositories that need intervention first.
            </p>
          </div>
          <Badge variant="outline">Prioritized</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-2 p-4">
        {repositories.map((repo) => (
          <article
            key={repo.id}
            className="flex flex-col gap-2 rounded-xl border bg-muted/30 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="min-w-0">
              <h3 className="text-sm font-semibold tracking-[-0.02em]">
                {repo.name}
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {repo.lastReviewLabel}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 sm:justify-end">
              <Badge>{repo.openFindings} open findings</Badge>
              <Badge variant={repositoryStatusVariant[repo.status]} className="capitalize">
                {repo.status}
              </Badge>
            </div>
          </article>
        ))}
      </CardContent>
    </Card>
  );
}
