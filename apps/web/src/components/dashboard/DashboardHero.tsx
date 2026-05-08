import type { DashboardHeroModel } from "@/lib/dashboard/types";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function DashboardHero({ hero }: { hero: DashboardHeroModel }) {
  return (
    <section>
      <Card className="rounded-2xl">
        <CardContent className="p-4 sm:p-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl space-y-1.5">
              <Badge variant="secondary" className="text-xs font-medium">
                {hero.organizationName}
              </Badge>
              <h1 className="text-2xl font-semibold tracking-[-0.05em] text-foreground sm:text-3xl">
                {hero.title}
              </h1>
              <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
                {hero.summary}
              </p>
            </div>
            <Card className="rounded-xl bg-accent/50">
              <CardContent className="px-4 py-3">
                <span className="block text-xs text-muted-foreground">
                  Signed in as
                </span>
                <strong className="mt-1 block text-base font-semibold">
                  {hero.viewerName}
                </strong>
              </CardContent>
            </Card>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
