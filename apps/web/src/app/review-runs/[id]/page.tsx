import { cookies } from "next/headers";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronRight } from "lucide-react";

import {
  AUTH_SESSION_COOKIE,
  getGraphProgress,
  getOrgIdForUser,
  getReviewRunDetail,
  getSessionUser,
  listReviewCommentsByRun,
  listReviewIssuesByRun,
} from "@reviewer/core";

import AdminShell from "@/components/layout/admin-shell";
import ReviewRunDetail from "@/components/review-runs/ReviewRunDetail";
import { buildReviewRunDetailViewModel } from "@/lib/review-runs/detail-view-model";
import { buildGraphStatusViewModel } from "@/lib/review-runs/graph-view-model";

export default async function ReviewRunDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(AUTH_SESSION_COOKIE)?.value;
  const user = sessionToken ? await getSessionUser(sessionToken) : null;
  if (!user) redirect("/login");

  const orgId = await getOrgIdForUser(user.id);
  if (!orgId) notFound();

  const { id } = await params;

  const [run, issues, comments] = await Promise.all([
    getReviewRunDetail(id, orgId),
    listReviewIssuesByRun(id, orgId),
    listReviewCommentsByRun(id, orgId),
  ]);

  if (!run) notFound();

  let graphStatus = buildGraphStatusViewModel(null);
  try {
    const progress = await getGraphProgress(id);
    graphStatus = buildGraphStatusViewModel(
      progress,
      progress ? undefined : `No checkpoint found for thread_id="${id}". The review was likely run before LangGraph checkpointing was added, or has not started yet.`
    );
  } catch (err) {
    graphStatus = buildGraphStatusViewModel(
      null,
      err instanceof Error ? err.message : String(err)
    );
  }

  const vm = buildReviewRunDetailViewModel({
    user,
    run,
    issues,
    comments,
    graphStatus,
  });

  return (
    <AdminShell shell={vm.shell} topbar={vm.topbar} viewerName={vm.viewerName}>
      <div className="space-y-6">
        <nav className="flex items-center gap-1.5 text-sm">
          <Link
            href={vm.backHref}
            className="text-muted-foreground transition-colors hover:text-foreground"
          >
            Review Runs
          </Link>
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/50" />
          <span className="font-medium text-foreground">
            {vm.breadcrumb}
          </span>
        </nav>
        <ReviewRunDetail detail={vm} />
      </div>
    </AdminShell>
  );
}
