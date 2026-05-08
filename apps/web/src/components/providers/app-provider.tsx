"use client";

import { SidebarProvider } from "@/components/ui/sidebar";

function getCookie(name: string): string | undefined {
  if (typeof document === "undefined") return undefined;
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match?.[1];
}

export function AppProvider({
  children,
  defaultOpen = true,
}: {
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  return <SidebarProvider defaultOpen={defaultOpen}>{children}</SidebarProvider>;
}
