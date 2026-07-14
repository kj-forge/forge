import { Link, useRouterState } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/shared/components/AppSidebar";
import { UserMenu } from "@/shared/components/UserMenu";
import { NAV_ITEMS, showsTabBar } from "@/shared/lib/nav";

// The window must never scroll (styles.css locks html/body): vaul's iOS
// scroll-lock manipulates window scroll and body position on open/close,
// which visibly shifts a scrolled page. All scrolling lives in <main>.
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
          <Link to="/" className="font-heading font-semibold md:hidden">
            Forge
          </Link>
          <div className="ml-auto flex items-center">
            <UserMenu />
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto">{children}</main>

        {/* Always mounted; collapses via grid-rows so show/hide slides
            instead of popping the layout. */}
        <div
          className={`grid shrink-0 transition-[grid-template-rows] duration-200 ease-out md:hidden ${
            tabBarVisible ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
          }`}
        >
          <div className="min-h-0 overflow-hidden">
            <nav className="grid grid-cols-4 border-t bg-background pb-[max(0.25rem,calc(env(safe-area-inset-bottom)-1rem))]">
              {NAV_ITEMS.map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  activeOptions={{ exact: item.exact }}
                  aria-label={item.label}
                  className="flex items-center justify-center py-2.5 text-foreground/70 data-[status=active]:text-foreground data-[status=active]:[&>svg]:stroke-[2.5]"
                  tabIndex={tabBarVisible ? undefined : -1}
                >
                  <item.icon className="size-6" />
                </Link>
              ))}
            </nav>
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
