import Button from "@/components/ui/Button";
import type { DashboardTopbarModel } from "@/lib/dashboard/types";

export default function AdminTopbar({ topbar }: { topbar: DashboardTopbarModel }) {
  return (
    <header className="border-b border-slate-200/80 bg-white/78 backdrop-blur-xl">
      <div className="flex flex-col gap-4 px-4 py-4 sm:px-6 lg:px-8 xl:flex-row xl:items-center xl:justify-between">
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-[0.28em] text-slate-500">
            Review workspace
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-[-0.05em] text-zinc-950 sm:text-[2rem]">
            {topbar.title}
          </h1>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-zinc-600">
            {topbar.summary}
          </p>
        </div>

        <div className="flex flex-col gap-3 lg:min-w-[520px] lg:flex-row lg:items-center lg:justify-end">
          <label className="relative block flex-1">
            <span className="sr-only">Search repositories, runs, or rules</span>
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              fill="none"
              className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 stroke-slate-400"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="11" cy="11" r="6" />
              <path d="m20 20-3.5-3.5" />
            </svg>
            <input
              aria-label="Global search"
              placeholder={topbar.searchPlaceholder}
              className="h-11 w-full rounded-2xl border border-slate-200 bg-white pl-11 pr-4 text-sm text-zinc-900 outline-none transition focus:border-slate-300 focus:ring-2 focus:ring-slate-200"
            />
          </label>

          <Button
            variant="outline"
            className="min-h-11 border-slate-200 bg-white px-4 text-sm text-zinc-700 hover:bg-slate-50"
          >
            {topbar.rangeLabel}
          </Button>

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
