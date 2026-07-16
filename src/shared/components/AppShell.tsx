import { Link, useRouterState } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/shared/components/AppSidebar";
import { ForgeLogo } from "@/shared/components/ForgeLogo";
import { ProfileLink } from "@/shared/components/ProfileLink";
import { ThemeToggle } from "@/shared/components/ThemeToggle";
import { isActivePath, showsTabBar, TAB_BAR_ITEMS } from "@/shared/lib/nav";

// The window must never scroll (styles.css locks html/body): all scrolling
// lives in <main>, and modals bring their own scroll regions.
// Mobile never renders a SidebarTrigger, so the sidebar's Sheet variant
// stays closed — the tab bar is the mobile navigation.
export function AppShell({ children }: { children: ReactNode }) {
  // resolvedLocation, not location: during an async navigation `location`
  // already points at the target while the old page is still on screen —
  // keying visibility off it makes the tab bar vanish before the route
  // content swaps. resolvedLocation flips only once the new page renders.
  const pathname = useRouterState({ select: (s) => (s.resolvedLocation ?? s.location).pathname });
  const tabBarVisible = showsTabBar(pathname);

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="flex h-dvh min-h-0 flex-col">
        <header className="flex shrink-0 items-center gap-2 border-b px-4 pt-[max(0.5rem,env(safe-area-inset-top))] pb-2 md:py-2">
          <SidebarTrigger className="hidden md:flex" />
          <Link to="/" className="md:hidden" aria-label="Forge — start">
            <ForgeLogo className="text-lg" />
          </Link>
          <div className="ml-auto flex items-center gap-1">
            <ThemeToggle />
            <ProfileLink />
          </div>
        </header>

        {/* Bottom breathing room above the tab bar belongs to the shell, not
            each view (their p-4 adds up with the pb-2 to 24px). Off on
            routes without the bar — those end with sticky action footers. */}
        <main className={`min-h-0 flex-1 overflow-y-auto ${tabBarVisible ? "pb-2 md:pb-0" : ""}`}>{children}</main>

        {/* Always mounted; collapses via grid-rows so show/hide slides
            instead of popping the layout. */}
        <div
          className={`grid shrink-0 transition-[grid-template-rows] duration-200 ease-out md:hidden ${
            tabBarVisible ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
          }`}
        >
          <div className="min-h-0 overflow-hidden">
            <nav className="grid grid-cols-5 border-t bg-background py-2">
              {/* Active state from resolvedLocation (not Link's own matching,
                  which flips at navigation START): the highlight moves in the
                  same frame the new page renders, together with the bar. */}
              {TAB_BAR_ITEMS.map((item) =>
                item.to === "/sessions/new" ? (
                  // The one action among destinations — an ember button, not a tab.
                  <Link
                    key={item.to}
                    to={item.to}
                    aria-label={item.label}
                    className="flex items-center justify-center py-0.5"
                    tabIndex={tabBarVisible ? undefined : -1}
                  >
                    <span className="grid size-11 place-items-center rounded-full bg-ember shadow-ember">
                      <item.icon className="size-6" />
                    </span>
                  </Link>
                ) : (
                  <Link
                    key={item.to}
                    to={item.to}
                    aria-label={item.label}
                    aria-current={isActivePath(pathname, item.to, item.exact) ? "page" : undefined}
                    data-active={isActivePath(pathname, item.to, item.exact) || undefined}
                    className="flex items-center justify-center py-2 text-foreground/70 transition-colors data-active:text-foreground data-active:[&>svg]:stroke-[2.5]"
                    tabIndex={tabBarVisible ? undefined : -1}
                  >
                    <item.icon className="size-6" />
                  </Link>
                ),
              )}
            </nav>
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
