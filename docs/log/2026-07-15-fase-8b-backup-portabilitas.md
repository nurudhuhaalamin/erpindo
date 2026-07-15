# Log Kerja — Fase 8b: Backup & portabilitas data (ekspor penuh + Google Drive)

**Tanggal:** 15 Juli 2026 · Menjawab permintaan pemilik: *pengguna bisa mencadangkan datanya
(Google Drive) sebagai pengaman bila langganan tidak diperpanjang atau pindah aplikasi.*

## Yang dikerjakan

**Lapis 1 — Ekspor penuh mandiri (langsung aktif, tanpa dependensi eksternal):**
- `GET /:tenantId/export/full` (owner): SELURUH tabel database tenant diekspor sebagai **ZIP
  berisi CSV per tabel + manifest.json** (nama tabel, jumlah baris, format). ZIP dibangun di
  Worker memakai `lib/zip.ts` baru (metode store + CRC32, porting dari penulis .xlsx klien yang
  sudah teruji). CSV standar (koma, kutip ganda, UTF-8) agar mudah dibuka Excel/diimpor aplikasi
  lain.
- **Anti lock-in**: endpoint GET → **tetap bisa diakses saat langganan berakhir** (`past_due`
  hanya memblokir metode tulis). Diuji eksplisit di smoke. Audit `tenant.exported`.
- UI: kartu **"Ekspor & Cadangan"** di Pengaturan — tombol *Unduh Semua Data* + pernyataan jujur
  "Data Anda milik Anda — unduh kapan pun, termasuk setelah langganan berakhir."

**Lapis 2 — Google Drive (siap pakai, menunggu kredensial pemilik):**
- Alur OAuth 2.0 (scope `drive.file` + email): `GET /drive/connect` → izin Google →
  `GET /api/drive/callback` (verifikasi state bertanda tangan + keanggotaan owner) → refresh
  token disimpan **terenkripsi AES-GCM** (helper baru di `lib/crypto.ts`, kunci diturunkan dari
  `GOOGLE_CLIENT_SECRET`) di tabel control-plane baru `drive_connections` (migrasi CP
  `0004_drive_backup`).
- `POST /drive/backup-now`: susun ZIP ekspor penuh → refresh access token → unggah multipart REST
  ke Drive pengguna (tanpa SDK). `DELETE /drive/disconnect`. Status + email akun + cadangan
  terakhir di `GET /drive/status`.
- **Cron bulanan** (awal bulan): backup otomatis semua tenant tersambung — termasuk tenant
  `past_due` (backup = operasi baca; data milik pengguna).
- **Degradasi anggun**: tanpa secret `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`, status membalas
  `configured:false`, UI menampilkan instruksi, connect/backup membalas 503 — lapis 1 tak
  terpengaruh, smoke tidak bergantung secret.

## Item pending pemilik (BARU)

Buat **OAuth Client** di console.cloud.google.com (tipe Web application, redirect URI
`https://<domain-aplikasi>/api/drive/callback`, aktifkan Google Drive API) → simpan
`GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` sebagai secret di dashboard Workers. Tanpa ini
lapis 2 menunggu; lapis 1 sudah penuh.

## Validasi

- Typecheck · lint bersih · unit test · build · **smoke 617 → 626** (+9): ekspor 200 + magic PK;
  ZIP memuat manifest + CSV jurnal/faktur/produk; viewer 403; status Drive `configured:false`;
  connect/backup tanpa konfigurasi 503; **ekspor TETAP BISA saat `past_due` (200 + ZIP + manifest)**.
- Screenshot kartu Ekspor & Cadangan dikirim ke pemilik.

## Berikutnya

Fase 8c: **Struktur organisasi** (departments hierarki + atasan karyawan + org chart) — gap
struktural pertama dari dokumen analisis pemilik. Midtrans tetap pemblokir launching #1.
