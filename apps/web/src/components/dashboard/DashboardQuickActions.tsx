import type { DashboardQuickAction } from "@/lib/dashboard/types";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function DashboardQuickActions({
  actions,
}: {
  actions: DashboardQuickAction[];
}) {
  return (
    <section className="grid gap-4 lg:grid-cols-3">
      {actions.map((action) => (
        <a
          key={action.label}
          href={action.href}
          className="group block transition-transform duration-200 hover:-translate-y-0.5"
        >
          <Card className="rounded-2xl transition-shadow group-hover:shadow-md">
            <CardContent className="p-4">
              <Badge variant="outline" className="text-xs font-medium">
                Action
              </Badge>
              <p className="mt-3 text-sm font-semibold tracking-[-0.02em] text-foreground">
                {action.label}
              </p>
              <p className="mt-1 text-sm leading-5 text-muted-foreground">
                {action.description}
              </p>
              <p className="mt-3 text-sm font-medium text-primary group-hover:text-primary/80">
                Open
              </p>
            </CardContent>
          </Card>
        </a>
      ))}
    </section>
  );
}
