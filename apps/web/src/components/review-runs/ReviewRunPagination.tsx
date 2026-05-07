import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

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
    <div className="flex items-center justify-between border-t border-zinc-200 pt-4">
      <span className="text-sm text-zinc-500">{pagination.rangeLabel}</span>
      <div className="flex items-center gap-2">
        {pagination.prevHref ? (
          <Link
            href={pagination.prevHref}
            className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
          >
            <ChevronLeft className="h-4 w-4" />
            Previous
          </Link>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-lg border border-zinc-100 bg-zinc-50 px-3 py-1.5 text-sm text-zinc-300 cursor-not-allowed">
            <ChevronLeft className="h-4 w-4" />
            Previous
          </span>
        )}
        {pagination.nextHref ? (
          <Link
            href={pagination.nextHref}
            className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
          >
            Next
            <ChevronRight className="h-4 w-4" />
          </Link>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-lg border border-zinc-100 bg-zinc-50 px-3 py-1.5 text-sm text-zinc-300 cursor-not-allowed">
            Next
            <ChevronRight className="h-4 w-4" />
          </span>
        )}
      </div>
    </div>
  );
}
