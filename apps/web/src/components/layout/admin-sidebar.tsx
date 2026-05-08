"use client";

import Link from "next/link";
import { ChevronUp } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import type { NavGroup as NavGroupProps } from "./sidebar-data";
import { NavGroup } from "./nav-group";

export function AdminSidebar({
  navGroups,
  viewerName,
  workspaceName,
  logoutHref,
}: {
  navGroups: NavGroupProps[];
  viewerName: string;
  workspaceName: string;
  logoutHref: string;
}) {
  return (
    <Sidebar collapsible="icon" variant="sidebar">
      <SidebarHeader>
        <div className="flex items-center gap-3 px-2 py-3">
          <img
            src="/logo.png"
            alt="parrot-review logo"
            className="h-8 w-8 shrink-0 rounded-xl object-cover"
          />
          <div className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
            <p className="truncate text-sm font-semibold tracking-tight">
              parrot-review
            </p>
            <p className="truncate text-[11px] text-sidebar-foreground/50">
              {workspaceName}
            </p>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent>
        {navGroups.map((props) => (
          <NavGroup key={props.title} {...props} />
        ))}
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton className="h-12">
                  <Avatar className="h-7 w-7 shrink-0 rounded-full">
                    <AvatarImage
                      src={`https://avatar.vercel.sh/${encodeURIComponent(viewerName)}.png`}
                      alt={viewerName}
                    />
                    <AvatarFallback className="text-xs">
                      {viewerName.slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <span className="group-data-[collapsible=icon]:hidden">
                    {viewerName}
                  </span>
                  <ChevronUp className="ms-auto h-4 w-4 group-data-[collapsible=icon]:hidden" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="top" className="w-56">
                <DropdownMenuItem asChild>
                  <form action={logoutHref} method="post" className="w-full">
                    <button type="submit" className="w-full text-start">
                      Log out
                    </button>
                  </form>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
