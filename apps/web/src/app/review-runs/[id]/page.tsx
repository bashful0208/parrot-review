import { cookies } from "next/headers";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";

import {
  AUTH_SESSION_COOKIE,
  getOrgIdForUser,
  getReviewRunDetail,
  getSessionUser,
  listReviewCommentsByRun,
  listReviewIssuesByRun,
} from "@reviewer/core";

import AdminShell from "@/components/layout/admin-shell";
import ReviewRunDetail from "@/components/review-runs/ReviewRunDetail";
import { buildReviewRunDetailViewModel } from "@/lib/review-runs/detail-view-model";

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

  const vm = buildReviewRunDetailViewModel({
    user,
    run,
    issues,
    comments,
  });

  return (
    <AdminShell shell={vm.shell} topbar={vm.topbar} viewerName={vm.viewerName}>
      <div className="space-y-4">
        <Link
          href={vm.backHref}
          className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-900 transition-colors"
        >
          <ChevronLeft className="h-4 w-4" />
          Back to Review Runs
        </Link>
        <ReviewRunDetail detail={vm} />
      </div>
    </AdminShell>
  );
}
