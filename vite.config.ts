import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";

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
    tanstackStart(),
    // viteReact must come after tanstackStart (per TanStack Start docs)
    viteReact(),
  ],
});
