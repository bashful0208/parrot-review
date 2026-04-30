import Link from "next/link";

import type { UsageRangeOption } from "@/lib/usage/view-model";

export default function UsageRangeTabs({
  options,
}: {
  options: UsageRangeOption[];
}) {
  return (
    <div className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white p-1 text-sm shadow-[0_4px_12px_rgba(15,23,42,0.04)]">
      {options.map((opt) => (
        <Link
          key={opt.key}
          href={opt.href}
          aria-current={opt.active ? "page" : undefined}
          className={[
            "min-w-[5.5rem] rounded-full px-3 py-1.5 text-center text-xs font-medium transition-colors",
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
