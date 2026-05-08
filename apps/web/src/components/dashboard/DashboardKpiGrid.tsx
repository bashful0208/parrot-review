import type { DashboardKpi } from "@/lib/dashboard/types";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function DashboardKpiGrid({ kpis }: { kpis: DashboardKpi[] }) {
  return (
    <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {kpis.map((kpi) => (
        <Card key={kpi.label} className="rounded-2xl">
          <CardContent className="p-4">
            <p className="text-sm font-medium text-muted-foreground">
              {kpi.label}
            </p>
            <div className="mt-2 flex items-end justify-between gap-3">
              <p className="text-2xl font-semibold tracking-[-0.05em] text-foreground">
                {kpi.value}
              </p>
              <Badge
                variant="outline"
                className="border-emerald-200 bg-emerald-50 text-emerald-700"
              >
                {kpi.change}
              </Badge>
            </div>
          </CardContent>
        </Card>
      ))}
    </section>
  );
}
