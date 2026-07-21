# erpindo

**ERP modern multi-tenant (SaaS) untuk UMKM & perusahaan menengah Indonesia** — ringan, berjalan di semua perangkat (web/PWA, mobile, desktop), dan dibangun sepenuhnya di atas **GitHub + Cloudflare**.

## Visi

Menyediakan ERP terjangkau berbahasa Indonesia yang mencakup Keuangan & Akuntansi, Penjualan, Pembelian, Inventori, POS (kasir), hingga HR & Payroll — dengan model langganan (subscription) dan biaya operasional yang sangat rendah berkat arsitektur serverless.

## Dokumen Perencanaan

| Dokumen | Isi |
|---|---|
| [docs/01-tanya-jawab-fundamental.md](docs/01-tanya-jawab-fundamental.md) | Jawaban 9 pertanyaan fundamental: modul ERP, technology stack, multi-tenant & monetisasi, performa, GitHub+Cloudflare-only, multi-perangkat, PWA/wrapper native, keamanan, desain UI |
| [docs/02-rencana-pengembangan.md](docs/02-rencana-pengembangan.md) | Blueprint lengkap: arsitektur sistem, rincian modul, pilihan stack & alasan, strategi multi-tenant & monetisasi, roadmap pengembangan bertahap |

## Ringkasan Teknologi

- **Backend:** Hono di Cloudflare Workers · **Database:** Cloudflare D1 (satu database per tenant) + Drizzle ORM
- **Frontend:** React + Vite · Tailwind CSS + shadcn/ui · PWA (installable & offline-capable)
- **Infrastruktur:** GitHub (kode + CI/CD) & Cloudflare (Workers, D1, R2, KV, Queues) — tanpa AWS/GCP/Azure

## Status

🚀 **Produk matang & terdeploy** — 40+ modul (akuntansi inti, penjualan/pembelian, POS, stok, pajak PPN/e-Faktur, HR & payroll, manufaktur, proyek, CRM, dll.), billing langganan, asisten AI, API publik + webhook, dan dukungan dwibahasa (ID/EN). Papan status untuk pemilik produk: [docs/STATUS.md](docs/STATUS.md) · log pekerjaan: [docs/log/](docs/log/).

### Pemaketan (per perusahaan / bulan · pengguna tak terbatas di semua paket)

| Paket | Harga | Cakupan |
|---|---|---|
| **Trial** | Rp0 (30 hari) | Akses penuh untuk mencoba |
| **Starter** | Rp499.000 | Akuntansi inti, penjualan/pembelian, POS, stok, pajak, laporan |
| **Business** | Rp999.000 | + operasional: HR & payroll, manufaktur, proyek, pengadaan, CRM, dll. |
| **Enterprise** | Rp2.499.000 | + skala: multi-entitas & konsolidasi, keamanan lanjutan (2FA/IP), API publik & webhook |

Perbedaan paket berdasarkan **kedalaman operasional & skala**, bukan jumlah pengguna. Pelanggan lama di-*grandfather* akses penuh. Rencana lengkap: [docs/04-rencana-monetisasi-tier.md](docs/04-rencana-monetisasi-tier.md).

## Menjalankan Secara Lokal

```bash
pnpm install
pnpm build        # build SPA (dilayani oleh Worker)
pnpm dev:api      # wrangler dev di http://127.0.0.1:8787 (API + aplikasi)
# atau untuk pengembangan frontend dengan hot-reload:
pnpm dev:web      # vite di http://127.0.0.1:5173 (proxy /api ke :8787)
```

Validasi: `pnpm typecheck && pnpm test && pnpm build && pnpm smoke` + `node scripts/ui-sim.mjs` + `pnpm lint` (smoke = 842 skenario end-to-end terhadap wrangler dev; ui-sim = 182 cek Chromium nyata; unit = 137).
