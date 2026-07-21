# Log Kerja — Fase 13e: Multibahasa gelombang 2 (shell aplikasi + dashboard)

**Tanggal:** 18 Juli 2026.

## Yang dikerjakan

Melanjutkan i18n ke dalam aplikasi (setelah landing di 13d):

1. **Shell aplikasi dwibahasa** (`apps/web/src/pages/app.tsx`):
   - Label seluruh menu sidebar (44 rute) via peta `NAV_LABEL_EN` (dikunci per
     rute agar label Indonesia tetap sumber utama) + nama seksi via `SECTION_EN`
     (Transaksi→Transactions, Keuangan→Finance, Laporan→Reports, dst.).
   - Chrome shell: placeholder "Cari menu…" → "Search menu…", "Panduan" → "Guide",
     "Tidak ada menu cocok." → "No matching menu." Pencarian menu kini mencocokkan
     label Indonesia **dan** Inggris.
   - **LangSwitcher** dipasang di sidebar (ID/EN) — pilihan tersimpan & seluruh
     aplikasi ikut ter-render ulang (store i18n dari 13d).
2. **Dashboard dwibahasa** (`pages/dashboard.tsx`): sapaan menurut jam
   (Good morning/afternoon/evening/night), subjudul "Overview of … today", jumlah
   faktur jatuh tempo, tombol "Customize", dan **7 label KPI** (Cash & Bank,
   Sales This Month, Profit This Month, Receivables/Payables Outstanding, Inventory
   Value, Open Leads).
3. **ui-sim locale id-ID**: konteks Playwright kini `locale: "id-ID"` — pasar utama
   Indonesia; tanpa ini Chromium default en-US membuat i18n otomatis memilih Inggris
   dan asersi teks Indonesia gagal. Perbaikan yang tepat sekaligus realistis.

## Batas cakupan (jujur — long tail)

Isi halaman modul transaksi (Penjualan, Pembelian, POS, Stok, Kas & Bank, dll.)
masih berbahasa Indonesia — string per-halaman adalah ekor panjang yang dimigrasi
bertahap; kamus & pola (`useLang`, `L`, peta label) sudah siap sehingga tiap
halaman tinggal disisipi. Judul/menu/navigasi & dashboard — yang paling sering
dilihat — sudah Inggris penuh.

## Validasi

- UI-sim **176 → 179** (+3): toggle EN di aplikasi → menu sidebar (Sales, Inventory)
  + dashboard (Profit This Month, Good…/Overview of) berbahasa Inggris; kembali ke ID;
  bebas galat. Locale id-ID menjaga seluruh asersi Indonesia lama tetap hijau.
- Smoke 808 (tanpa perubahan backend) · unit 105 · typecheck 4/4 · lint bersih · build.
