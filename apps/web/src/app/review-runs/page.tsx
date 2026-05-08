import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import {
  AUTH_SESSION_COOKIE,
  getOrgIdForUser,
  getSessionUser,
  listReviewRuns,
} from "@reviewer/core";

import AdminShell from "@/components/layout/admin-shell";
import ReviewRunFilters from "@/components/review-runs/ReviewRunFilters";
import ReviewRunList from "@/components/review-runs/ReviewRunList";
import ReviewRunPagination from "@/components/review-runs/ReviewRunPagination";
import { buildReviewRunsListViewModel } from "@/lib/review-runs/list-view-model";

const PER_PAGE = 20;

function parsePage(input: string | undefined): number {
  if (!input) return 1;
  const n = parseInt(input, 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

export default async function ReviewRunsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string }>;
}) {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(AUTH_SESSION_COOKIE)?.value;
  const user = sessionToken ? await getSessionUser(sessionToken) : null;
  if (!user) redirect("/login");

  const orgId = await getOrgIdForUser(user.id);
  const sp = await searchParams;
  const status = sp.status ?? null;
  const page = parsePage(sp.page);

  const { rows, totalCount } = orgId
    ? await listReviewRuns({
        organizationId: orgId,
        status,
        page,
        perPage: PER_PAGE,
      })
    : { rows: [], totalCount: 0 };

  const vm = buildReviewRunsListViewModel({
    user,
    rows,
    totalCount,
    statusFilter: status,
    page,
    perPage: PER_PAGE,
  });

  return (
    <AdminShell shell={vm.shell} topbar={vm.topbar} viewerName={vm.viewerName}>
      <div className="space-y-5">
        <ReviewRunFilters statusFilter={vm.statusFilter} />
        <ReviewRunList runs={vm.runs} />
        <ReviewRunPagination pagination={vm.pagination} />
      </div>
    </AdminShell>
  );
}
