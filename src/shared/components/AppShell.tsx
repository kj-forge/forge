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
  const pathname = useRouterState({ select: (s) => s.location.pathname });
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

        {tabBarVisible && (
          <nav className="grid shrink-0 grid-cols-4 border-t bg-background pb-[max(0.25rem,env(safe-area-inset-bottom))] md:hidden">
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                activeOptions={{ exact: item.exact }}
                className="flex flex-col items-center gap-0.5 pt-1.5 pb-0.5 text-muted-foreground text-xs"
                activeProps={{ className: "text-foreground" }}
              >
                <item.icon className="size-5" />
                {item.label}
              </Link>
            ))}
          </nav>
        )}
      </SidebarInset>
    </SidebarProvider>
  );
}
