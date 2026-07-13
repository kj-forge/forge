import { Link, useRouterState } from "@tanstack/react-router";
import type { ReactNode } from "react";

import {
  NavigationMenu,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
} from "@/components/ui/navigation-menu";
import { NAV_ITEMS, showsTabBar } from "@/shared/lib/nav";

// The window must never scroll (styles.css locks html/body): vaul's iOS
// scroll-lock manipulates window scroll and body position on open/close,
// which visibly shifts a scrolled page. All scrolling lives in <main>.
export function AppShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const tabBarVisible = showsTabBar(pathname);

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex shrink-0 items-center gap-6 border-b px-4 pt-[max(0.5rem,env(safe-area-inset-top))] pb-2 md:py-2.5">
        <Link to="/" className="font-heading font-semibold">
          Forge
        </Link>
        <NavigationMenu className="hidden md:flex">
          <NavigationMenuList>
            {NAV_ITEMS.map((item) => (
              <NavigationMenuItem key={item.to}>
                <NavigationMenuLink asChild>
                  <Link to={item.to} activeOptions={{ exact: item.exact }} activeProps={{ "data-active": true }}>
                    {item.label}
                  </Link>
                </NavigationMenuLink>
              </NavigationMenuItem>
            ))}
          </NavigationMenuList>
        </NavigationMenu>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto">{children}</main>

      {tabBarVisible && (
        <nav className="grid shrink-0 grid-cols-4 border-t bg-background pb-[max(0.5rem,env(safe-area-inset-bottom))] md:hidden">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              activeOptions={{ exact: item.exact }}
              className="flex flex-col items-center gap-0.5 pt-2 pb-1 text-muted-foreground text-xs"
              activeProps={{ className: "text-foreground" }}
            >
              <item.icon className="size-5" />
              {item.label}
            </Link>
          ))}
        </nav>
      )}
    </div>
  );
}
