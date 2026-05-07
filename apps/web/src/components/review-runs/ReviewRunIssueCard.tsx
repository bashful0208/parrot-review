import type { ReviewRunIssueItem } from "@/lib/review-runs/detail-view-model";

const SEVERITY_CLASSES: Record<string, string> = {
  critical: "border-red-200 bg-red-50 text-red-800",
  high: "border-orange-200 bg-orange-50 text-orange-800",
  medium: "border-amber-200 bg-amber-50 text-amber-800",
  low: "border-sky-200 bg-sky-50 text-sky-800",
};

function SeverityBadge({ severity }: { severity: string }) {
  const cls =
    SEVERITY_CLASSES[severity] ??
    "border-zinc-200 bg-zinc-100 text-zinc-700";
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium capitalize ${cls}`}
    >
      {severity}
    </span>
  );
}

function TypeChip({ issueType }: { issueType: string }) {
  return (
    <span className="inline-flex items-center rounded-md bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600">
      {issueType}
    </span>
  );
}

export default function ReviewRunIssueCard({
  issue,
}: {
  issue: ReviewRunIssueItem;
}) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4">
      <div className="flex items-center gap-2 mb-1.5">
        <SeverityBadge severity={issue.severity} />
        <TypeChip issueType={issue.issueType} />
        <span className="text-xs text-zinc-500">{issue.confidencePercent} confidence</span>
      </div>
      <h4 className="text-sm font-semibold text-zinc-900">{issue.title}</h4>
      <p className="mt-1 text-sm text-zinc-600">{issue.summary}</p>
      {issue.fileLocation && (
        <p className="mt-1.5 font-mono text-xs text-zinc-500">
          {issue.fileLocation}
        </p>
      )}
      {issue.suggestion && (
        <div className="mt-2 rounded-md bg-zinc-50 p-3">
          <p className="text-xs font-medium text-zinc-500 mb-1">Suggestion</p>
          <pre className="whitespace-pre-wrap text-sm text-zinc-700 font-sans">
            {issue.suggestion}
          </pre>
        </div>
      )}
    </div>
  );
}
