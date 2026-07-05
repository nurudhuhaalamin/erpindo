# Log Kerja — Gelombang C-6 (Fase 2w): Helpdesk / Tiket Dukungan

**Tanggal:** 5 Juli 2026 · **Status akhir:** selesai, siap PR.

## Konteks

Melayani keluhan/permintaan pelanggan secara terstruktur: **tiket dukungan** dengan
prioritas & status, terhubung ke kontak, dilengkapi **balasan** (termasuk catatan internal)
dan **penugasan** ke anggota tim.

## Yang dibangun

- **Migrasi tenant `0017_helpdesk`**: tabel `tickets` (no. urut TKT, kontak, subjek/deskripsi,
  prioritas low/medium/high/urgent, status open/in_progress/resolved/closed, petugas +
  nama-snapshot, `resolved_at`) & `ticket_replies` (isi, penulis, `internal` catatan tim).
- **API `routes/helpdesk.ts`**:
  - `GET /tickets` (urut: status lalu prioritas), `GET /tickets/:id` (+ balasan).
  - `POST /tickets` (admin) — validasi kontak; nomor TKT berurutan.
  - `POST /tickets/:id/replies` (admin) — balasan/catatan internal, penulis dari sesi.
  - `PATCH /tickets/:id` (admin) — ubah status (isi `resolved_at` saat selesai/ditutup)
    dan/atau penugasan. Petugas divalidasi sebagai **anggota tenant** (dilihat dari
    control-plane), namanya di-snapshot. Update kosong ditolak.
- **Web `pages/helpdesk.tsx`**: form tiket baru, daftar tiket (badge prioritas & status),
  panel detail dengan kontrol status & penugasan, utas balasan (catatan internal disorot),
  dan kotak balas. Nav "Helpdesk" (ikon `LifeBuoy`) di seksi CRM.

## Validasi (semua hijau)

- Typecheck · 24 unit test · build.
- **Smoke 272 → 284** — seksi "11q. Helpdesk": RBAC viewer 403 (buat) & 200 (baca), prioritas
  tak dikenal 400, buat tiket (TKT-00001), tampil di daftar, tambah balasan + catatan internal,
  balasan kosong 400, **tugaskan ke non-anggota 400** & ke anggota 200 (nama tersimpan), ubah
  status → selesai (`resolvedAt` terisi), update kosong 400, detail menampilkan 2 balasan
  (1 internal) & status selesai.
- Verifikasi visual Playwright: halaman Helpdesk (daftar + detail + balasan) terang & gelap.

## Berikutnya

Gelombang C tersisa: Ekspor e-Faktur (CSV impor e-Faktur dari faktur ber-PPN).
