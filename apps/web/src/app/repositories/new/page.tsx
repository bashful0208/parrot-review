import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { AUTH_SESSION_COOKIE, getSessionUser } from "@reviewer/core";

import AdminShell from "@/components/dashboard/AdminShell";
import ConnectWizard from "@/components/repositories/ConnectWizard";
import { buildConnectPageViewModel } from "@/lib/repositories/view-model";

export default async function NewRepositoryPage() {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(AUTH_SESSION_COOKIE)?.value;
  const user = sessionToken ? await getSessionUser(sessionToken) : null;

  if (!user) {
    redirect("/login");
  }

  const vm = buildConnectPageViewModel(user);

  return (
    <AdminShell shell={vm.shell} topbar={vm.topbar} viewerName={vm.viewerName}>
      <ConnectWizard />
    </AdminShell>
  );
}
