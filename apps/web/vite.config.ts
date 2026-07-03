import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icon.svg"],
      manifest: {
        name: "erpindo",
        short_name: "erpindo",
        description: "ERP modern untuk UMKM Indonesia",
        lang: "id",
        start_url: "/app",
        display: "standalone",
        background_color: "#ffffff",
        theme_color: "#0f766e",
        icons: [
          { src: "/pwa-192.png", sizes: "192x192", type: "image/png" },
          { src: "/pwa-512.png", sizes: "512x512", type: "image/png" },
          { src: "/pwa-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        // App shell tercache → aplikasi tetap terbuka saat offline.
        navigateFallback: "/index.html",
        // Data keuangan tidak boleh basi: /api selalu ke jaringan.
        navigateFallbackDenylist: [/^\/api\//],
        globPatterns: ["**/*.{js,css,html,svg,png,webmanifest}"],
      },
    }),
  ],
  server: {
    port: 5173,
    // Selama pengembangan, API dilayani wrangler dev di :8787.
    proxy: {
      "/api": "http://127.0.0.1:8787",
    },
  },
  build: {
    sourcemap: false,
  },
});
