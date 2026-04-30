import Link from "next/link";

import type { WebhookPaginationModel } from "@/lib/webhooks/view-model";

function ButtonLink({
  href,
  disabled,
  children,
}: {
  href: string | null;
  disabled: boolean;
  children: React.ReactNode;
}) {
  const className =
    "rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium transition-colors";
  if (disabled || !href) {
    return (
      <span
        aria-disabled="true"
        className={`${className} cursor-not-allowed text-slate-300`}
      >
        {children}
      </span>
    );
  }
  return (
    <Link
      href={href}
      className={`${className} text-slate-700 hover:bg-slate-50`}
    >
      {children}
    </Link>
  );
}

export default function WebhookPagination({
  pagination,
}: {
  pagination: WebhookPaginationModel;
}) {
  return (
    <div className="flex items-center justify-between gap-4 px-1">
      <span className="text-xs text-slate-500">{pagination.rangeLabel}</span>
      <div className="flex items-center gap-2">
        <ButtonLink href={pagination.prevHref} disabled={pagination.prevHref === null}>
          ← Previous
        </ButtonLink>
        <ButtonLink href={pagination.nextHref} disabled={pagination.nextHref === null}>
          Next →
        </ButtonLink>
      </div>
    </div>
  );
}
