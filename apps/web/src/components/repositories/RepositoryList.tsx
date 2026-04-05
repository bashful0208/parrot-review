import type { RepositoryItem } from "@/lib/repositories/view-model";

const statusClasses: Record<string, string> = {
  active: "border-emerald-200 bg-emerald-50 text-emerald-800",
  disabled: "border-zinc-200 bg-zinc-100 text-zinc-700",
};

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
            <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6 stroke-zinc-500" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 7.5h14v9H5z M8 5.5h8" />
            </svg>
          </div>
          <h2 className="text-base font-semibold tracking-[-0.03em] text-zinc-950">
            No repositories connected yet
          </h2>
          <p className="mt-2 max-w-sm text-sm leading-6 text-zinc-500">
            Connect your first repository to start receiving AI-powered code reviews on pull requests.
          </p>
          <a
            href="/repositories/new"
            className="mt-6 inline-flex min-h-10 items-center rounded-2xl bg-zinc-950 px-4 py-2.5 text-sm font-medium text-white hover:bg-zinc-800"
          >
            Connect Repository
          </a>
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-[20px] border border-slate-200/80 bg-white/92 p-4 shadow-[0_10px_30px_rgba(15,23,42,0.06)]">
      <div className="mb-3 flex items-center justify-between gap-4">
        <h2 className="text-base font-semibold tracking-[-0.03em] text-zinc-950">
          Connected Repositories
        </h2>
        <a
          href="/repositories/new"
          className="inline-flex min-h-9 items-center rounded-xl border border-zinc-200 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
        >
          + Connect
        </a>
      </div>
      <div className="space-y-2">
        {repositories.map((repo) => (
          <article
            key={repo.id}
            className="flex flex-col gap-2 rounded-[16px] border border-slate-200/70 bg-slate-50/70 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="min-w-0">
              <h3 className="text-sm font-semibold tracking-[-0.02em] text-zinc-950">
                {repo.fullName}
              </h3>
              <p className="mt-0.5 text-sm text-zinc-500">{repo.createdAtLabel}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2 sm:justify-end">
              <span className="rounded-full border border-zinc-200 bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-600">
                {repo.provider}
              </span>
              <span
                className={`rounded-full border px-2.5 py-0.5 text-xs font-medium capitalize ${statusClasses[repo.status] ?? statusClasses["disabled"]}`}
              >
                {repo.status}
              </span>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
