import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { AUTH_SESSION_COOKIE, getOrgIdForUser, getSessionUser, listRepositoriesByOrganization } from "@reviewer/core";

import AdminShell from "@/components/layout/admin-shell";
import RepositoryList from "@/components/repositories/RepositoryList";
import { buildRepositoriesViewModel } from "@/lib/repositories/view-model";

export default async function RepositoriesPage() {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(AUTH_SESSION_COOKIE)?.value;
  const user = sessionToken ? await getSessionUser(sessionToken) : null;

  if (!user) {
    redirect("/login");
  }

  const orgId = await getOrgIdForUser(user.id);
  const rows = orgId ? await listRepositoriesByOrganization(orgId) : [];
  const vm = buildRepositoriesViewModel(user, rows);

  return (
    <AdminShell shell={vm.shell} topbar={vm.topbar} viewerName={vm.viewerName}>
      <RepositoryList repositories={vm.repositories} />
    </AdminShell>
  );
}
