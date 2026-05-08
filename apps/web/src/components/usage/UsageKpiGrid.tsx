import { Card, CardContent } from "@/components/ui/card";
import type { UsageKpi } from "@/lib/usage/view-model";

export default function UsageKpiGrid({ kpis }: { kpis: UsageKpi[] }) {
  return (
    <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {kpis.map((k) => (
        <Card key={k.label} className="rounded-2xl">
          <CardContent className="p-4">
            <div className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
              {k.label}
            </div>
            <div className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
              {k.value}
            </div>
            {k.hint ? (
              <div className="mt-1 text-xs text-muted-foreground">{k.hint}</div>
            ) : null}
          </CardContent>
        </Card>
      ))}
    </section>
  );
}
