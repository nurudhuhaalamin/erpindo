# Log Kerja — Fase 13c: Halaman harga 4 paket + reposisi landing + form demo

**Tanggal:** 18 Juli 2026.

## Yang dikerjakan

1. **Bagian harga landing dirombak** (`apps/web/src/pages/landing/index.tsx`) — dari
   "satu harga" menjadi **3 kartu paket** (Starter/Business/Enterprise dari `PLAN_LIMITS`,
   Business berbadge "Paling populer") + baris Trial gratis. Setiap kartu menampilkan
   tagline sasaran ("toko/jasa", "PT dengan tim", "grup/holding") + fitur kunci; semua
   menegaskan **pengguna tak terbatas**.
2. **Kalkulator per-user implisit** — slider jumlah pengguna → "Sistem per-pengguna:
   Rp X/bln (dicoret)" vs "ERPindo: Tetap". Fungsi murni `perUserMonthlyCost()` +
   `ASSUMED_PER_USER_PRICE` (Rp350rb) di shared, dengan unit test.
3. **Tabel perbandingan kategori** (tanpa merek): Spreadsheet / Software akuntansi /
   ERP per-pengguna / ERP konvensional / **ERPindo** — biaya per user, modul operasional,
   waktu aktif, biaya implementasi, multi-perusahaan.
4. **Reposisi copy** — judul "dari toko pertama sampai grup perusahaan"; blok "Untuk grup
   & holding" (multi-entitas + konsolidasi) + blok "Layanan pendampingan" (migrasi/
   pelatihan → CTA demo); FAQ harga & pembayaran diperbarui (tiga paket, Midtrans).
5. **Form "Jadwalkan Demo"** (motion sales-assisted) — bagian `#demo` di landing: nama,
   perusahaan, email, telepon, jumlah karyawan, pesan. Backend PUBLIK **baru**
   `POST /api/demo-requests` (`apps/api/src/routes/demo.ts`, rate-limited per IP,
   tabel `demo_requests` via migrasi `0012`), notifikasi email ke admin platform bila
   Resend + `PLATFORM_ADMIN_EMAILS` terpasang (degradasi anggun). Listing untuk sales:
   `GET /api/admin/demo-requests` (platform admin).

## Catatan
- `demoRoutes` sengaja di berkas sendiri (bukan admin.ts) agar guard RBAC per-registrasi
  (`rbac-guard.test`) tetap presisi — kunci `demo.ts POST "/"` (publik) berbeda dari
  `admin.ts POST "/"` (feedback, ber-requireAuth).
- Halaman "Layanan" diwujudkan sebagai blok di bagian harga (bukan rute terpisah) —
  cukup untuk pesan layanan berbayar + CTA demo; rute khusus bisa menyusul bila perlu.

## Validasi

- Unit test **99 → 101** (+2 kalkulator per-user) — total shared 61, web 8, api 32.
- Smoke **796 → 800** (+4): permintaan demo publik 201, validasi 400, listing admin 200,
  non-admin 403.
- UI-sim **170 → 172** (+2): landing menampilkan 3 paket + kalkulator + perbandingan;
  form demo terisi & terkirim (201 + konfirmasi). Asersi harga lama (Rp389rb) diperbarui.
- Typecheck 4/4 · lint bersih · build.
