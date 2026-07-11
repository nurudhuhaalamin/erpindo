# Log Kerja — Fase 6c: Proyek jadi PM Serius

**Tanggal:** 11 Juli 2026 · **Temuan review pemilik #6** ("Fitur Project gak terlihat seperti project manajemen serius").

## Yang dikerjakan

Papan tugas proyek naik kelas dari sekadar todo/proses/selesai menjadi manajemen tugas yang layak
disebut PM: penanggung jawab, prioritas, beban kerja, tenggat, dan garis waktu.

1. **Migrasi `0025_project_pm`** — ALTER `project_tasks` tambah `assignee_id` (→ employees),
   `priority` (default `medium`), `sort_order` (urutan kanban) + indeks assignee.
   Backward-compatible: tugas lama tetap valid (PJ kosong, prioritas Sedang).
2. **Skema shared**: `PROJECT_TASK_PRIORITIES` (low/medium/high) + label,
   `projectTaskSchema` diperluas (`assigneeId`, `priority`), `projectTaskUpdateSchema` (perbarui
   sebagian: status/prioritas/PJ/tenggat), `ApiProjectTask` (+assigneeId/assigneeName/priority/
   sortOrder), tipe baru `ApiProjectWorkload`.
3. **API** (`projects.ts`):
   - `POST tasks` — terima `assigneeId` + `priority`, validasi PJ ada (404), urutan otomatis.
   - `PATCH tasks/:taskId` — kini perbarui sebagian (status/prioritas/PJ/tenggat); validasi PJ;
     tetap meng-echo `status` (kompatibel pemanggil lama).
   - `GET projects/:id` — tugas ikut PJ + prioritas + urutan; hitung **beban kerja per PJ**
     (`workload`: jumlah tugas belum/proses/selesai/terbuka) diurut terbanyak.
4. **Web** (`projects.tsx`):
   - **Garis waktu** proyek (batang mulai→selesai + % waktu berjalan; merah bila lewat tenggat).
   - **Kartu kanban** menampilkan PJ + badge prioritas (Tinggi/Sedang/Rendah); dropdown inline
     ubah PJ & prioritas; kartu terlambat diberi bingkai merah. Form tambah tugas kini lengkap
     (nama + PJ + prioritas + tenggat).
   - Panel **beban kerja per orang** + daftar **tugas dengan tenggat** (terlambat disorot merah).
   - Rapi di desktop & HP 390px.
5. **Seed-demo**: tugas proyek diberi PJ, prioritas, tenggat; proyek jasa diberi tanggal
   mulai/selesai (garis waktu demo).

## Validasi

- Typecheck · unit test (24) · build · **smoke 483 → 492** (+9: tambah tugas ber-PJ+prioritas
  201, PJ tak dikenal 404, tugas memuat PJ+prioritas, workload terisi, beban Andi 1 terbuka,
  perbarui prioritas+kosongkan PJ 200, perbarui PJ tak dikenal 404, PJ dikosongkan+prioritas low,
  viewer perbarui tugas 403). Asersi lama (progres 50%, ubah status → done) tetap hijau.
- Screenshot desktop 1280px + HP 390px dikirim ke pemilik.

## Berikutnya

Fase 6d: Procurement lengkap (alur PR → PO → penerimaan barang/GRN → faktur pembelian);
lalu 6e (Approval workflow engine) + laporan akhir Fase 6.
