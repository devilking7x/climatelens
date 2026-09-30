import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: "auto",
      workbox: {
        // App shell works offline; API calls fail honestly and the UI
        // shows "data unavailable" instead of fake numbers.
        globPatterns: ["**/*.{js,css,html,ico,png,svg,webmanifest}"],
        navigateFallback: "index.html",
      },
      manifest: {
        name: "ClimateLens — AI climate assistant",
        short_name: "ClimateLens",
        description:
          "Ask about any city's climate: real data, charts and tamper-evident reports.",
        start_url: ".",
        display: "standalone",
        background_color: "#06251f",
        theme_color: "#06251f",
        icons: [
          { src: "icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icons/icon-512.png", sizes: "512x512", type: "image/png" },
          {
            src: "icons/icon-maskable-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
    }),
  ],
  build: { outDir: "dist", emptyOutDir: true },
  server: {
    port: 5173,
    proxy: { "/api": { target: "http://localhost:8788", changeOrigin: true } },
  },
});
