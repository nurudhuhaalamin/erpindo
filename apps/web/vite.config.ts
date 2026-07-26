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
      includeAssets: ["favicon.png", "brand/logo-erpindo.png"],
      manifest: {
        name: "ERPindo — ERP untuk UMKM Indonesia",
        short_name: "ERPindo",
        description:
          "Akuntansi double-entry, kasir POS, stok, penggajian PPh 21 TER, dan e-Faktur dalam satu aplikasi.",
        lang: "id",
        start_url: "/app",
        display: "standalone",
        // Fase 18a — terang-dulu. Ketiga nilai warna (di sini, meta
        // theme-color di index.html, dan --color-slate-50 di styles.css) tidak
        // saling tertaut secara otomatis, jadi harus disamakan manual supaya
        // splash PWA tidak berkedip warna lain sebelum aplikasi tampil.
        background_color: "#fafafa",
        theme_color: "#ffffff",
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
        // Data keuangan tidak boleh basi: /api selalu ke jaringan. Blog SSR &
        // sitemap/robots (Fase 10e) dilayani Worker — JANGAN dibajak app shell
        // agar pengunjung ber-service-worker tetap menerima HTML asli (SEO).
        navigateFallbackDenylist: [/^\/api\//, /^\/blog/, /^\/sitemap\.xml$/, /^\/robots\.txt$/],
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
    /**
     * Fase 17a — JANGAN meng-inline berkas font sebagai `data:` URI.
     *
     * Vite secara bawaan meng-inline aset di bawah 4 KB. Sebagian subset
     * JetBrains Mono (font angka yang ditambahkan fase ini) berukuran di bawah
     * ambang itu, sehingga ikut ter-inline — dan CSP aplikasi memakai
     * `font-src 'self'` (dikeraskan Fase 10h), yang menolak skema `data:`.
     * Akibatnya muncul console.error di SETIAP rute, yang berarti 45 asersi
     * sapuan rute di ui-sim gagal sekaligus.
     *
     * Melonggarkan CSP menjadi `font-src 'self' data:` akan menyelesaikannya
     * juga, tetapi menukar pengerasan keamanan demi kenyamanan build. Menahan
     * inline jauh lebih murah: font tetap disajikan dari origin sendiri.
     */
    assetsInlineLimit: (filePath) => !/\.(woff2?|ttf|otf|eot)$/i.test(filePath),
  },
});
