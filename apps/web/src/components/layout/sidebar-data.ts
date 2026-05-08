import type { DashboardNavItem } from "@/lib/dashboard/types";
import {
  LayoutDashboard,
  GitBranch,
  Play,
  Settings,
  BarChart3,
  Webhook,
  type LucideIcon,
} from "lucide-react";

export interface NavLinkItem {
  title: string;
  url: string;
  icon?: LucideIcon;
  badge?: string;
}

export interface NavCollapsibleItem {
  title: string;
  url: string;
  icon?: LucideIcon;
  badge?: string;
  items: NavLinkItem[];
}

export type NavItem = NavLinkItem | NavCollapsibleItem;

export interface NavGroup {
  title: string;
  items: NavItem[];
}

const ICON_MAP: Record<DashboardNavItem["icon"], LucideIcon> = {
  overview: LayoutDashboard,
  repositories: GitBranch,
  runs: Play,
  settings: Settings,
  usage: BarChart3,
  webhooks: Webhook,
};

export function mapNavigationToGroups(navItems: DashboardNavItem[]): NavGroup[] {
  return [
    {
      title: "",
      items: navItems.map((item) => ({
        title: item.label,
        url: item.href,
        icon: ICON_MAP[item.icon],
      })),
    },
  ];
}
