import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";

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
          <Button variant="outline" size="sm" asChild>
            <Link href={pagination.prevHref}>
              <ChevronLeft className="h-4 w-4" />
              Previous
            </Link>
          </Button>
        ) : (
          <Button variant="outline" size="sm" disabled>
            <ChevronLeft className="h-4 w-4" />
            Previous
          </Button>
        )}
        {pagination.nextHref ? (
          <Button variant="outline" size="sm" asChild>
            <Link href={pagination.nextHref}>
              Next
              <ChevronRight className="h-4 w-4" />
            </Link>
          </Button>
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
