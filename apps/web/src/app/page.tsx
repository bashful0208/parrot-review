import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { AUTH_SESSION_COOKIE, getSessionUser } from "@reviewer/core";

import AdminShell from "@/components/dashboard/AdminShell";
import OverviewContent from "@/components/dashboard/OverviewContent";
import { buildDashboardViewModel } from "@/lib/dashboard/view-model";

export default async function Home() {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(AUTH_SESSION_COOKIE)?.value;
  const user = sessionToken ? await getSessionUser(sessionToken) : null;

  if (!user) {
    redirect("/login");
  }

  const dashboard = buildDashboardViewModel(user);

  return (
    <AdminShell
      shell={dashboard.shell}
      topbar={dashboard.topbar}
      viewerName={dashboard.hero.viewerName}
    >
      <OverviewContent dashboard={dashboard} />
    </AdminShell>
  );
}
