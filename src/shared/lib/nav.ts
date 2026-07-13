import { BookOpen, Home, type LucideIcon, Plus, User } from "lucide-react";

export interface NavItem {
  to: "/" | "/sessions" | "/sessions/new" | "/me";
  label: string;
  icon: LucideIcon;
  // Home must match exactly, otherwise "/" lights up on every route.
  exact: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { to: "/", label: "Dziennik", icon: Home, exact: true },
  { to: "/sessions", label: "Historia", icon: BookOpen, exact: true },
  { to: "/sessions/new", label: "Nowa", icon: Plus, exact: true },
  { to: "/me", label: "Profil", icon: User, exact: true },
];

const TAB_BAR_PATHS = new Set(["/", "/sessions", "/sessions/new", "/me"]);

export function showsTabBar(pathname: string): boolean {
  const normalized = pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
  return TAB_BAR_PATHS.has(normalized);
}
