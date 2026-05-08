import Link from "next/link";

import { Button } from "@/components/ui/button";
import type { WebhookPaginationModel } from "@/lib/webhooks/view-model";

const linkClasses =
  "inline-flex h-8 items-center justify-center gap-1.5 whitespace-nowrap rounded-md border border-input bg-background px-3 text-xs font-medium shadow-sm hover:bg-accent hover:text-accent-foreground";

export default function WebhookPagination({
  pagination,
}: {
  pagination: WebhookPaginationModel;
}) {
  return (
    <div className="flex items-center justify-between gap-4 px-1">
      <span className="text-xs text-muted-foreground">
        {pagination.rangeLabel}
      </span>
      <div className="flex items-center gap-2">
        {pagination.prevHref ? (
          <Link href={pagination.prevHref} className={linkClasses}>
            ← Previous
          </Link>
        ) : (
          <Button variant="outline" size="sm" disabled>
            ← Previous
          </Button>
        )}
        {pagination.nextHref ? (
          <Link href={pagination.nextHref} className={linkClasses}>
            Next →
          </Link>
        ) : (
          <Button variant="outline" size="sm" disabled>
            Next →
          </Button>
        )}
      </div>
    </div>
  );
}
