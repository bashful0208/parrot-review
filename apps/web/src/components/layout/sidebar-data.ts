import type { DashboardNavItem } from "@/lib/dashboard/types";
import {
  LayoutDashboard,
  GitBranch,
  Play,
  Settings,
  BarChart3,
  Webhook,
  Cloud,
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

const SETTINGS_SUB_ITEMS: NavLinkItem[] = [
  { title: "Providers", url: "/settings/providers", icon: Cloud },
];

export function mapNavigationToGroups(navItems: DashboardNavItem[]): NavGroup[] {
  const nonSettings = navItems.filter((item) => item.icon !== "settings");
  const settingsItem = navItems.find((item) => item.icon === "settings");

  const items: NavItem[] = nonSettings.map((item) => ({
    title: item.label,
    url: item.href,
    icon: ICON_MAP[item.icon],
  }));

  if (settingsItem) {
    items.push({
      title: settingsItem.label,
      url: settingsItem.href,
      icon: ICON_MAP[settingsItem.icon],
      items: SETTINGS_SUB_ITEMS,
    });
  }

  return [{ title: "", items }];
}
