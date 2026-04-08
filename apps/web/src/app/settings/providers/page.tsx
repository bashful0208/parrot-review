import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import {
  AUTH_SESSION_COOKIE,
  getOrgIdForUser,
  getSessionUser,
  listAiProviderConfigs,
} from "@reviewer/core";

import AdminShell from "@/components/dashboard/AdminShell";
import ProviderList from "@/components/providers/ProviderList";
import { DASHBOARD_NAVIGATION } from "@/lib/dashboard/view-model";
import { getViewerName } from "@/lib/utils/viewer-name";

export default async function ProvidersPage() {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(AUTH_SESSION_COOKIE)?.value;
  const user = sessionToken ? await getSessionUser(sessionToken) : null;

  if (!user) {
    redirect("/login");
  }

  const orgId = await getOrgIdForUser(user.id);
  const rows = orgId ? await listAiProviderConfigs(orgId) : [];

  const providers = rows.map((r) => ({
    id: r.id,
    provider: r.provider,
    displayName: r.displayName,
    model: r.model,
    baseUrl: r.baseUrl,
    maskedKeySuffix: r.maskedKeySuffix,
    isActive: r.isActive,
    createdAt: r.createdAt.toISOString(),
  }));

  return (
    <AdminShell
      shell={{
        workspaceName: "Acme Engineering",
        currentPath: "/settings/providers",
        logoutHref: "/api/auth/logout",
        navigation: DASHBOARD_NAVIGATION.map((item) => ({ ...item })),
      }}
      topbar={{
        title: "AI 模型配置",
        summary: "",
        searchPlaceholder: "",
        rangeLabel: "",
      }}
      viewerName={getViewerName(user)}
    >
      <ProviderList providers={providers} />
    </AdminShell>
  );
}
