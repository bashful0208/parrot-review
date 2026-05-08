import Link from "next/link";

import { Button } from "@/components/ui/button";
import type { WebhookPaginationModel } from "@/lib/webhooks/view-model";

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
          <Button variant="outline" size="sm" asChild>
            <Link href={pagination.prevHref}>← Previous</Link>
          </Button>
        ) : (
          <Button variant="outline" size="sm" disabled>
            ← Previous
          </Button>
        )}
        {pagination.nextHref ? (
          <Button variant="outline" size="sm" asChild>
            <Link href={pagination.nextHref}>Next →</Link>
          </Button>
        ) : (
          <Button variant="outline" size="sm" disabled>
            Next →
          </Button>
        )}
      </div>
    </div>
  );
}
