import { AlertCircle, FileCode, MessageSquare } from "lucide-react";

import ReviewRunCommentCard from "./ReviewRunCommentCard";
import ReviewRunIssueCard from "./ReviewRunIssueCard";
import type { ReviewRunDetailViewModel } from "@/lib/review-runs/detail-view-model";

function StatusBadge({ status }: { status: string }) {
  const STATUS_CLASSES: Record<string, string> = {
    queued: "border-zinc-200 bg-zinc-100 text-zinc-700",
    running: "border-sky-200 bg-sky-50 text-sky-800",
    succeeded: "border-emerald-200 bg-emerald-50 text-emerald-800",
    failed: "border-rose-200 bg-rose-50 text-rose-800",
    retrying: "border-amber-200 bg-amber-50 text-amber-800",
    cancelled: "border-slate-200 bg-slate-100 text-slate-600",
  };
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

export default function ReviewRunDetail({
  detail,
}: {
  detail: ReviewRunDetailViewModel;
}) {
  return (
    <div className="space-y-5">
      {/* Error banner */}
      {detail.isFailed && (
        <div className="flex items-start gap-3 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-rose-600" />
          <div>
            <p className="text-sm font-semibold text-rose-800">
              Review run failed
            </p>
            {detail.errorCode && (
              <p className="mt-0.5 text-sm text-rose-700">
                Code: {detail.errorCode}
              </p>
            )}
            {detail.errorMessage && (
              <p className="mt-0.5 text-sm text-rose-700">
                {detail.errorMessage}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Status header */}
      <div className="flex items-center gap-3">
        <StatusBadge status={detail.status} />
        <div>
          <h1 className="text-lg font-semibold text-zinc-900">
            {detail.topbar.title}
          </h1>
          <p className="text-sm text-zinc-500">{detail.topbar.summary}</p>
        </div>
      </div>

      {/* Metadata grid */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {detail.metadata.map((m) => (
          <div key={m.label}>
            <dt className="text-xs text-zinc-500">{m.label}</dt>
            <dd className="mt-0.5 text-sm font-medium text-zinc-900">
              {m.value}
            </dd>
          </div>
        ))}
      </div>

      {/* Summary */}
      {detail.summaryMd && (
        <div className="rounded-lg border border-zinc-200 bg-white p-4">
          <h2 className="mb-2 text-sm font-semibold text-zinc-900">Summary</h2>
          <pre className="whitespace-pre-wrap text-sm text-zinc-700 font-sans">
            {detail.summaryMd}
          </pre>
        </div>
      )}

      {/* Issues */}
      <section>
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-zinc-900">
          <FileCode className="h-4 w-4" />
          Issues ({detail.issues.length})
        </h2>
        {detail.issues.length === 0 ? (
          <p className="text-sm text-zinc-500">No issues found in this run.</p>
        ) : (
          <div className="space-y-2">
            {detail.issues.map((issue) => (
              <ReviewRunIssueCard key={issue.id} issue={issue} />
            ))}
          </div>
        )}
      </section>

      {/* Comments */}
      <section>
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-zinc-900">
          <MessageSquare className="h-4 w-4" />
          Comments ({detail.comments.length})
        </h2>
        {detail.comments.length === 0 ? (
          <p className="text-sm text-zinc-500">
            No comments posted for this run.
          </p>
        ) : (
          <div className="space-y-2">
            {detail.comments.map((comment) => (
              <ReviewRunCommentCard key={comment.id} comment={comment} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
