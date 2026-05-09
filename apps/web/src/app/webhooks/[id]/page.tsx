import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";

import {
  AUTH_SESSION_COOKIE,
  getOrgIdForUser,
  getSessionUser,
  getWebhookEventDetail,
} from "@reviewer/core";

import AdminShell from "@/components/layout/admin-shell";
import WebhookDetail from "@/components/webhooks/WebhookDetail";
import { buildWebhookDetailViewModel } from "@/lib/webhooks/view-model";

export default async function WebhookDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(AUTH_SESSION_COOKIE)?.value;
  const user = sessionToken ? await getSessionUser(sessionToken) : null;
  if (!user) {
    redirect("/login");
  }

  const orgId = await getOrgIdForUser(user.id);
  if (!orgId) notFound();

  const { id } = await params;
  const detail = await getWebhookEventDetail(id, orgId);
  if (!detail) notFound();

  const vm = buildWebhookDetailViewModel({ user, detail });

  return (
    <AdminShell shell={vm.shell} topbar={vm.topbar} viewerName={vm.viewerName}>
      <WebhookDetail detail={vm} />
    </AdminShell>
  );
}
