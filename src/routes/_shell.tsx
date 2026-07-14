import { createFileRoute, Outlet } from "@tanstack/react-router";

import { Toaster } from "@/components/ui/sonner";
import { AppShell } from "@/shared/components/AppShell";

export const Route = createFileRoute("/_shell")({
  component: ShellLayout,
});

function ShellLayout() {
  return (
    <AppShell>
      <Outlet />
      <Toaster position="top-center" duration={4000} />
    </AppShell>
  );
}
