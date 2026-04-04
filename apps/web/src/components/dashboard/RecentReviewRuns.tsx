import type { DashboardRun } from "@/lib/dashboard/types";

const statusClasses: Record<DashboardRun["status"], string> = {
  queued: "border-zinc-200 bg-zinc-100 text-zinc-700",
  running: "border-sky-200 bg-sky-50 text-sky-800",
  succeeded: "border-emerald-200 bg-emerald-50 text-emerald-800",
  failed: "border-rose-200 bg-rose-50 text-rose-800",
};

export default function RecentReviewRuns({ runs }: { runs: DashboardRun[] }) {
  if (runs.length === 0) {
    return (
      <section className="rounded-[20px] border border-slate-200/80 bg-white/92 p-4 shadow-[0_10px_30px_rgba(15,23,42,0.06)]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold tracking-[-0.03em] text-zinc-950">
              Recent review runs
            </h2>
            <p className="mt-2 text-sm leading-6 text-zinc-600">
              No review activity yet. Start your first review to populate this workspace.
            </p>
          </div>
          <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] text-slate-600">
            Live queue
          </span>
        </div>
        <a
          href="/api/reviews/enqueue"
          className="mt-5 inline-flex min-h-11 items-center rounded-full bg-zinc-950 px-4 py-2 text-sm font-medium text-white"
        >
          Start your first review
        </a>
      </section>
    );
  }

  return (
    <section className="rounded-[20px] border border-slate-200/80 bg-white/92 p-4 shadow-[0_10px_30px_rgba(15,23,42,0.06)]">
      <div className="mb-3 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold tracking-[-0.03em] text-zinc-950">
            Recent review runs
          </h2>
          <p className="mt-1 text-sm text-zinc-500">
            Continue active work and spot runs that need attention.
          </p>
        </div>
        <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] text-slate-600">
          Live queue
        </span>
      </div>
      <div className="space-y-2">
        {runs.map((run) => (
          <article
            key={run.id}
            className="rounded-[16px] border border-slate-200/70 bg-slate-50/70 px-4 py-3"
          >
            <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0 space-y-0.5">
                <p className="text-xs font-medium uppercase tracking-[0.18em] text-zinc-500">
                  {run.repositoryName} · {run.pullRequestLabel}
                </p>
                <h3 className="text-sm font-semibold tracking-[-0.02em] text-zinc-950">
                  {run.title}
                </h3>
                <p className="text-sm text-zinc-600">{run.startedAtLabel}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                <span
                  className={`rounded-full border px-3 py-1 text-xs font-medium capitalize ${statusClasses[run.status]}`}
                >
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
