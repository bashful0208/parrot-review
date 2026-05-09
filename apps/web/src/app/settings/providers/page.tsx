import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import {
  AUTH_SESSION_COOKIE,
  getOrgIdForUser,
  getSessionUser,
  listAiProviderConfigs,
} from "@reviewer/core";

import AdminShell from "@/components/layout/admin-shell";
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
        title: "AI Providers",
        summary: "",
        searchPlaceholder: "",
        rangeLabel: "",
      }}
      viewerName={getViewerName(user)}
    >
      <div className="mx-auto max-w-3xl space-y-8 py-2">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">AI Providers</h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Manage API keys and model configurations for AI-powered code reviews.
            </p>
          </div>
        </div>
        <ProviderList providers={providers} />
      </div>
    </AdminShell>
  );
}
