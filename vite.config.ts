import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  server: {
    port: 3000,
  },
  resolve: {
    tsconfigPaths: true,
  },
  plugins: [
    // Cloudflare plugin owns the SSR build environment ("ssr" is the TanStack
    // Start convention) and provides the Workers runtime under `vite dev` via
    // miniflare. Must precede tanstackStart so the SSR environment is attached
    // before TanStack's server-fns are wired through it.
    cloudflare({ viteEnvironment: { name: "ssr" } }),
    // Tailwind v4 must come before tanstackStart (per Tailwind TanStack Start guide)
    tailwindcss(),
    // VitePWA before tanstackStart so it sees the client build output
    VitePWA({
      // Manifest only (installable to home screen) — the full PWA scope by
      // design, no service worker / offline shell. See ADR-0024.
      injectRegister: false,
      includeAssets: ["icon.svg", "apple-touch-icon.png"],
      manifest: {
        name: "Forge",
        short_name: "Forge",
        description: "Hybrid strength training PWA. Hyrox journal with rehab tracking and AI coach.",
        theme_color: "#0a0a0a",
        background_color: "#0a0a0a",
        display: "standalone",
        orientation: "portrait",
        start_url: "/",
        scope: "/",
        icons: [
          {
            src: "icon-192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      devOptions: {
        // Serve manifest.webmanifest in `bun dev` so DevTools doesn't
        // report a 404 when previewing the PWA locally. Without this the
        // manifest is generated only at build time.
        enabled: true,
      },
    }),
    tanstackStart(),
    // viteReact must come after tanstackStart (per TanStack Start docs)
    viteReact(),
  ],
});
