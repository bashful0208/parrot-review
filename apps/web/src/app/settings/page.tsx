import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import {
  AUTH_SESSION_COOKIE,
  getOrgIdForUser,
  getSessionUser,
  getOrgOutputLanguage,
} from "@reviewer/core";

import AdminShell from "@/components/layout/admin-shell";
import LanguageForm from "./language-form";
import { DASHBOARD_NAVIGATION } from "@/lib/dashboard/view-model";
import { getViewerName } from "@/lib/utils/viewer-name";

export default async function SettingsPage() {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(AUTH_SESSION_COOKIE)?.value;
  const user = sessionToken ? await getSessionUser(sessionToken) : null;

  if (!user) {
    redirect("/login");
  }

  const orgId = await getOrgIdForUser(user.id);
  const currentLanguage = orgId ? await getOrgOutputLanguage(orgId) : "zh-CN";

  return (
    <AdminShell
      shell={{
        workspaceName: "Acme Engineering",
        currentPath: "/settings",
        logoutHref: "/api/auth/logout",
        navigation: DASHBOARD_NAVIGATION.map((item) => ({ ...item })),
      }}
      topbar={{
        title: "General Settings",
        summary: "",
        searchPlaceholder: "",
        rangeLabel: "",
      }}
      viewerName={getViewerName(user)}
    >
      <div className="mx-auto max-w-2xl space-y-8 py-2">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">General Settings</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Manage your workspace preferences and default review behaviour.
          </p>
        </div>
        <LanguageForm currentLanguage={currentLanguage} />
      </div>
    </AdminShell>
  );
}
