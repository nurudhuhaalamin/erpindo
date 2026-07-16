# Fase 10f — Wizard awal + Panduan dalam aplikasi + Tur per halaman

**Tanggal:** 16 Juli 2026
**Branch/PR:** `claude/erp-business-planning-8wx296` → PR #79
**Uji:** typecheck 4/4 · lint bersih · 33 unit · build · **smoke 745** (tak berubah — tanpa endpoint baru) · **ui-sim 153** (dari 145)

Butir pemilik Fase 10: **7 (panduan dalam app)**, **8 (tur per halaman)**, **9 (wizard onboarding)**.
Seluruhnya **klien-saja** — tanpa endpoint, migrasi, atau perubahan API.

## 1. Wizard awal `/app/mulai`

Halaman baru `pages/mulai.tsx` — empat langkah **skippable** untuk pengguna baru:

1. **Profil perusahaan** — alamat & NPWP (`api.updateSettings`), untuk kop faktur.
2. **Pengalaman akuntansi** — "Saya pemula" → `setSimpleMode(true)` (sembunyikan menu jurnal/buku
   besar) atau "Saya sudah paham" → mode penuh.
3. **Produk pertama** — `api.createItem("products", …)` (divalidasi `productSchema`).
4. **Kontak pertama** — pelanggan/pemasok (`contactSchema`).

Indikator langkah, tombol "Lewati" per langkah + "Lewati semua ke dasbor"; selesai → dasbor.
Pendaftar baru kini diarahkan ke `/app/mulai` (RegisterPage & GoogleCompanyStep di `auth.tsx`).
Kartu **"Mulai cepat"** di dasbor menaut ke wizard ("Buka pandu cepat →"). Tanpa API/migrasi baru
— semuanya memakai endpoint yang sudah ada.

## 2. Panduan DALAM aplikasi

Konten & renderer panduan yang sudah ada (`pages/panduan/content`) kini juga dilayani **di dalam
app shell** tanpa berpindah situs:

- Ekstraksi `GuideSections` + `iconFor` (di-export dari `pages/panduan/index.tsx`) → dipakai ulang
  oleh halaman publik maupun in-app **tanpa duplikasi markup**.
- Halaman baru `pages/panduan-app.tsx`: `PanduanAppIndexPage` (grid modul + pencarian) &
  `PanduanAppModulePage` (artikel + navigasi prev/next), semuanya menaut ke rute internal.
- Rute lazy `/app/panduan` + `/app/panduan/$modul` (`main.tsx`).
- Tombol **"?"** topbar (`HelpLink`) kini **navigasi router internal** ke `/app/panduan/<slug>`
  (tak lagi membuka tab situs publik); tautan sidebar "Panduan" → `/app/panduan`. Tombol "Buka
  halaman" pada artikel memakai `mod.appPath` sebagai `Link` router.

## 3. Tur per halaman (PageTour)

Komponen homegrown `PageTour` di `components/ui.tsx` (tanpa pustaka):

- Overlay **spotlight** dihitung dari `getBoundingClientRect` elemen sasaran (ring + bayangan gelap
  besar); tooltip berisi judul/isi + Kembali/Lanjut/Selesai; **Escape** menutup. Langkah tanpa
  selector (atau elemen tak ditemukan) tampil sebagai kartu tengah. Menutup menandai tur "sudah
  dilihat" via `localStorage` `erpindo-tour:<id>` (pola `SIMPLE_MODE_KEY`).
- Registri `tours.ts`: tur untuk **10 halaman** (dasbor, POS, penjualan, pembelian, stok, jurnal,
  laporan, penggajian, CRM, pengaturan), dipetakan ke rute lewat prefix.
- Integrasi satu titik di `AppShell`: `TourLauncher` menampilkan tombol **"Tur"** di topbar bila
  rute aktif punya tur, dan me-render `PageTour`. Tur **dasbor tampil otomatis sekali** untuk
  pengguna baru (`AUTO_TOUR_IDS`); sisanya dibuka lewat tombol.

## Pengujian

- **Smoke tetap 745** — Fase 10f tak menyentuh server.
- **UI-sim +8** (seksi `F18`): wizard render + maju antar langkah; panduan dalam app render di dalam
  shell (sidebar tetap tampak) + artikel modul; tur dibuka lewat tombol topbar → dialog + tombol
  Lanjut → maju ke langkah 2 (tombol Kembali muncul). Sapuan rute melindungi asersi lama dengan
  `addInitScript` menandai tur dasbor "sudah dilihat" agar tak menutupi konten.

## Catatan

Tur & wizard sepenuhnya opsional dan bisa dilewati — tidak menghalangi pengguna berpengalaman.
Pemblokir launching #1 tetap **Midtrans**.
