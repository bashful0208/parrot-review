import Link from "next/link";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { UsageRangeOption } from "@/lib/usage/view-model";

export default function UsageRangeTabs({
  options,
}: {
  options: UsageRangeOption[];
}) {
  const activeKey = options.find((o) => o.active)?.key ?? options[0]?.key;

  return (
    <Tabs value={activeKey}>
      <TabsList>
        {options.map((opt) => (
          <TabsTrigger key={opt.key} value={opt.key} asChild>
            <Link href={opt.href}>{opt.label}</Link>
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
