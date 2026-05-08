import Link from "next/link";
import { GitBranch } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { RepositoryItem } from "@/lib/repositories/view-model";
import ConnectRepositoryDialog from "./ConnectRepositoryDialog";

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
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-muted">
              <GitBranch className="h-5 w-5 text-muted-foreground" />
            </div>
            <h2 className="text-base font-semibold tracking-[-0.03em]">
              No repositories connected yet
            </h2>
            <p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">
              Connect your first repository to start receiving AI-powered code reviews on pull requests.
            </p>
            <div className="mt-6">
              <ConnectRepositoryDialog
                triggerLabel="Connect Repository"
                triggerClassName="rounded-2xl px-5 py-2.5 text-sm"
              />
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="rounded-2xl">
      <div className="flex items-center justify-between gap-4 border-b px-5 py-3.5">
        <h2 className="text-sm font-semibold tracking-[-0.02em]">
          Connected Repositories
          <Badge variant="secondary" className="ml-2">
            {repositories.length}
          </Badge>
        </h2>
        <ConnectRepositoryDialog
          triggerLabel="+ Connect"
          triggerVariant="outline"
          triggerSize="sm"
        />
      </div>

      <CardContent className="p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {repositories.map((repo) => (
            <Link
              key={repo.id}
              href={`/repositories/${repo.id}`}
              className="rounded-xl border bg-card p-4 shadow-sm transition-all hover:border-primary/20 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <div className="mb-3 flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[9px] border bg-muted">
                  <GitBranch className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-sm font-semibold tracking-[-0.02em]">
                    {repo.fullName}
                  </h3>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {repo.createdAtLabel}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <Badge variant="outline">{repo.provider}</Badge>
                <Badge
                  variant="outline"
                  className={
                    repo.status === "active"
                      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                      : "bg-muted text-muted-foreground"
                  }
                >
                  {repo.status}
                </Badge>
              </div>
            </Link>
          ))}

          <ConnectRepositoryDialog
            triggerLabel="Connect Repository"
            triggerClassName="flex h-full min-h-[108px] w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-transparent p-4 text-sm font-medium text-muted-foreground shadow-none hover:border-muted-foreground/50 hover:bg-muted hover:text-foreground"
            triggerVariant="ghost"
          />
        </div>
      </CardContent>
    </Card>
  );
}
