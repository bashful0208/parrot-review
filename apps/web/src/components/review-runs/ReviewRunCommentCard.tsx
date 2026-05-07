import type { ReviewRunCommentItem } from "@/lib/review-runs/detail-view-model";

const COMMENT_STATUS_CLASSES: Record<string, string> = {
  draft: "border-zinc-200 bg-zinc-100 text-zinc-700",
  posted: "border-emerald-200 bg-emerald-50 text-emerald-800",
  skipped: "border-slate-200 bg-slate-100 text-slate-600",
  failed: "border-rose-200 bg-rose-50 text-rose-800",
  hidden: "border-amber-200 bg-amber-50 text-amber-800",
};

function CommentStatusBadge({ status }: { status: string }) {
  const cls =
    COMMENT_STATUS_CLASSES[status] ??
    "border-zinc-200 bg-zinc-100 text-zinc-700";
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium capitalize ${cls}`}
    >
      {status}
    </span>
  );
}

export default function ReviewRunCommentCard({
  comment,
}: {
  comment: ReviewRunCommentItem;
}) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4">
      <div className="flex items-center gap-2 mb-2">
        <CommentStatusBadge status={comment.status} />
        {comment.isInline && (
          <span className="text-xs text-zinc-500">Inline</span>
        )}
        {comment.provider && (
          <span className="rounded-md bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600">
            {comment.provider}
          </span>
        )}
        {comment.fileLocation && (
          <span className="font-mono text-xs text-zinc-500">
            {comment.fileLocation}
          </span>
        )}
        <span className="text-xs text-zinc-400 ml-auto">
          {comment.postedAtLabel ? `Posted ${comment.postedAtLabel}` : "Not posted"}
        </span>
      </div>
      <pre className="whitespace-pre-wrap text-sm text-zinc-700 font-sans">
        {comment.body}
      </pre>
    </div>
  );
}
