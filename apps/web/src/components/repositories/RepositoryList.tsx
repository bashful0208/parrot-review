import Link from "next/link";
import { ChevronRight, GitBranch, Plus } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import type { RepositoryItem } from "@/lib/repositories/view-model";
import ConnectRepositoryDialog from "./ConnectRepositoryDialog";

const repositoryStatusVariant: Record<
  string,
  "outline" | "default" | "secondary" | "destructive"
> = {
  active: "secondary",
  inactive: "secondary",
  error: "destructive",
};

function ProviderIcon({
  provider,
  className,
}: {
  provider: string;
  className?: string;
}) {
  if (provider === "github") {
    return (
      <svg
        viewBox="0 0 24 24"
        className={className}
        fill="currentColor"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
      </svg>
    );
  }
  if (provider === "gitee") {
    return (
      <svg
        viewBox="0 0 24 24"
        className={className}
        fill="currentColor"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path d="M11.984 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.016 0zm6.09 5.333c.328 0 .593.266.592.593v1.482a.594.594 0 0 1-.593.592H9.777c-.982 0-1.778.796-1.778 1.778v5.63c0 .327.266.592.593.592h5.63c.982 0 1.778-.796 1.778-1.778v-.296a.593.593 0 0 0-.592-.593h-4.15a.592.592 0 0 1-.592-.592v-1.482a.593.593 0 0 1 .593-.592h6.815c.327 0 .593.265.593.592v3.408a4 4 0 0 1-4 4H5.926a.593.593 0 0 1-.593-.593V9.778a4.444 4.444 0 0 1 4.445-4.444h8.296z" />
      </svg>
    );
  }
  return <GitBranch className={className} />;
}

function StatCard({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <Card className="rounded-xl">
      <CardContent className="px-3 py-2.5">
        <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
          {label}
        </p>
        <p className="mt-0.5 text-2xl font-semibold tracking-[-0.05em]">
          {value}
        </p>
      </CardContent>
    </Card>
  );
}

export default function RepositoryList({
  repositories,
}: {
  repositories: RepositoryItem[];
}) {
  if (repositories.length === 0) {
    return (
      <Card className="rounded-2xl">
        <CardContent className="p-8">
          <div className="flex flex-col items-center py-8 text-center">
            <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-muted/50 ring-1 ring-border">
              <GitBranch className="h-7 w-7 text-muted-foreground/60" />
            </div>
            <h2 className="text-lg font-semibold tracking-[-0.03em]">
              No repositories connected yet
            </h2>
            <p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">
              Connect your first repository to start receiving AI-powered code
              reviews on pull requests.
            </p>
            <div className="mt-6">
              <ConnectRepositoryDialog
                triggerLabel="Connect Repository"
                triggerClassName="rounded-xl px-5 py-2.5 text-sm"
              />
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  const stats = {
    total: repositories.length,
    active: repositories.filter((r) => r.status === "active").length,
    inactive: repositories.filter((r) => r.status !== "active").length,
    providers: new Set(repositories.map((r) => r.provider)).size,
  };

  return (
    <div className="space-y-5">
      {/* Stats KPI row */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total" value={stats.total} />
        <StatCard label="Active" value={stats.active} />
        <StatCard label="Inactive" value={stats.inactive} />
        <StatCard label="Providers" value={stats.providers} />
      </div>

      {/* Repository grid */}
      <Card className="rounded-2xl">
        <CardHeader className="pb-0">
          <div className="flex items-center justify-between gap-4">
            <CardTitle className="text-base tracking-[-0.03em]">
              Connected Repositories
            </CardTitle>
            <Badge variant="secondary" className="shrink-0">
              {repositories.length}
            </Badge>
          </div>
        </CardHeader>
        <div className="px-5 pt-4">
          <Separator />
        </div>
        <CardContent className="p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {repositories.map((repo) => (
              <Link
                key={repo.id}
                href={`/repositories/${repo.id}`}
                className="group flex items-start gap-3.5 rounded-xl border bg-card p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/20 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border bg-muted/60">
                  <ProviderIcon
                    provider={repo.provider}
                    className="h-5 w-5 text-muted-foreground"
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-semibold tracking-[-0.02em] leading-snug line-clamp-1">
                    {repo.fullName}
                  </h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {repo.createdAtLabel}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <Badge variant="secondary" className="text-[11px]">
                      {repo.provider}
                    </Badge>
                    <Badge
                      variant={
                        repositoryStatusVariant[repo.status] ?? "secondary"
                      }
                      className="text-[11px] capitalize"
                    >
                      {repo.status}
                    </Badge>
                  </div>
                </div>
                <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground/20 transition-colors group-hover:text-muted-foreground" />
              </Link>
            ))}

            <ConnectRepositoryDialog
              triggerLabel="Connect Repository"
              triggerClassName="flex h-full w-full flex-col items-center justify-center gap-2.5 rounded-xl border border-dashed border-border bg-transparent p-5 text-sm font-medium text-muted-foreground shadow-none transition-colors hover:border-muted-foreground/30 hover:bg-muted/50 hover:text-foreground"
              triggerVariant="ghost"
            >
              <Plus className="h-5 w-5" />
              Connect Repository
            </ConnectRepositoryDialog>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
