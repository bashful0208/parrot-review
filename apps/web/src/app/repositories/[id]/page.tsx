import { cookies, headers } from "next/headers";
import { notFound, redirect } from "next/navigation";

import {
  AUTH_SESSION_COOKIE,
  getOrgIdForUser,
  getRepositoryById,
  getSessionUser,
} from "@reviewer/core";

import AdminShell from "@/components/layout/admin-shell";
import RepositoryDetail from "@/components/repositories/RepositoryDetail";
import { buildRepositoryDetailPageViewModel } from "@/lib/repositories/detail-view-model";

export default async function RepositoryDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(AUTH_SESSION_COOKIE)?.value;
  const user = sessionToken ? await getSessionUser(sessionToken) : null;

  if (!user) {
    redirect("/login");
  }

  const orgId = await getOrgIdForUser(user.id);
  if (!orgId) redirect("/repositories");

  const row = await getRepositoryById(id, orgId);
  if (!row) notFound();

  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  const webhookUrl = appUrl
    ? `${appUrl}/api/webhooks/github`
    : `https://${(await headers()).get("host") ?? "localhost"}/api/webhooks/github`;

  const vm = buildRepositoryDetailPageViewModel(user, row, webhookUrl);

  return (
    <AdminShell shell={vm.shell} topbar={vm.topbar} viewerName={vm.viewerName}>
      <RepositoryDetail repository={vm.repository} />
    </AdminShell>
  );
}
