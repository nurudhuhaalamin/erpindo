# Log Kerja — Fase 6a: Perbaikan Kualitas (AI, responsif, audit log, peran)

**Tanggal:** 11 Juli 2026 · **Temuan review pemilik #1–#4** (putaran ke-2, di HP).

## Yang dikerjakan

1. **Asisten AI tidak macet lagi (#4)**: akar "berpikir… selamanya" = tak ada batas waktu di
   sisi klien, jadi bila Workers AI lambat/menggantung, `fetch` ikut menggantung. Ditambah
   **timeout klien 35 detik** (AbortController) di `api.aiChat`/`api.aiJurnal` → UI menampilkan
   pesan "Asisten AI lama merespons, coba lagi" (HTTP 408) alih-alih spinner abadi. Sisa **kuota
   AI hari ini** kini ditampilkan di panel; ambang dinaikkan 50 → **100/hari**. Probe produksi
   (`scripts/ai-probe.mjs`) diperluas mengukur **latensi** & menguji `/ai/chat` + `/ai/jurnal`.
2. **Kelola peran anggota tim (#2)**: endpoint baru `PATCH /:tenantId/members/:userId` (ubah
   peran, Owner-only, tak boleh menurunkan/mengeluarkan **pemilik terakhir** atau diri sendiri) +
   `DELETE /:tenantId/members/:userId`. UI `MembersCard`: dropdown peran per anggota + tombol
   **Keluarkan** dengan konfirmasi (khusus Pemilik). Audit `tenant.member_role_changed` /
   `tenant.member_removed`.
3. **Audit log berbahasa manusia (#3)**: `AUDIT_ACTION_LABELS` dilengkapi untuk **seluruh ~75
   kode aksi** (hr.*, project.*, crm.*, pos.*, approval.*, dll.); kolom detail JSON mentah diubah
   jadi ringkasan ramah lewat `friendlyAuditDetail` (mis. `Jurnal JRN-00067 · lines 2`,
   `No INV-00031 · Total Rp832.500`); tata letak jadi kartu bertumpuk yang rapi di HP.
4. **Responsif dirapikan (#1)**: kartu Penjualan/Pembelian (`commerce.tsx` DocRow) — total
   dipisah menonjol di atas, tombol aksi jadi baris terpisah yang seragam & membungkus rapi;
   baris item penawaran (`crm.tsx` QuoteRow) — dari tabel kaku ke layout flex (nama truncate +
   qty×harga + jumlah) sehingga **tak tumpang-tindih**; **dropdown notifikasi** (NotificationBell)
   dibuat `fixed` di HP agar **tak terpotong** di tepi layar. `CardHeader` kini mendukung slot
   `action` (reusable).

Tanpa migrasi baru. Tidak mengubah `id` input / nama ekspor komponen lama.

## Validasi

- Typecheck · unit test (24) · build · **smoke 460 → 471** (+11: kelola peran — viewer 403,
  owner ubah peran 200 + tersimpan, kembalikan 200, turunkan pemilik terakhir 400, keluarkan diri
  sendiri 400, anggota tak dikenal 404, undang+terima jadi 3, keluarkan 200, kembali 2, anggota
  dikeluarkan kehilangan akses 403). Uji hapus memakai akun 'outsider' yang sudah terdaftar agar
  tak menabrak rate-limit register (5/300 dtk).
- Screenshot HP 390px (kartu penjualan, penawaran, dropdown notifikasi, anggota tim, audit log)
  dikirim ke pemilik.

## Berikutnya

Fase 6b: HR Absensi/kehadiran; lalu 6c (Proyek jadi PM serius), 6d (Procurement lengkap),
6e (Approval workflow engine) + laporan akhir Fase 6.
