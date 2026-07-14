import { BookOpen, ChartNoAxesColumn, Home, type LucideIcon, Plus, User } from "lucide-react";

export interface NavItem {
  to: "/" | "/sessions" | "/sessions/new" | "/stats" | "/me";
  label: string;
  icon: LucideIcon;
  // Home must match exactly, otherwise "/" lights up on every route.
  exact: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { to: "/", label: "Dziennik", icon: Home, exact: true },
  { to: "/sessions", label: "Historia", icon: BookOpen, exact: true },
  { to: "/sessions/new", label: "Nowa", icon: Plus, exact: true },
  { to: "/stats", label: "Statystyki", icon: ChartNoAxesColumn, exact: true },
  { to: "/me", label: "Profil", icon: User, exact: true },
];

const TAB_BAR_PATHS = new Set(["/", "/sessions", "/sessions/new", "/stats", "/me"]);

function normalizePath(pathname: string): string {
  return pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
}

export function showsTabBar(pathname: string): boolean {
  return TAB_BAR_PATHS.has(normalizePath(pathname));
}

export function isActivePath(pathname: string, to: NavItem["to"]): boolean {
  return normalizePath(pathname) === to;
}
