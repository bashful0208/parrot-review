import type { DashboardKpi } from "@/lib/dashboard/types";

export default function DashboardKpiGrid({ kpis }: { kpis: DashboardKpi[] }) {
  return (
    <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {kpis.map((kpi) => (
        <article
          key={kpi.label}
          className="rounded-[20px] border border-slate-200/80 bg-white/92 p-4 shadow-[0_10px_30px_rgba(15,23,42,0.06)]"
        >
          <p className="text-sm font-medium text-zinc-500">{kpi.label}</p>
          <div className="mt-2 flex items-end justify-between gap-3">
            <p className="text-2xl font-semibold tracking-[-0.05em] text-zinc-950">
              {kpi.value}
            </p>
            <span className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
              {kpi.change}
            </span>
          </div>
        </article>
      ))}
    </section>
  );
}
