import Link from "next/link";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { StatusFilterOption } from "@/lib/review-runs/list-view-model";

export default function ReviewRunFilters({
  statusFilter,
}: {
  statusFilter: { current: string | null; options: StatusFilterOption[] };
}) {
  const activeValue = statusFilter.current ?? "all";

  return (
    <Tabs value={activeValue}>
      <TabsList>
        {statusFilter.options.map((opt) => (
          <TabsTrigger key={opt.value} value={opt.value} asChild>
            <Link href={opt.href}>{opt.label}</Link>
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
