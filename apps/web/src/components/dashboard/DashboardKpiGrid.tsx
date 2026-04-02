import type { DashboardKpi } from "@/lib/dashboard/types";

export default function DashboardKpiGrid({ kpis }: { kpis: DashboardKpi[] }) {
  return (
    <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {kpis.map((kpi) => (
        <article
          key={kpi.label}
          className="rounded-[24px] border border-white/70 bg-white/90 p-5 shadow-[0_12px_32px_rgba(15,23,42,0.06)]"
        >
          <p className="text-sm text-zinc-500">{kpi.label}</p>
          <p className="mt-3 text-3xl font-semibold tracking-[-0.05em] text-zinc-950">
            {kpi.value}
          </p>
          <p className="mt-2 text-sm text-zinc-600">{kpi.change}</p>
        </article>
      ))}
    </section>
  );
}
