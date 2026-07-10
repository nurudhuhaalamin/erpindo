# Log Kerja — Fase 5e: CRM Lanjut

**Tanggal:** 10 Juli 2026 · **Temuan review pemilik #6:** CRM masih sangat terbatas.

## Yang dikerjakan

1. **Papan kanban funnel** di halaman Pipeline: satu kolom per tahap (Baru → Dihubungi →
   Terkualifikasi → Penawaran → Menang), kartu lead bisa **digeser antar tahap** (drag-and-drop
   HTML5 tanpa pustaka tambahan, khusus Owner/Admin) — dropdown tahap yang lama tetap ada
   sebagai fallback. Kartu menampilkan nama, perkiraan nilai, dan sumber.
2. **Tenggat follow-up + pengingat**: aktivitas lead kini punya kolom tenggat opsional
   (migrasi `0021_crm_extras`: `lead_activities.due_at`). Aktivitas ber-tenggat tampil dengan
   badge (merah bila lewat). **Lonceng notifikasi** menampilkan follow-up yang jatuh tempo
   (`crm_followup_due`, per lead aktif) dan jumlah **lead terbengkalai** tanpa sentuhan
   >7 hari (`crm_stale_lead`).
3. **Laporan konversi per sumber** (`GET /crm/report`): tabel Sumber × Lead/Menang/Kalah/
   Konversi% di halaman Pipeline — kolom `source` lead sudah ada sejak Fase 2l, kini dipakai
   untuk mengarahkan promosi ke kanal yang paling menghasilkan.
4. **Penawaran profesional**: daftar penawaran menampilkan **masa berlaku** ("berlaku s.d. …")
   dan badge **kedaluwarsa** otomatis bila lewat tanggal (status draf/terkirim); tautan
   **Cetak** membuka halaman cetak baru `/cetak/penawaran?tenant=&id=` — kop berlogo, PPN,
   total, catatan, dan keterangan "penawaran harga, bukan tagihan" (pola halaman cetak faktur;
   bisa Simpan PDF dari dialog print).
5. Seed-demo +2 langkah (137): sumber pada 3 lead demo (Referensi/Instagram/WhatsApp),
   penawaran kedua ber-masa-berlaku, aktivitas follow-up ber-tenggat yang sudah jatuh tempo
   (supaya lonceng & laporan terisi di PT Demo Sejahtera).

## Validasi

- Typecheck · unit test (24) · build · **smoke 413 → 423** (+10: lead ber-sumber + kolom
  sumber di daftar, aktivitas ber-tenggat + dueAt di daftar, lonceng memuat `crm_followup_due`,
  laporan sumber 200 + baris Instagram + conversionPct angka, RBAC non-anggota 403,
  penawaran ber-masa-berlaku + validUntil di daftar — ditempatkan additive di seksi CRM
  pra-cron sehingga assert angka lama tidak terganggu).
- Screenshot kanban + laporan sumber, daftar penawaran, halaman cetak penawaran — dikirim
  ke pemilik.

## Berikutnya

Fase 5f: HR lanjut (slip gaji cetak/PDF, komponen ad-hoc per run, kasbon karyawan,
cuti & izin, bukti potong 1721-A1).
