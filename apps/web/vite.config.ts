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
        name: "erpindo — ERP untuk UMKM Indonesia",
        short_name: "erpindo",
        description:
          "Akuntansi double-entry, kasir POS, stok, penggajian PPh 21 TER, dan e-Faktur dalam satu aplikasi.",
        lang: "id",
        start_url: "/app",
        display: "standalone",
        background_color: "#ffffff",
        theme_color: "#4f46e5",
        icons: [
          { src: "/pwa-192.png", sizes: "192x192", type: "image/png" },
          { src: "/pwa-512.png", sizes: "512x512", type: "image/png" },
          { src: "/pwa-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
        shortcuts: [
          { name: "Kasir (POS)", url: "/app/pos", icons: [{ src: "/pwa-192.png", sizes: "192x192" }] },
          { name: "Penjualan", url: "/app/penjualan", icons: [{ src: "/pwa-192.png", sizes: "192x192" }] },
          { name: "Dashboard", url: "/app", icons: [{ src: "/pwa-192.png", sizes: "192x192" }] },
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
