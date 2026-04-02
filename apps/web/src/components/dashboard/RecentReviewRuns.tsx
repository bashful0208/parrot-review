import type { DashboardRun } from "@/lib/dashboard/types";

const statusClasses: Record<DashboardRun["status"], string> = {
  queued: "bg-zinc-100 text-zinc-700",
  running: "bg-sky-100 text-sky-800",
  succeeded: "bg-emerald-100 text-emerald-800",
  failed: "bg-rose-100 text-rose-800",
};

export default function RecentReviewRuns({ runs }: { runs: DashboardRun[] }) {
  if (runs.length === 0) {
    return (
      <section className="rounded-[28px] border border-white/70 bg-white/90 p-6 shadow-[0_18px_50px_rgba(15,23,42,0.07)]">
        <h2 className="text-2xl font-semibold tracking-[-0.05em] text-zinc-950">
          Recent review runs
        </h2>
        <p className="mt-4 text-sm leading-6 text-zinc-600">
          No review activity yet. Start your first review to populate this workspace.
        </p>
        <a
          href="/api/reviews/enqueue"
          className="mt-5 inline-flex rounded-full bg-zinc-950 px-4 py-2 text-sm font-medium text-white"
        >
          Start your first review
        </a>
      </section>
    );
  }

  return (
    <section className="rounded-[28px] border border-white/70 bg-white/90 p-6 shadow-[0_18px_50px_rgba(15,23,42,0.07)]">
      <div className="mb-5">
        <h2 className="text-2xl font-semibold tracking-[-0.05em] text-zinc-950">
          Recent review runs
        </h2>
        <p className="mt-1 text-sm text-zinc-500">
          Continue active work and spot runs that need attention.
        </p>
      </div>
      <div className="space-y-4">
        {runs.map((run) => (
          <article key={run.id} className="rounded-[22px] border border-zinc-100 bg-zinc-50/80 p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="space-y-1">
                <p className="text-sm font-medium text-zinc-500">
                  {run.repositoryName} · {run.pullRequestLabel}
                </p>
                <h3 className="text-lg font-semibold tracking-[-0.03em] text-zinc-950">
                  {run.title}
                </h3>
                <p className="text-sm text-zinc-600">{run.startedAtLabel}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-full px-3 py-1 text-xs font-medium ${statusClasses[run.status]}`}>
                  {run.status}
                </span>
                <span className="rounded-full bg-zinc-950 px-3 py-1 text-xs font-medium text-white">
                  {run.severityLabel}
                </span>
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
