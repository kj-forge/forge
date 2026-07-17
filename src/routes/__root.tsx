/// <reference types="vite/client" />

import type { QueryClient } from "@tanstack/react-query";
import { createRootRouteWithContext, HeadContent, Outlet, Scripts } from "@tanstack/react-router";
import type { ReactNode } from "react";

import appCss from "../styles.css?url";

// The router-level QueryClient (created per request in getRouter) — routes
// reach it in loaders via context.queryClient.ensureQueryData(...).
export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      {
        name: "viewport",
        // interactive-widget: Android resizes the layout under the keyboard
        // (CTAs stay visible while typing); iOS ignores it and pans instead.
        content: "width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content",
      },
      { name: "theme-color", media: "(prefers-color-scheme: light)", content: "#ffffff" },
      { name: "theme-color", media: "(prefers-color-scheme: dark)", content: "#0c0c0d" },
      {
        name: "apple-mobile-web-app-capable",
        content: "yes",
      },
      {
        name: "apple-mobile-web-app-status-bar-style",
        content: "black-translucent",
      },
      { name: "apple-mobile-web-app-title", content: "Forge" },
      { name: "mobile-web-app-capable", content: "yes" },
      { title: "Forge — hybrid strength, forged daily" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "icon", type: "image/svg+xml", href: "/icon.svg" },
      { rel: "icon", type: "image/png", sizes: "192x192", href: "/icon-192.png" },
      { rel: "icon", type: "image/png", sizes: "512x512", href: "/icon-512.png" },
      { rel: "apple-touch-icon", sizes: "180x180", href: "/apple-touch-icon.png" },
    ],
  }),
  component: RootComponent,
  notFoundComponent: NotFound,
});

function RootComponent() {
  return (
    <RootDocument>
      <Outlet />
    </RootDocument>
  );
}

// Applies .dark before first paint (stored preference; no explicit choice
// falls back to the device default: dark on mobile, light on desktop — keep
// the 768px breakpoint in sync with shared/lib/theme.ts). Must be inline in
// <head> — a module would run after paint and flash the wrong theme.
// suppressHydrationWarning: the server can't know the class.
const themeInitScript = `(function(){try{var t=localStorage.getItem("forge-theme");var d=t==="dark"||(t!=="light"&&!matchMedia("(min-width: 768px)").matches);if(d)document.documentElement.classList.add("dark")}catch(e){}})()`;

function RootDocument({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: static theme bootstrap, no user input */}
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function NotFound() {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-2 p-6 text-center">
      <h1 className="font-bold text-4xl tracking-tight">404</h1>
      <p className="text-muted-foreground">The page you were looking for doesn't exist.</p>
    </main>
  );
}
