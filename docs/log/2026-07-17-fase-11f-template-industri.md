# Fase 11f — Template industri (mulai cepat) + penutup Fase 11

**Tanggal:** 17 Juli 2026
**Branch/PR:** `claude/erp-business-planning-8wx296` → PR #82 (akumulasi Fase 11)
**Uji:** typecheck 4/4 · lint bersih · unit 49 · build · **smoke 774** (+4) · **ui-sim 160**

Fase terakhir: **onboarding lebih cepat** untuk pengguna baru + Laporan Akhir Fase 11
(`docs/log/2026-07-17-fase-11-laporan-akhir.md`).

## Template industri (mulai cepat)
Pengguna baru sering bingung mulai dari mana. Kini di halaman **Produk**, saat katalog masih kosong,
muncul kartu **"Mulai cepat: contoh data usaha"**: pilih jenis usaha (Retail/Kelontong, Kuliner/F&B,
Jasa/Servis, Grosir/Distribusi) → sekali klik mengisi **contoh produk + kontak** yang relevan
(harga jual/beli wajar, satuan sesuai) — semua bisa diubah/hapus kapan saja.

- **`shared`:** `INDUSTRY_KEYS` + label, `INDUSTRY_TEMPLATES` (produk & kontak per industri),
  `industryTemplateSchema`.
- **`routes/setup.ts`:** `POST /:tenantId/setup/industry-template` (admin) — sisipkan produk/kontak,
  **idempoten** (lewati SKU/kontak yang sudah ada).
- **Web:** `IndustryTemplateCard` di halaman Produk (muncul hanya saat katalog kosong).

## Uji
- **Smoke (+4, di tenant comped terisolasi):** retail → 5 produk + 2 kontak; terapkan ulang →
  idempoten (0 ditambahkan); jenis usaha tak dikenal → 400; viewer → 403.

## Catatan BI
Fondasi BI sudah kaya sejak fase sebelumnya (dashboard kustom + grafik tren Fase 7h, laporan
penjualan analitik Fase 5h, ekspor Excel, laporan LR/Neraca/Arus Kas). Report builder lanjutan
(drag-drop) dicatat sebagai peningkatan berikutnya, bukan pemblokir.
