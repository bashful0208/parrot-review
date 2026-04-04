import type { RepositoryHealthItem } from "@/lib/dashboard/types";

const repositoryStatusClasses: Record<RepositoryHealthItem["status"], string> = {
  connected: "border-emerald-200 bg-emerald-50 text-emerald-800",
  attention: "border-amber-200 bg-amber-50 text-amber-800",
  pending: "border-zinc-200 bg-zinc-100 text-zinc-700",
};

export default function RepositoryHealthList({
  repositories,
}: {
  repositories: RepositoryHealthItem[];
}) {
  if (repositories.length === 0) {
    return (
      <section className="rounded-[24px] border border-slate-200/80 bg-white/92 p-5 shadow-[0_10px_30px_rgba(15,23,42,0.06)] sm:p-6">
        <h2 className="text-2xl font-semibold tracking-[-0.05em] text-zinc-950">
          Repository health
        </h2>
        <p className="mt-4 text-sm leading-6 text-zinc-600">
          No repositories are connected yet. Connect a repository to start organization-level review tracking.
        </p>
        <a
          href="/settings/repositories"
          className="mt-5 inline-flex min-h-11 items-center rounded-full bg-zinc-950 px-4 py-2 text-sm font-medium text-white"
        >
          Connect Repository
        </a>
      </section>
    );
  }

  return (
    <section className="rounded-[24px] border border-slate-200/80 bg-white/92 p-5 shadow-[0_10px_30px_rgba(15,23,42,0.06)] sm:p-6">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold tracking-[-0.05em] text-zinc-950">
            Repository health
          </h2>
          <p className="mt-1 text-sm text-zinc-500">
            Focus the organization on repositories that need intervention first.
          </p>
        </div>
        <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] text-slate-600">
          Prioritized
        </span>
      </div>
      <div className="space-y-3">
        {repositories.map((repository) => (
          <article
            key={repository.id}
            className="flex flex-col gap-3 rounded-[22px] border border-slate-200/70 bg-slate-50/70 p-4 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="min-w-0">
              <h3 className="text-lg font-semibold tracking-[-0.03em] text-zinc-950">
                {repository.name}
              </h3>
              <p className="mt-1 text-sm text-zinc-600">{repository.lastReviewLabel}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2 sm:justify-end">
              <span className="rounded-full bg-zinc-950 px-3 py-1 text-xs font-medium text-white">
                {repository.openFindings} open findings
              </span>
              <span
                className={`rounded-full border px-3 py-1 text-xs font-medium capitalize ${repositoryStatusClasses[repository.status]}`}
              >
                {repository.status}
              </span>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
