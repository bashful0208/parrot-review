import type { DashboardTopbarModel } from "@/lib/dashboard/types";

export default function AdminTopbar({ topbar }: { topbar: DashboardTopbarModel }) {
  return (
    <header className="border-b border-slate-200/80 bg-white/78 backdrop-blur-xl">
      <div className="flex flex-col gap-4 px-4 py-4 sm:px-6 lg:px-8 xl:flex-row xl:items-center xl:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-[-0.05em] text-zinc-950 sm:text-[2rem]">
            {topbar.title}
          </h1>
          {topbar.summary && (
            <p className="mt-1 max-w-2xl text-sm leading-6 text-zinc-600">
              {topbar.summary}
            </p>
          )}
        </div>

        <div className="flex items-center justify-end">
          <a
            href={topbar.primaryAction.href}
            className="inline-flex min-h-11 items-center justify-center rounded-2xl bg-slate-950 px-5 text-sm font-medium text-white transition-colors hover:bg-slate-800"
          >
            {topbar.primaryAction.label}
          </a>
        </div>
      </div>
    </header>
  );
}
