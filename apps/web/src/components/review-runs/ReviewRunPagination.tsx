import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";

const linkClasses =
  "inline-flex h-8 items-center justify-center gap-1.5 whitespace-nowrap rounded-md border border-input bg-background px-3 text-xs font-medium shadow-sm hover:bg-accent hover:text-accent-foreground";

export default function ReviewRunPagination({
  pagination,
}: {
  pagination: {
    page: number;
    perPage: number;
    totalCount: number;
    rangeLabel: string;
    prevHref: string | null;
    nextHref: string | null;
  };
}) {
  return (
    <div className="flex items-center justify-between border-t pt-4">
      <span className="text-sm text-muted-foreground">
        {pagination.rangeLabel}
      </span>
      <div className="flex items-center gap-2">
        {pagination.prevHref ? (
          <Link href={pagination.prevHref} className={linkClasses}>
            <ChevronLeft className="h-4 w-4" />
            Previous
          </Link>
        ) : (
          <Button variant="outline" size="sm" disabled>
            <ChevronLeft className="h-4 w-4" />
            Previous
          </Button>
        )}
        {pagination.nextHref ? (
          <Link href={pagination.nextHref} className={linkClasses}>
            Next
            <ChevronRight className="h-4 w-4" />
          </Link>
        ) : (
          <Button variant="outline" size="sm" disabled>
            Next
            <ChevronRight className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
