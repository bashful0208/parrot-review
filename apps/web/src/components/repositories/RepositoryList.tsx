import Link from "next/link";
import { GitBranch } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import type { RepositoryItem } from "@/lib/repositories/view-model";
import ConnectRepositoryDialog from "./ConnectRepositoryDialog";

export default function RepositoryList({
  repositories,
}: {
  repositories: RepositoryItem[];
}) {
  if (repositories.length === 0) {
    return (
      <section className="rounded-[20px] border border-slate-200/80 bg-white/92 p-8 shadow-[0_10px_30px_rgba(15,23,42,0.06)]">
        <div className="flex flex-col items-center py-8 text-center">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-zinc-100">
            <GitBranch className="h-5 w-5 text-zinc-500" />
          </div>
          <h2 className="text-base font-semibold tracking-[-0.03em] text-zinc-950">
            No repositories connected yet
          </h2>
          <p className="mt-2 max-w-sm text-sm leading-6 text-zinc-500">
            Connect your first repository to start receiving AI-powered code reviews on pull requests.
          </p>
          <div className="mt-6">
            <ConnectRepositoryDialog
              triggerLabel="Connect Repository"
              triggerClassName="rounded-2xl px-5 py-2.5 text-sm"
            />
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-[20px] border border-slate-200/80 bg-white/92 shadow-[0_10px_30px_rgba(15,23,42,0.06)]">
      <div className="flex items-center justify-between gap-4 border-b border-slate-100 px-5 py-3.5">
        <h2 className="text-sm font-semibold tracking-[-0.02em] text-zinc-950">
          Connected Repositories
          <span className="ml-2 rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-500">
            {repositories.length}
          </span>
        </h2>
        <ConnectRepositoryDialog
          triggerLabel="+ Connect"
          triggerVariant="outline"
          triggerSize="sm"
        />
      </div>

      <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2">
        {repositories.map((repo) => (
          <Link
            key={repo.id}
            href={`/repositories/${repo.id}`}
            className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-all hover:border-slate-300 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <div className="mb-3 flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[9px] border border-slate-200 bg-slate-50">
                <GitBranch className="h-4 w-4 text-slate-500" />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="truncate text-sm font-semibold tracking-[-0.02em] text-zinc-950">
                  {repo.fullName}
                </h3>
                <p className="mt-0.5 text-xs text-zinc-400">{repo.createdAtLabel}</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <Badge variant="outline" className="text-xs text-zinc-500">
                {repo.provider}
              </Badge>
              <Badge
                variant="outline"
                className={
                  repo.status === "active"
                    ? "border-emerald-200 bg-emerald-50 text-xs text-emerald-700"
                    : "border-zinc-200 bg-zinc-100 text-xs text-zinc-600"
                }
              >
                {repo.status}
              </Badge>
            </div>
          </Link>
        ))}

        <ConnectRepositoryDialog
          triggerLabel="Connect Repository"
          triggerClassName="flex h-full min-h-[108px] w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 bg-transparent p-4 text-sm font-medium text-slate-400 shadow-none hover:border-slate-400 hover:bg-slate-50 hover:text-slate-500"
          triggerVariant="ghost"
        />
      </div>
    </section>
  );
}
