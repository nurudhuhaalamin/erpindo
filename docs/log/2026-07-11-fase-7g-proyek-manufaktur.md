# Log Kerja — Fase 7g: Proyek Gantt + Manufaktur Routing

**Tanggal:** 11 Juli 2026 · **Fase 7 (pendalaman modul), gelombang Enterprise.**

## Yang dikerjakan

Dua pendalaman modul operasi, keduanya **ADDITIVE** (tabel/alur lama tak berubah):

1. **Proyek — Gantt + dependensi + baseline.** Tugas kini punya **tanggal mulai/selesai**,
   **dependensi** (predecessor: “setelah tugas X”), dan **baseline** (rencana vs aktual).
   Halaman Proyek menampilkan **grafik Gantt sederhana**: batang tugas per tanggal, baseline
   sebagai garis bawah, penanda terlambat (aktual > baseline).
2. **Manufaktur — work center + routing (biaya standar vs aktual / WIP).** Master **work center**
   (pusat kerja + tarif/jam); tiap perintah produksi bisa punya **tahapan routing** per work
   center dengan **biaya standar**; catat **biaya aktual** saat tahap selesai (WIP → selesai) →
   **varian** (aktual − standar) tampil otomatis.

### Perubahan teknis
- **Migrasi `0033_pm_manufacturing`**: kolom `project_tasks` (start_date, end_date,
  predecessor_id, baseline_start, baseline_end — nullable) + tabel `work_centers` &
  `production_routing_steps`.
- **`postJournal`/proyek**: task create & update menyimpan jadwal + dependensi; update mendukung
  `setBaseline` (simpan jadwal saat ini sebagai baseline). `ApiProjectTask` diperluas.
- **Skema shared**: `workCenterSchema`, `routingStepSchema`, `routingActualSchema`,
  `ApiWorkCenter`/`ApiRoutingStep`; `projectTaskSchema`/`projectTaskUpdateSchema` +jadwal.
- **API `manufacturingRouting.ts`**: work-centers CRUD; routing per perintah produksi
  (GET/POST/complete) + total standar/aktual/varian. Audit `manufacturing.*`.
- **Web**: **Gantt** + editor jadwal per tugas di halaman Proyek; kartu **Work center** +
  **Routing produksi** (standar vs aktual, WIP) di halaman Manufaktur.
- **seed-demo**: 2 work center + 2 tahap routing (1 selesai, 1 WIP) + 2 tugas berjadwal + baseline
  + dependensi.

## Validasi

- Typecheck · unit test (24) · build · **smoke 598 → 608** (+10): viewer buat work center 403;
  buat 201; kode duplikat 409; tambah routing 201; work center tak dikenal 400; catat aktual +
  selesai 200; selesaikan yang sudah selesai 409; **routing varian standar 100rb vs aktual 120rb =
  +20rb**; tetapkan jadwal + baseline tugas 200; **tugas menyimpan jadwal & baseline (Gantt)**.
  Alur proyek/manufaktur lama tetap hijau (kolom nullable, tanggal September terpisah).
- Screenshot halaman Manufaktur (work center + routing) dikirim ke pemilik.

## Berikutnya

Fase 7h (TERAKHIR Fase 7): Dashboard kustom (widget pilihan) + grafik tren + ekspor Excel (.xlsx)
+ laporan terjadwal (Cron) + **LAPORAN AKHIR FASE 7** & checklist siap-launching (Midtrans #1).
