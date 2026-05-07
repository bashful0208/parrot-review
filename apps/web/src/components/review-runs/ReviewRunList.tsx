import Link from "next/link";
import { FileText, AlertTriangle } from "lucide-react";

import type { ReviewRunListItem } from "@/lib/review-runs/list-view-model";

const STATUS_CLASSES: Record<string, string> = {
  queued: "border-zinc-200 bg-zinc-100 text-zinc-700",
  running: "border-sky-200 bg-sky-50 text-sky-800",
  succeeded: "border-emerald-200 bg-emerald-50 text-emerald-800",
  failed: "border-rose-200 bg-rose-50 text-rose-800",
  retrying: "border-amber-200 bg-amber-50 text-amber-800",
  cancelled: "border-slate-200 bg-slate-100 text-slate-600",
};

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-zinc-200 bg-white px-6 py-16 text-center">
      <FileText className="mb-4 h-10 w-10 text-zinc-300" />
      <h3 className="text-sm font-semibold text-zinc-900">
        No review runs yet
      </h3>
      <p className="mt-1 max-w-sm text-sm text-zinc-500">
        Automated review runs appear here after a connected repository receives
        a pull request or a manual review is triggered.
      </p>
      <Link
        href="/repositories"
        className="mt-4 inline-flex items-center rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
      >
        Connect a repository
      </Link>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const cls =
    STATUS_CLASSES[status] ?? "border-zinc-200 bg-zinc-100 text-zinc-700";
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium capitalize ${cls}`}
    >
      {status}
    </span>
  );
}

function FindingsBadge({
  findingsCount,
  securityFindingsCount,
}: {
  findingsCount: number;
  securityFindingsCount: number;
}) {
  if (securityFindingsCount > 0) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2.5 py-0.5 text-xs font-medium text-red-800">
        <AlertTriangle className="h-3 w-3" />
        {securityFindingsCount} security
      </span>
    );
  }
  if (findingsCount > 0) {
    return (
      <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-800">
        {findingsCount} findings
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-0.5 text-xs font-medium text-zinc-600">
      No findings
    </span>
  );
}

export default function ReviewRunList({
  runs,
}: {
  runs: ReviewRunListItem[];
}) {
  if (runs.length === 0) return <EmptyState />;

  return (
    <div className="space-y-2">
      {runs.map((run) => (
        <Link
          key={run.id}
          href={run.detailHref}
          className="block rounded-lg border border-zinc-200 bg-white p-4 transition-colors hover:border-zinc-300 hover:bg-zinc-50"
        >
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 text-sm text-zinc-500">
                <span className="font-medium text-zinc-900 truncate">
                  {run.repositoryFullName}
                </span>
                <span className="text-zinc-300">·</span>
                <span className="font-mono">{run.prLabel}</span>
              </div>
              <p className="mt-0.5 text-sm text-zinc-800 truncate">
                {run.prTitle}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <FindingsBadge
                findingsCount={run.findingsCount}
                securityFindingsCount={run.securityFindingsCount}
              />
              <StatusBadge status={run.status} />
              <span className="hidden text-xs text-zinc-400 sm:inline w-20 text-right">
                {run.startedAtLabel}
              </span>
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}
