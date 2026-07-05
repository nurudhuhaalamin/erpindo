# Log Kerja — Gelombang C-5 (Fase 2v): Maintenance / Servis Aset

**Tanggal:** 5 Juli 2026 · **Status akhir:** selesai, siap PR.

## Konteks

Untuk usaha dengan aset operasional (kendaraan, mesin, alat berat): **jadwal servis
berkala** per aset dengan pengingat otomatis, **work order** (dari jadwal atau ad-hoc),
serta **riwayat & biaya** servis yang langsung dibukukan.

## Yang dibangun

- **Migrasi tenant `0016_maintenance`**: akun `5-7000` Beban Pemeliharaan; tabel
  `maintenance_schedules` (aset, interval bulan, `next_due_date`, aktif) & `work_orders`
  (no. urut WO, aset, jadwal, judul, status open/done, tanggal, biaya, catatan, jurnal).
- **API `routes/maintenance.ts`**:
  - Jadwal: `GET/POST /maintenance/schedules` (admin), `PATCH .../:id/status` (jeda/aktifkan).
  - `runMaintenance(db, today, userId)` — menerbitkan work order untuk tiap jadwal aktif yang
    jatuh tempo (`next_due_date ≤ today`) lalu memajukan tanggal servis satu interval.
    Endpoint `POST /maintenance/run` (body opsional `{date}`) untuk pemicu manual.
  - Work order: `GET /maintenance/work-orders`, `POST` (ad-hoc), `POST .../:id/complete` —
    saat selesai dengan biaya, memposting jurnal **Beban Pemeliharaan / Kas-Bank**; biaya 0
    tanpa jurnal. Menghormati tutup buku.
- **Cron harian** (`scheduled()`): menjalankan `runMaintenance` untuk semua tenant
  aktif/trial, per-tenant `try/catch` + audit log.
- **Web `pages/maintenance.tsx`**: form jadwal + tombol "Terbitkan Jatuh Tempo", form work
  order ad-hoc, daftar jadwal (jatuh tempo berikutnya, jeda/aktifkan), daftar work order +
  total biaya, penyelesaian inline (tanggal, biaya, akun pembayar, catatan). Nav "Maintenance"
  (ikon `Wrench`).

## Validasi (semua hijau)

- Typecheck · 24 unit test · build.
- **Smoke 258 → 272** — seksi "11p. Maintenance": daftarkan aset, RBAC viewer 403, buat jadwal,
  **terbitkan servis jatuh tempo → 1 work order** + tanggal maju satu interval, terbitkan ulang
  → 0 (idempoten), **selesaikan work order berbiaya 500rb** (jurnal Beban Pemeliharaan) — tanpa
  akun ditolak 400, selesai ganda ditolak 409, work order ad-hoc + selesai tanpa biaya (tanpa
  jurnal), **Beban Pemeliharaan tercatat 500rb di buku besar**, dan **neraca saldo tetap
  seimbang**. Hitungan COA 21 → 22 (akun 5-7000).
- Verifikasi visual Playwright: halaman Maintenance (jadwal + work order + riwayat) terang & gelap.

## Berikutnya

Gelombang C lanjut: Helpdesk (tiket), Ekspor e-Faktur.
