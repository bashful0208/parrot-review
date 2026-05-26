import type {
  AuthenticatedUser,
  ReviewCommentRow,
  ReviewIssueRow,
  ReviewRunDetailRow,
} from "@reviewer/core";

import type { GraphStatusViewModel } from "./graph-view-model";

import { DASHBOARD_NAVIGATION } from "@/lib/dashboard/view-model";
import type {
  DashboardShellModel,
  DashboardTopbarModel,
} from "@/lib/dashboard/types";
import { getViewerName } from "@/lib/utils/viewer-name";

export interface ReviewRunDetailMeta {
  label: string;
  value: string;
}

export type ReviewIssueRelation = "new" | "persisted" | "resolved";

export interface ReviewRunIssueItem {
  id: string;
  severity: string;
  issueType: string;
  title: string;
  summary: string;
  fileLocation: string | null;
  confidencePercent: string;
  suggestion: string | null;
  status: string;
  relation: ReviewIssueRelation;
}

export interface ReviewRunCommentItem {
  id: string;
  body: string;
  status: string;
  isInline: boolean;
  fileLocation: string | null;
  provider: string | null;
  postedAtLabel: string | null;
  externalCommentId: string | null;
}

export interface ReviewRunDetailViewModel {
  shell: DashboardShellModel;
  topbar: DashboardTopbarModel;
  viewerName: string;
  backHref: string;
  breadcrumb: string;
  metadata: ReviewRunDetailMeta[];
  summaryMd: string | null;
  issues: ReviewRunIssueItem[];
  comments: ReviewRunCommentItem[];
  errorCode: string | null;
  errorMessage: string | null;
  isFailed: boolean;
  status: string;
  reviewRunId: string;
  graphStatus: GraphStatusViewModel;
}

const TRIGGER_LABELS: Record<string, string> = {
  pr_opened: "PR opened",
  pr_synchronize: "PR synchronize",
  pr_reopened: "PR reopened",
  manual_rerun: "Manual rerun",
  rules_changed: "Rules changed",
};

const STATUS_LABELS: Record<string, string> = {
  queued: "Queued",
  running: "Running",
  succeeded: "Succeeded",
  failed: "Failed",
  retrying: "Retrying",
  cancelled: "Cancelled",
};

function formatAbsolute(d: Date): string {
  return d.toISOString().replace("T", " ").replace(/\..*$/, " UTC");
}

function shortSha(sha: string): string {
  return sha.slice(0, 7);
}

function buildFileLocation(
  filePath: string | null,
  startLine: number | null,
  endLine: number | null
): string | null {
  if (!filePath) return null;
  if (startLine && endLine && startLine !== endLine)
    return `${filePath}:${startLine}-${endLine}`;
  if (startLine) return `${filePath}:${startLine}`;
  return filePath;
}

function buildCommentFileLocation(
  filePath: string | null,
  lineNumber: number | null
): string | null {
  if (!filePath) return null;
  if (lineNumber) return `${filePath}:${lineNumber}`;
  return filePath;
}

export function buildReviewRunDetailViewModel(args: {
  user: Pick<AuthenticatedUser, "email" | "name"> & { id: string };
  run: ReviewRunDetailRow;
  issues: ReviewIssueRow[];
  comments: ReviewCommentRow[];
  graphStatus: GraphStatusViewModel;
}): ReviewRunDetailViewModel {
  const { run, issues, comments } = args;

  const meta: ReviewRunDetailMeta[] = [
    {
      label: "Status",
      value: STATUS_LABELS[run.status] ?? run.status,
    },
    {
      label: "Trigger",
      value: TRIGGER_LABELS[run.triggerType] ?? run.triggerType,
    },
    { label: "Review mode", value: run.reviewMode },
    { label: "Output language", value: run.outputLanguage },
    {
      label: "AI model",
      value: run.aiModelName ?? "—",
    },
    { label: "Base SHA", value: shortSha(run.baseSha) },
    { label: "Head SHA", value: shortSha(run.headSha) },
    {
      label: "Started at",
      value: run.startedAt ? formatAbsolute(run.startedAt) : "—",
    },
    {
      label: "Finished at",
      value: run.finishedAt ? formatAbsolute(run.finishedAt) : "In progress",
    },
    {
      label: "Files analyzed",
      value: String(run.analyzedFilesCount),
    },
    {
      label: "Total findings",
      value: String(run.findingsCount),
    },
    {
      label: "Security findings",
      value: String(run.securityFindingsCount),
    },
  ];

  return {
    shell: {
      workspaceName: "Acme Engineering",
      currentPath: "/review-runs",
      logoutHref: "/api/auth/logout",
      navigation: DASHBOARD_NAVIGATION.map((item) => ({ ...item })),
    },
    topbar: {
      title: `Run #${run.runNumber} · ${run.repositoryFullName}`,
      summary: `PR #${run.prNumber}: ${run.prTitle}`,
      searchPlaceholder: "",
      rangeLabel: "",
    },
    viewerName: getViewerName(args.user),
    backHref: "/review-runs",
    breadcrumb: `Run #${run.runNumber} · ${run.repositoryFullName}`,
    metadata: meta,
    summaryMd: run.summaryMd,
    issues: issues.map((issue) => {
      const relation: ReviewIssueRelation =
        issue.status === "resolved" && issue.resolvedInRunId === run.id
          ? "resolved"
          : issue.firstSeenRunId === run.id
            ? "new"
            : "persisted";
      return {
        id: issue.id,
        severity: issue.severity,
        issueType: issue.issueType,
        title: issue.title,
        summary: issue.summary,
        fileLocation: buildFileLocation(
          issue.filePath,
          issue.startLine,
          issue.endLine
        ),
        confidencePercent: `${Math.round(issue.confidenceScore * 100)}%`,
        suggestion: issue.suggestionMd,
        status: issue.status,
        relation,
      };
    }),
    comments: comments.map((comment) => ({
      id: comment.id,
      body: comment.bodyMd,
      status: comment.status,
      isInline: comment.isInline ?? false,
      fileLocation: buildCommentFileLocation(
        comment.filePath,
        comment.lineNumber
      ),
      provider: comment.provider,
      postedAtLabel: comment.postedAt
        ? formatAbsolute(comment.postedAt)
        : null,
      externalCommentId: comment.externalCommentId,
    })),
    errorCode: run.errorCode,
    errorMessage: run.errorMessage,
    isFailed: run.status === "failed",
    status: run.status,
    reviewRunId: run.id,
    graphStatus: args.graphStatus,
  };
}
