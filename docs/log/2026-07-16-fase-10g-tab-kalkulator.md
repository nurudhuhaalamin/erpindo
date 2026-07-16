# Fase 10g — Halaman bertab + Kalkulator bisnis

**Tanggal:** 16 Juli 2026
**Branch/PR:** `claude/erp-business-planning-8wx296` → PR #80
**Uji:** typecheck 4/4 · lint bersih · 33 unit · build · **smoke 745** (tak berubah — tanpa server) · **ui-sim 160** (dari 153)

Butir pemilik Fase 10: **13 (halaman panjang → bertab)**, **10 (kalkulator bisnis)**.
Seluruhnya **klien-saja** — tanpa endpoint, migrasi, atau perubahan API.

## 1. Komponen `Tabs` bersama

`components/ui.tsx` → `Tabs<T>({ tabs, active, onChange })` — bilah tab beraksesibilitas
(`role="tablist"`, tiap tombol `role="tab"` + `aria-selected`), difaktorkan dari pola hand-rolled
di `approvals.tsx`. Terkontrol: induk menyimpan `active`.

## 2. Pengaturan bertab (12 kartu → 5 tab)

`pages/settings.tsx` — kartu & **id input tidak berubah** (smoke & ui-sim aman), hanya
dikelompokkan:

- **Akun & Tampilan** (default): Profil saya, Mode tampilan (`#simpleMode`), Keamanan/2FA.
- **Perusahaan**: Langganan, Profil perusahaan, Perusahaan baru.
- **Tim & Peran**: Anggota, Peran kustom, Ambang persetujuan.
- **Data & Keamanan**: Ekspor & cadangan, Riwayat aktivitas.
- **Lainnya**: Tutup buku.

Tab default memuat `#simpleMode` sehingga alur Mode Sederhana ui-sim (F13) tetap hijau tanpa
perubahan.

## 3. Penggajian & Proyek bertab

- `pages/payroll.tsx` → tab **Karyawan** (default) / **Gaji** (jalankan + riwayat) / **Komponen** /
  **Kasbon** / **Cuti** / **Departemen**. Tab default = Karyawan sehingga form `#emp-name` (dipakai
  ui-sim F10) langsung tampak.
- `pages/projects.tsx` → detail proyek yang tadinya menumpuk panjang kini bertab **Ikhtisar**
  (garis waktu, beban kerja, transaksi ber-tag) / **Tugas** (Gantt + papan) / **Timesheet** /
  **Termin & RAB**.

## 4. Kalkulator bisnis `/app/alat`

Halaman baru `pages/alat.tsx` (menu **"Alat Bantu"** grup Lainnya), enam kalkulator bertab, semua
murni klien:

- **HPP per unit** — bahan + tenaga + overhead → HPP; margin → harga jual disarankan.
- **Markup vs Margin** — dari modal & harga jual, tampilkan markup% & margin%.
- **Titik Impas (BEP)** — biaya tetap ÷ margin kontribusi → unit & omzet impas.
- **PPh 21 (TER)** — **reuse `terCategory` + `terRate` dari `packages/shared/payroll`** (mesin yang
  sama dengan penggajian); bruto + PTKP → tarif efektif + PPh + take-home.
- **PPN** — DPP × 11%/12% → PPN + total.
- **Cicilan Kasbon** — pinjaman ÷ tenor → potongan gaji per bulan (flat, tanpa bunga).

## Pengujian

- **Smoke tetap 745** — tanpa perubahan server.
- **UI-sim +7** (seksi `F19`): Pengaturan memakai `role=tablist` + pindah ke tab Perusahaan; Penggajian
  default tab Karyawan (`#emp-name`) + pindah ke tab Kasbon; kalkulator render (HPP + Rupiah) + tab
  PPh 21 menampilkan tarif efektif. Asersi lama (F10 karyawan, F13 Mode Sederhana) tetap hijau
  karena tab default tiap halaman memuat elemen yang mereka pakai.

## Catatan

Pemblokir launching #1 tetap **Midtrans**. Berikutnya Fase 10h (keamanan + seed demo lengkap +
laporan akhir Fase 10).
