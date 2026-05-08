import type { DashboardInsight, DashboardTrendPoint } from "@/lib/dashboard/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const insightColor: Record<DashboardInsight["severity"], string> = {
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
    <section className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
      <Card className="rounded-2xl">
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle className="text-base tracking-[-0.03em]">
                Risk insights
              </CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                Track where current review pressure is concentrated.
              </p>
            </div>
            <Badge variant="outline">Severity mix</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {insights.map((item) => (
            <div
              key={item.severity}
              className="rounded-xl border bg-muted/30 px-3 py-2.5"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span
                    className={`h-3 w-3 rounded-full ${insightColor[item.severity]}`}
                  />
                  <span className="text-sm font-semibold capitalize">
                    {item.severity}
                  </span>
                </div>
                <span className="text-sm font-medium">{item.count}</span>
              </div>
              <div className="mt-2 h-1.5 rounded-full bg-muted">
                <div
                  className={`h-1.5 rounded-full ${insightColor[item.severity]}`}
                  style={{ width: `${Math.max(item.count * 3, 12)}%` }}
                />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
      <Card className="rounded-2xl">
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle className="text-base tracking-[-0.03em]">
                Weekly pattern
              </CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                Compare the daily rhythm of incoming review activity.
              </p>
            </div>
            <Badge variant="outline">7 days</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-end gap-2">
            {trend.map((point) => (
              <div
                key={point.label}
                className="flex flex-1 flex-col items-center gap-2"
              >
                <div className="flex min-h-28 w-full items-end rounded-xl bg-muted px-1.5 pb-1.5 pt-3">
                  <div
                    className="w-full rounded-xl bg-gradient-to-b from-sky-400 to-sky-600"
                    style={{ height: `${Math.max(point.value * 10, 24)}px` }}
                  />
                </div>
                <span className="text-xs font-medium text-muted-foreground">
                  {point.label}
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
