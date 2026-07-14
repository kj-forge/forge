import { BookOpen, CalendarDays, ChartNoAxesColumn, Home, type LucideIcon, Plus, User } from "lucide-react";

export interface NavItem {
  to: "/" | "/sessions" | "/sessions/new" | "/stats" | "/plan" | "/me";
  label: string;
  icon: LucideIcon;
  // Home must match exactly, otherwise "/" lights up on every route.
  exact: boolean;
  // The thumb bar holds five; sidebar-only destinations opt out here
  // (mobile reaches them through in-page entry points, e.g. the Home card).
  inTabBar: boolean;
  // Desktop sidebar list; Profil opts out — the avatar dropdown owns it there.
  inSidebar: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { to: "/", label: "Dziennik", icon: Home, exact: true, inTabBar: true, inSidebar: true },
  { to: "/sessions", label: "Historia", icon: BookOpen, exact: true, inTabBar: true, inSidebar: true },
  { to: "/sessions/new", label: "Nowa", icon: Plus, exact: true, inTabBar: true, inSidebar: true },
  { to: "/stats", label: "Statystyki", icon: ChartNoAxesColumn, exact: true, inTabBar: true, inSidebar: true },
  { to: "/plan", label: "Plan", icon: CalendarDays, exact: true, inTabBar: false, inSidebar: true },
  { to: "/me", label: "Profil", icon: User, exact: true, inTabBar: true, inSidebar: false },
];

export const TAB_BAR_ITEMS: NavItem[] = NAV_ITEMS.filter((i) => i.inTabBar);

export const SIDEBAR_ITEMS: NavItem[] = NAV_ITEMS.filter((i) => i.inSidebar);

// The bar stays visible on /plan even though it has no tab — it's a
// top-level browse context, not a focused flow like an active session.
const TAB_BAR_PATHS = new Set(["/", "/sessions", "/sessions/new", "/stats", "/plan", "/me"]);

function normalizePath(pathname: string): string {
  return pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
}

export function showsTabBar(pathname: string): boolean {
  return TAB_BAR_PATHS.has(normalizePath(pathname));
}

export function isActivePath(pathname: string, to: NavItem["to"]): boolean {
  return normalizePath(pathname) === to;
}
