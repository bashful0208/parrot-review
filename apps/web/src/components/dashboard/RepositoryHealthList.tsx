import type { RepositoryHealthItem } from "@/lib/dashboard/types";

const repositoryStatusClasses: Record<RepositoryHealthItem["status"], string> = {
  connected: "bg-emerald-100 text-emerald-800",
  attention: "bg-amber-100 text-amber-800",
  pending: "bg-zinc-100 text-zinc-700",
};

export default function RepositoryHealthList({
  repositories,
}: {
  repositories: RepositoryHealthItem[];
}) {
  if (repositories.length === 0) {
    return (
      <section className="rounded-[28px] border border-white/70 bg-white/90 p-6 shadow-[0_18px_50px_rgba(15,23,42,0.07)]">
        <h2 className="text-2xl font-semibold tracking-[-0.05em] text-zinc-950">
          Repository health
        </h2>
        <p className="mt-4 text-sm leading-6 text-zinc-600">
          No repositories are connected yet. Connect a repository to start organization-level review tracking.
        </p>
        <a
          href="/settings/repositories"
          className="mt-5 inline-flex rounded-full bg-zinc-950 px-4 py-2 text-sm font-medium text-white"
        >
          Connect Repository
        </a>
      </section>
    );
  }

  return (
    <section className="rounded-[28px] border border-white/70 bg-white/90 p-6 shadow-[0_18px_50px_rgba(15,23,42,0.07)]">
      <div className="mb-5">
        <h2 className="text-2xl font-semibold tracking-[-0.05em] text-zinc-950">Repository health</h2>
        <p className="mt-1 text-sm text-zinc-500">Focus the organization on repositories that need intervention first.</p>
      </div>
      <div className="space-y-3">
        {repositories.map((repository) => (
          <article key={repository.id} className="flex flex-col gap-3 rounded-[22px] border border-zinc-100 bg-zinc-50/80 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-lg font-semibold tracking-[-0.03em] text-zinc-950">{repository.name}</h3>
              <p className="text-sm text-zinc-600">{repository.lastReviewLabel}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-zinc-950 px-3 py-1 text-xs font-medium text-white">
                {repository.openFindings} open findings
              </span>
              <span className={`rounded-full px-3 py-1 text-xs font-medium ${repositoryStatusClasses[repository.status]}`}>
                {repository.status}
              </span>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
