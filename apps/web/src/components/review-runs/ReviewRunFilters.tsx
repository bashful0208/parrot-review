import Link from "next/link";

import type { StatusFilterOption } from "@/lib/review-runs/list-view-model";

export default function ReviewRunFilters({
  statusFilter,
}: {
  statusFilter: { current: string | null; options: StatusFilterOption[] };
}) {
  return (
    <div className="flex gap-1.5 flex-wrap">
      {statusFilter.options.map((opt) => (
        <Link
          key={opt.value}
          href={opt.href}
          className={`inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
            opt.active
              ? "border-zinc-900 bg-zinc-900 text-white"
              : "border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300 hover:text-zinc-900"
          }`}
        >
          {opt.label}
        </Link>
      ))}
    </div>
  );
}
