import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  server: {
    port: 3000,
  },
  resolve: {
    tsconfigPaths: true,
  },
  plugins: [
    // Tailwind v4 must come before tanstackStart (per Tailwind TanStack Start guide)
    tailwindcss(),
    // VitePWA before tanstackStart so it sees the client build output
    VitePWA({
      // PR-3 scope: manifest only (makes the app installable to home screen).
      // Service worker / offline shell will be added later, alongside the
      // Electric SQL local-first sync work — that's the natural moment to
      // wire Workbox + the runtime cache + the sync queue together.
      //
      // We tried `strategies: 'generateSW'` (default) and `'injectManifest'`
      // during PR-3; both produced manifest.webmanifest but no sw.js under
      // TanStack Start's dual client/server build pipeline. Reported issues
      // exist in the ecosystem; revisit when adding Electric.
      injectRegister: false,
      includeAssets: ["icon.svg"],
      manifest: {
        name: "Forge",
        short_name: "Forge",
        description:
          "Hybrid strength training PWA. Local-first with Postgres + Electric SQL, AI coach.",
        theme_color: "#0a0a0a",
        background_color: "#0a0a0a",
        display: "standalone",
        orientation: "portrait",
        start_url: "/",
        scope: "/",
        icons: [
          {
            src: "icon.svg",
            sizes: "any",
            type: "image/svg+xml",
            purpose: "any",
          },
          {
            src: "icon.svg",
            sizes: "any",
            type: "image/svg+xml",
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
