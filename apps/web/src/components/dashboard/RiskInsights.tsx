import type { DashboardInsight, DashboardTrendPoint } from "@/lib/dashboard/types";

const insightClasses: Record<DashboardInsight["severity"], string> = {
  critical: "bg-rose-500",
  high: "bg-orange-500",
  medium: "bg-amber-400",
  low: "bg-emerald-400",
};

export default function RiskInsights({
  insights,
  trend,
}: {
  insights: DashboardInsight[];
  trend: DashboardTrendPoint[];
}) {
  return (
    <section className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
      <article className="rounded-[28px] border border-white/70 bg-white/90 p-6 shadow-[0_18px_50px_rgba(15,23,42,0.07)]">
        <h2 className="text-2xl font-semibold tracking-[-0.05em] text-zinc-950">Risk insights</h2>
        <div className="mt-5 space-y-3">
          {insights.map((item) => (
            <div key={item.severity} className="flex items-center gap-3">
              <span className={`h-3 w-3 rounded-full ${insightClasses[item.severity]}`} />
              <span className="min-w-20 text-sm font-medium capitalize text-zinc-700">{item.severity}</span>
              <div className="h-2 flex-1 rounded-full bg-zinc-100">
                <div
                  className={`h-2 rounded-full ${insightClasses[item.severity]}`}
                  style={{ width: `${Math.max(item.count * 3, 12)}%` }}
                />
              </div>
              <span className="text-sm text-zinc-500">{item.count}</span>
            </div>
          ))}
        </div>
      </article>
      <article className="rounded-[28px] border border-white/70 bg-white/90 p-6 shadow-[0_18px_50px_rgba(15,23,42,0.07)]">
        <h2 className="text-2xl font-semibold tracking-[-0.05em] text-zinc-950">Weekly pattern</h2>
        <div className="mt-6 flex items-end gap-3">
          {trend.map((point) => (
            <div key={point.label} className="flex flex-1 flex-col items-center gap-3">
              <div
                className="w-full rounded-t-2xl bg-gradient-to-b from-sky-400 to-sky-600"
                style={{ height: `${Math.max(point.value * 10, 24)}px` }}
              />
              <span className="text-xs uppercase tracking-[0.18em] text-zinc-500">{point.label}</span>
            </div>
          ))}
        </div>
      </article>
    </section>
  );
}
