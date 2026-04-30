import Link from "next/link";

import type {
  WebhookProviderOption,
  WebhookRangeOption,
} from "@/lib/webhooks/view-model";

function TabBar({
  options,
}: {
  options: Array<{ key: string; label: string; href: string; active: boolean }>;
}) {
  return (
    <div className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white p-1 text-sm shadow-[0_4px_12px_rgba(15,23,42,0.04)]">
      {options.map((opt) => (
        <Link
          key={opt.key}
          href={opt.href}
          aria-current={opt.active ? "page" : undefined}
          className={[
            "min-w-[5rem] rounded-full px-3 py-1.5 text-center text-xs font-medium transition-colors",
            opt.active
              ? "bg-slate-900 text-white"
              : "text-slate-600 hover:bg-slate-100",
          ].join(" ")}
        >
          {opt.label}
        </Link>
      ))}
    </div>
  );
}

export default function WebhookFilters({
  rangeOptions,
  providerOptions,
}: {
  rangeOptions: WebhookRangeOption[];
  providerOptions: WebhookProviderOption[];
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <TabBar options={rangeOptions} />
      <TabBar options={providerOptions} />
    </div>
  );
}
