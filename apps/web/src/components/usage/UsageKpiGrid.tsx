import type { UsageKpi } from "@/lib/usage/view-model";

export default function UsageKpiGrid({ kpis }: { kpis: UsageKpi[] }) {
  return (
    <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {kpis.map((k) => (
        <div
          key={k.label}
          className="rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_4px_12px_rgba(15,23,42,0.04)]"
        >
          <div className="text-xs font-medium uppercase tracking-[0.08em] text-slate-500">
            {k.label}
          </div>
          <div className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">
            {k.value}
          </div>
          {k.hint ? (
            <div className="mt-1 text-xs text-slate-500">{k.hint}</div>
          ) : null}
        </div>
      ))}
    </section>
  );
}
