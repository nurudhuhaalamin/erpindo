# Log Kerja — Fase 10b: Harga tunggal Rp389rb + akun demo publik + overhaul landing

**Tanggal:** 16 Juli 2026 · PR kedua Fase 10. Menjawab butir 6 (satu harga), 15 (akun demo
read-only), dan 16 (pembaharuan landing).

## Satu harga untuk semua (butir 6)

- `SINGLE_PLAN` baru di shared: paket **"Lengkap" Rp389.000/bulan** — seluruh modul, pengguna
  tak terbatas. `PLAN_LIMITS`/`PLAN_LABELS` diarahkan ke nilai tunggal itu **tanpa mengubah enum
  kolom `plan`** (data tenant lama tetap valid); trial 30 hari tidak berubah.
- Landing: seksi harga 3 kartu → **1 kartu** ("Satu harga. Semua fitur. Titik.") berisi 4
  keunggulan + daftar 16 modul yang semuanya termasuk; kartu Langganan di Pengaturan ikut
  menampilkan harga tunggal.

## Akun demo publik baca-saja (butir 15)

- **`POST /api/auth/demo`** (rate-limited 10/5 menit): membuat sesi user tetap
  `demo-viewer@erpindo.id` ber-peran **viewer** di PT Demo Sejahtera. Endpoint
  **self-provisioning** — user + keanggotaan dibuat sendiri saat pertama dipakai (produksi yang
  sudah ter-seed langsung jalan tanpa seeding ulang); password acak tak pernah keluar dari
  proses, jadi jalur login biasa mustahil.
- Read-only ditegakkan **server-side**: peran viewer ditolak semua endpoint tulis tenant, dan
  endpoint mutasi akun (buat perusahaan, profil, ganti password, 2FA) memblokir email demo
  (403). `MeResponse.user.isDemo` (additive) menyalakan **banner "Mode demo"** di aplikasi
  dengan ajakan daftar gratis.
- Tombol **"Lihat Demo"** di hero + kartu harga landing; masuk tanpa membuat akun.

## Landing overhaul (butir 16)

Hero CTA ganda (Coba Gratis 30 Hari / Lihat Demo), seksi keamanan baru "Data bisnis Anda, aman
di tangan Anda" (DB terisolasi, 2FA, audit log, ekspor data kapan pun), FAQ +3 (kenapa satu
harga · demo tanpa daftar · apa yang terjadi bila berhenti), angka trust bar 800+ uji otomatis.
Tautan /blog menyusul di Fase 10e bersama blog SSR (tidak dipasang sekarang agar tak ada tautan
mati).

## Catatan teknis

- Pool DB tenant lokal (6 binding) sudah terpakai penuh oleh smoke → var **`DEMO_TENANT_SLUG`**
  meng-override slug perusahaan demo untuk suite uji (menunjuk tenant comped "Cabang Dewi" agar
  penolakan tulis = 403 peran, bukan 402 baca-saja langganan). Default produksi tetap
  `pt-demo-sejahtera`.
- Guard permanen rbac-guard menangkap endpoint publik baru → `/demo` masuk PUBLIC_ALLOWLIST
  dengan alasan tercatat.

## Validasi

Typecheck · lint bersih · unit 33 (rbac-guard diperbarui) · build · **smoke 668 → 677** (+9:
demo 404 pra-seed, masuk 200, viewer+isDemo, baca 200, tulis 403, buat-perusahaan 403, profil
403, 2FA 403, idempoten) · **UI-SIM 132 → 137** (+5: harga Rp389.000 tampil, tombol Lihat Demo,
klik → banner Mode demo, masuk PT Demo Sejahtera, bebas galat). Bukti visual terkirim.

## Berikutnya

Fase 10c: edit & hapus/void transaksi terposting (butir 3 — PENTING) sesuai RANCANGAN 10c.
