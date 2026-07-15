# LAPORAN AKHIR FASE 8 — Pemulihan, Portabilitas Data & Fondasi Struktural

**Tanggal:** 15 Juli 2026 · **4 PR (8a–8d) selesai.** Uji e2e **617 → 648** + 24 unit test.

## Latar

Fase 8 dipicu tiga hal: (1) **CI `main` merah** akibat lima commit eksternal 14 Juli (ESLint/
Prettier tanpa regenerasi lockfile + config cacat); (2) **dokumen analisis gap pemilik**
(12 Juli) yang tervalidasi akurat — modul "dalam bila berujung jurnal, tipis bila tidak";
(3) **permintaan pemilik**: pengguna bisa mencadangkan datanya (Google Drive) sebagai pengaman
bila langganan habis atau pindah aplikasi.

## Yang dibangun

- **8a — Pemulihan main + standar kode.** `pnpm-lock.yaml` diregenerasi; `.eslintrc` diperbaiki
  (rule salah nama, preset realistis); **10 pelanggaran lint nyata dibersihkan** → `pnpm lint`
  lulus bersih; job **Lint (non-blocking)** di CI. CI main hijau kembali.
- **8b — Backup & portabilitas data.** **"Unduh Semua Data"**: ZIP berisi CSV seluruh tabel +
  manifest, dibangun di Worker — dan **tetap bisa diunduh setelah langganan berakhir** (diuji
  otomatis; ini jaminan anti lock-in). **Google Drive**: OAuth `drive.file`, token terenkripsi
  AES-GCM, backup manual + otomatis bulanan (Cron) — siap pakai begitu pemilik memasang
  `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`.
- **8c — Struktur organisasi.** Departemen **bertingkat** (induk/sub, guard anti-melingkar) +
  **atasan langsung** per karyawan + **bagan organisasi** — gap struktural #1 dari analisis;
  fondasi laporan per departemen & approval hierarki ke depan.
- **8d — RBAC berdimensi.** Peran kustom bisa **dibatasi ke cost center tertentu**: daftar
  dimensi tersaring, laporan per dimensi hanya cabangnya, jurnal ke cabang lain ditolak 403.
  Peran tanpa pembatasan berperilaku persis seperti sebelumnya.

## Jawaban atas dokumen analisis gap pemilik

| Gap struktural | Status |
| --- | --- |
| Struktur organisasi & hierarki (departments + manager_id) | ✅ Fase 8c |
| RBAC berdimensi (batasi data per cabang/cost center) | ✅ Fase 8d |
| Backup/ekspor mandiri pengguna | ✅ Fase 8b |
| Master data tipis (kontak: limit kredit/PIC/termin; gudang: rak/bin) | ⏭ Belum — kandidat fase berikut |
| Intercompany & eliminasi konsolidasi | ⏭ Belum |
| API publik + webhook | ⏭ Belum |
| Manajemen vendor, WMS, MRP, HR non-payroll (rekrutmen/KPI), template COA industri | ⏭ Belum |
| Lampiran dokumen (R2), notifikasi WA | ⏸ Menunggu aset pemilik |

## Checklist siap-launching

| Item | Status |
| --- | --- |
| Alur inti UMKM lengkap + pendalaman Fase 7 + fondasi struktural Fase 8 | ✅ |
| Kualitas: CI hijau + lint bersih + 648 uji e2e | ✅ |
| Portabilitas data (unduh kapan pun, termasuk pasca-langganan) | ✅ |
| **Pembayaran langganan (Midtrans/Xendit)** | ⛔ **PEMBLOKIR #1 — menunggu Server Key pemilik** |
| Backup Google Drive lapis 2 | ⏸ Menunggu OAuth Client ID/Secret pemilik |
| Lampiran dokumen (R2) | ⏸ Menunggu aktivasi pemilik |
| Biteship / marketplace / WhatsApp | ⏸ Menunggu key/token pemilik |
| Beta terbatas 5–10 UMKM nyata | ⏭ Disarankan sebelum peluncuran publik |

## Kejujuran & rekomendasi

Midtrans tetap **satu-satunya** penghalang monetisasi — bukan kekurangan fitur. Saran urutan
berikutnya: (1) pasang Server Key Midtrans → saya bangun checkout langganan; (2) beta terbatas
5–10 UMKM nyata; (3) bila ingin pendalaman lagi, kandidat bernilai tertinggi dari analisis gap:
master data kontak (limit kredit + termin + enforcement di faktur/SO) atau intercompany untuk
kebutuhan holding. Menunggu arahan pemilik.
