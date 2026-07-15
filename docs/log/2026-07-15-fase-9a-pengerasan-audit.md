# Log Kerja — Fase 9a: Pengerasan hasil audit API

**Tanggal:** 15 Juli 2026 · PR pertama Fase 9 (audit mendalam + simulasi penuh + efisiensi menu).

## Hasil audit (32 file rute, ±11 ribu baris, 220 registrasi endpoint)

**Yang sehat (tidak perlu diubah):** 0 `as any` di API, 0 TODO/FIXME, seluruh SQL
ter-parameterisasi (tanpa celah injeksi), `onError` global tidak membocorkan detail internal,
117 situs validasi Zod. **Sweep RBAC handler-per-handler: TIDAK ada endpoint tenant yang bocor** —
5 endpoint tanpa auth semuanya alur publik yang disengaja, 13 tanpa role-gate semuanya ber-scope
pengguna (profil/2FA/konsolidasi/terima undangan).

## Temuan yang diperbaiki

1. **Buku besar tanpa LIMIT** (`accounting.ts`) → paginasi keyset: default 1000 baris terbaru +
   `openingBalance` agregat (saldo berjalan tetap benar) + kursor `before`; tombol
   **"Muat lebih lama"** di halaman Buku Besar. Konsistensi diuji smoke: saldo akhir jendela =
   saldo full-scan; saldo akhir halaman lama = openingBalance halaman baru.
2. **Rate limit hanya di 3 endpoint auth** → varian baru `rateLimitUser` (kunci user id) di
   laporan berat/e-Faktur/ekspor penuh/backup Drive (longgar, 120/menit — menahan loop &
   scraping, bukan pemakaian normal). Bucket bersama "unknown" saat IP absen dihapus.
3. **RBAC per-handler tanpa penjaga struktural** → `test/rbac-guard.test.ts`: mem-parse semua
   registrasi rute dan GAGAL bila ada endpoint tanpa `requireAuth`/role-gate di luar daftar putih
   eksplisit. Audit sekali-jalan menjadi gerbang permanen.
4. **Indeks hilang** → migrasi tenant `0036_fase9_indexes`: `journal_entries(status, entry_date)`
   + `stock_movements(ref_type, ref_id)`.
5. **4 input tanpa Zod** (ambang persetujuan, catatan penolakan, pemicu servis, amplop impor) →
   skema shared baru; pesan tetap Indonesia.
6. **Cron loop semua tenant tanpa batching/resumability** → marker KV idempoten per
   tenant/tugas/bulan (run yang mati dilanjutkan tanpa mengulang), beban bulanan disebar ke
   tanggal 1–3 per grup hash tenant, anggaran wall-clock lunak 20 dtk, dua loop harian digabung
   satu (koneksi tenant separuh).
7. **Audit log terpotong 100 terakhir** → kursor `before` + tombol **"Muat lebih"** di kartu
   audit Pengaturan.

**Risiko residual yang DITERIMA** (didokumentasikan, tidak diperbaiki): scan laporan
tanpa row-cap (sudah dibatasi rentang tanggal), presisi fixed-window KV.

## Validasi

Typecheck · lint bersih · unit test **24 → 33** (+rbac-guard 4, +rateLimit 5) · build ·
**smoke 648 → 668** (+20: paginasi buku besar 8, validasi Zod 7, kursor audit 4, laporan di
bawah pembatas 1). Screenshot audit log berhalaman dikirim ke pemilik.

## Berikutnya

Fase 9b: simulasi UI penuh (`scripts/ui-sim.mjs`) — klik-tembus browser nyata pertama.
Midtrans tetap pemblokir launching #1.
