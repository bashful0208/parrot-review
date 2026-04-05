import type { DashboardTopbarModel } from "@/lib/dashboard/types";

export default function AdminTopbar({ topbar }: { topbar: DashboardTopbarModel }) {
  return (
    <header className="border-b border-slate-200/80 bg-white/78 backdrop-blur-xl">
      <div className="flex flex-col gap-3 px-4 py-3 sm:px-5 lg:px-6 xl:flex-row xl:items-center xl:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-[-0.04em] text-zinc-950">
            {topbar.title}
          </h1>
          {topbar.summary && (
            <p className="mt-1 max-w-2xl text-sm leading-6 text-zinc-600">
              {topbar.summary}
            </p>
          )}
        </div>

        {topbar.primaryAction && (
          <div className="flex items-center justify-end">
            <a
              href={topbar.primaryAction.href}
              className="inline-flex min-h-11 items-center justify-center rounded-2xl bg-slate-950 px-5 text-sm font-medium text-white transition-colors hover:bg-slate-800"
            >
              {topbar.primaryAction.label}
            </a>
          </div>
        )}
      </div>
    </header>
  );
}
