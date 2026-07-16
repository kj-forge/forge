import { Link, useRouterState } from "@tanstack/react-router";

import { Button } from "@/components/ui/button";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { ForgeLogo } from "@/shared/components/ForgeLogo";
import { isActivePath, MANAGE_SECTIONS, SIDEBAR_ITEMS } from "@/shared/lib/nav";

export function AppSidebar() {
  const pathname = useRouterState({ select: (s) => (s.resolvedLocation ?? s.location).pathname });

  return (
    <Sidebar>
      <SidebarHeader>
        <Link to="/" className="px-2 py-1.5" aria-label="Forge — start">
          <ForgeLogo className="text-xl" />
        </Link>
        <Link to="/sessions/new" className="px-2 pb-1">
          <Button size="sm" className="w-full bg-ember shadow-ember">
            + Nowa sesja
          </Button>
        </Link>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarMenu>
            {SIDEBAR_ITEMS.map((item) => (
              <SidebarMenuItem key={item.to}>
                <SidebarMenuButton asChild isActive={isActivePath(pathname, item.to, item.exact)}>
                  <Link to={item.to}>
                    <item.icon />
                    {item.label}
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>Zarządzanie</SidebarGroupLabel>
          <SidebarMenu>
            {MANAGE_SECTIONS.flatMap((section) => section.items).map((item) => (
              <SidebarMenuItem key={item.to}>
                <SidebarMenuButton asChild isActive={isActivePath(pathname, item.to)}>
                  <Link to={item.to}>
                    <item.icon />
                    {item.label}
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
