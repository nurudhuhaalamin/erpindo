# Log Kerja — Fase 13d: Fondasi multibahasa (ID + EN) + landing dwibahasa (gelombang 1)

**Tanggal:** 18 Juli 2026.

## Yang dikerjakan

1. **Infrastruktur i18n ringan tanpa pustaka** (`apps/web/src/i18n/index.ts`) — tipe
   `Lang` (id/en), store level-modul + `useSyncExternalStore` (semua konsumen ikut
   ter-render saat bahasa diganti, tanpa Provider di root), deteksi `navigator.language`,
   pilihan tersimpan di localStorage, atribut `<html lang>` ikut disetel. Kamus UI chrome
   `DICT` + hook `useT()` + helper `pick()`. Menambah bahasa = menambah kolom kamus.
2. **Pemilih bahasa** (`apps/web/src/i18n/LangSwitcher.tsx`) — tombol ID/EN ringkas,
   dipasang di header landing (desktop + drawer mobile).
3. **Landing dwibahasa (gelombang 1 — permukaan kesan-pertama & konversi):** header/nav,
   hero (badge, judul, subjudul, CTA, microcopy), bagian **harga** (judul, subjudul, 3
   kartu paket lengkap dengan tagline + fitur + badge "Populer" + tombol), dan **form
   Jadwalkan Demo** (judul, placeholder, tombol, konfirmasi, pesan galat) kini ikut bahasa
   aktif. Data tier (`TIER_INFO`) dijadikan dwibahasa `{id, en}`.

## Batas cakupan (jujur — gelombang 2 = Fase 13e)

Prosa landing yang lebih dalam masih berbahasa Indonesia di gelombang ini: showcase produk,
grup fitur, tabel perbandingan Excel, poin keamanan, FAQ, serta blok kalkulator/perbandingan
kategori/grup-holding (judul & isi). Halaman **auth** (masuk/daftar) dan **shell aplikasi**
(sidebar, dashboard, halaman modul) juga menyusul. Kamus & pola sudah siap sehingga tiap
permukaan tinggal migrasi string — direncanakan bertahap di 13e dan seterusnya.

## Validasi

- Unit test **101 → 105** (+4 i18n core: default ID, setLang, pick, kelengkapan kamus).
- UI-sim **172 → 174** (+2): toggle EN → hero + harga berbahasa Inggris ("all in one app",
  "Most popular", "/month"); toggle kembali ke ID.
- Smoke 800 (tanpa perubahan backend) · typecheck 4/4 · lint bersih · build.
