import Link from "next/link";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type {
  WebhookProviderOption,
  WebhookRangeOption,
} from "@/lib/webhooks/view-model";

export default function WebhookFilters({
  rangeOptions,
  providerOptions,
}: {
  rangeOptions: WebhookRangeOption[];
  providerOptions: WebhookProviderOption[];
}) {
  const activeRange = rangeOptions.find((o) => o.active)?.key ?? rangeOptions[0]?.key;
  const activeProvider = providerOptions.find((o) => o.active)?.key ?? providerOptions[0]?.key;

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Tabs value={activeRange}>
        <TabsList>
          {rangeOptions.map((opt) => (
            <TabsTrigger key={opt.key} value={opt.key} asChild>
              <Link href={opt.href}>{opt.label}</Link>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      <Tabs value={activeProvider}>
        <TabsList>
          {providerOptions.map((opt) => (
            <TabsTrigger key={opt.key} value={opt.key} asChild>
              <Link href={opt.href}>{opt.label}</Link>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
    </div>
  );
}
