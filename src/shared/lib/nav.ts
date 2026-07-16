import {
  BookOpen,
  CalendarDays,
  ChartNoAxesColumn,
  Dumbbell,
  Home,
  type LucideIcon,
  Plus,
  Settings,
  Target,
} from "lucide-react";

export interface NavItem {
  to: "/" | "/sessions" | "/sessions/new" | "/stats" | "/plan" | "/goals";
  label: string;
  icon: LucideIcon;
  // Home must match exactly, otherwise "/" lights up on every route.
  exact: boolean;
  // The thumb bar holds five; sidebar-only destinations opt out here
  // (mobile reaches them through in-page entry points, e.g. the Home card).
  inTabBar: boolean;
  // Desktop sidebar list; Profil opts out — the header avatar links to it.
  inSidebar: boolean;
}

// The daily loop: tab bar (mobile) + the top sidebar group (desktop).
export const NAV_ITEMS: NavItem[] = [
  { to: "/", label: "Dziennik", icon: Home, exact: true, inTabBar: true, inSidebar: true },
  { to: "/sessions", label: "Historia", icon: BookOpen, exact: true, inTabBar: true, inSidebar: true },
  { to: "/sessions/new", label: "Nowa", icon: Plus, exact: true, inTabBar: true, inSidebar: false },
  // Non-exact: /stats/$slug details keep the Statystyki link active.
  { to: "/stats", label: "Statystyki", icon: ChartNoAxesColumn, exact: false, inTabBar: true, inSidebar: true },
  { to: "/plan", label: "Plan", icon: CalendarDays, exact: true, inTabBar: false, inSidebar: true },
  { to: "/goals", label: "Cele", icon: Target, exact: true, inTabBar: true, inSidebar: true },
];

export interface ManageItem {
  to: "/exercises" | "/me/konto";
  label: string;
  icon: LucideIcon;
}

export interface ManageSection {
  label: string;
  items: ManageItem[];
}

// Management surfaces: rarely used, grow with the product. One config renders
// them everywhere — the "Zarządzanie" sidebar group (desktop) and the section
// lists of the /me Profil hub (mobile).
export const MANAGE_SECTIONS: ManageSection[] = [
  { label: "Biblioteka", items: [{ to: "/exercises", label: "Ćwiczenia", icon: Dumbbell }] },
  { label: "Konto", items: [{ to: "/me/konto", label: "Dane konta", icon: Settings }] },
];

export const TAB_BAR_ITEMS: NavItem[] = NAV_ITEMS.filter((i) => i.inTabBar);

export const SIDEBAR_ITEMS: NavItem[] = NAV_ITEMS.filter((i) => i.inSidebar);

// Derived, not hand-maintained: the bar shows on every top-level browse
// context — the daily loop, the Profil hub and its manage screens — and
// hides on focused flows (active session, stats detail).
const TAB_BAR_PATHS = new Set<string>([
  ...NAV_ITEMS.map((i) => i.to),
  "/me",
  ...MANAGE_SECTIONS.flatMap((s) => s.items.map((i) => i.to)),
]);

function normalizePath(pathname: string): string {
  return pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
}

export function showsTabBar(pathname: string): boolean {
  return TAB_BAR_PATHS.has(normalizePath(pathname));
}

export function isActivePath(pathname: string, to: string, exact = true): boolean {
  const path = normalizePath(pathname);
  if (exact) return path === to;
  return path === to || path.startsWith(`${to}/`);
}
