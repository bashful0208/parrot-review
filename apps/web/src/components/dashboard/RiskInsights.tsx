import type { DashboardInsight, DashboardTrendPoint } from "@/lib/dashboard/types";

const insightClasses: Record<DashboardInsight["severity"], string> = {
  critical: "bg-rose-500",
  high: "bg-orange-500",
  medium: "bg-amber-400",
  low: "bg-emerald-400",
};

const insightSurfaceClasses: Record<DashboardInsight["severity"], string> = {
  critical: "border-rose-200 bg-rose-50/80 text-rose-900",
  high: "border-orange-200 bg-orange-50/80 text-orange-900",
  medium: "border-amber-200 bg-amber-50/80 text-amber-900",
  low: "border-emerald-200 bg-emerald-50/80 text-emerald-900",
};

export default function RiskInsights({
  insights,
  trend,
}: {
  insights: DashboardInsight[];
  trend: DashboardTrendPoint[];
}) {
  return (
    <section className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
      <article className="rounded-[20px] border border-slate-200/80 bg-white/92 p-4 shadow-[0_10px_30px_rgba(15,23,42,0.06)]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold tracking-[-0.03em] text-zinc-950">
              Risk insights
            </h2>
            <p className="mt-1 text-sm text-zinc-500">
              Track where current review pressure is concentrated.
            </p>
          </div>
          <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] text-slate-600">
            Severity mix
          </span>
        </div>
        <div className="mt-3 space-y-2">
          {insights.map((item) => (
            <div
              key={item.severity}
              className={`rounded-[14px] border px-3 py-2.5 ${insightSurfaceClasses[item.severity]}`}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span
                    className={`h-3 w-3 rounded-full ${insightClasses[item.severity]}`}
                  />
                  <span className="text-sm font-semibold capitalize">{item.severity}</span>
                </div>
                <span className="text-sm font-medium">{item.count}</span>
              </div>
              <div className="mt-2 h-1.5 rounded-full bg-white/60">
                <div
                  className={`h-1.5 rounded-full ${insightClasses[item.severity]}`}
                  style={{ width: `${Math.max(item.count * 3, 12)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </article>
      <article className="rounded-[20px] border border-slate-200/80 bg-white/92 p-4 shadow-[0_10px_30px_rgba(15,23,42,0.06)]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold tracking-[-0.03em] text-zinc-950">
              Weekly pattern
            </h2>
            <p className="mt-1 text-sm text-zinc-500">
              Compare the daily rhythm of incoming review activity.
            </p>
          </div>
          <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] text-slate-600">
            7 days
          </span>
        </div>
        <div className="mt-3 flex items-end gap-2">
          {trend.map((point) => (
            <div key={point.label} className="flex flex-1 flex-col items-center gap-2">
              <div className="flex min-h-28 w-full items-end rounded-[14px] bg-slate-50 px-1.5 pb-1.5 pt-3">
                <div
                  className="w-full rounded-[16px] bg-gradient-to-b from-sky-400 to-sky-600"
                  style={{ height: `${Math.max(point.value * 10, 24)}px` }}
                />
              </div>
              <span className="text-xs font-medium uppercase tracking-[0.18em] text-zinc-500">
                {point.label}
              </span>
            </div>
          ))}
        </div>
      </article>
    </section>
  );
}
