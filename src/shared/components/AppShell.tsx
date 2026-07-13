import { Link, useRouterState } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { NAV_ITEMS, showsTabBar } from "@/shared/lib/nav";

// The window must never scroll (styles.css locks html/body): vaul's iOS
// scroll-lock manipulates window scroll and body position on open/close,
// which visibly shifts a scrolled page. All scrolling lives in <main>.
export function AppShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const tabBarVisible = showsTabBar(pathname);

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex shrink-0 items-center justify-between border-b px-4 pt-[max(0.5rem,env(safe-area-inset-top))] pb-2 md:hidden">
        <span className="font-heading font-semibold">Forge</span>
      </header>

      <div className="flex min-h-0 flex-1">
        <nav className="hidden w-48 shrink-0 flex-col gap-1 border-r p-4 md:flex">
          <span className="px-3 pb-4 font-heading font-semibold text-lg">Forge</span>
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              activeOptions={{ exact: item.exact }}
              className="flex items-center gap-3 rounded-md px-3 py-2 text-muted-foreground text-sm hover:bg-accent"
              activeProps={{ className: "bg-accent font-medium text-foreground" }}
            >
              <item.icon className="size-4" />
              {item.label}
            </Link>
          ))}
        </nav>

        <main className="min-h-0 flex-1 overflow-y-auto">{children}</main>
      </div>

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
