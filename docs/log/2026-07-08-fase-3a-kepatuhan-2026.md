# Log Kerja — Fase 3a: Kepatuhan 2026 + Trial 30 Hari

**Tanggal:** 8 Juli 2026 · **Status akhir:** selesai, siap PR.

## Konteks

Hasil audit komprehensif + riset regulasi (rencana Fase 3): pemilik minta trial 30 hari dan
kepastian standar terbaru 2026. Verifikasi regulasi: PPh 21 TER (PMK 168/2023) masih berlaku ✅;
PPN 11/12% (PMK 131/2024, efektif 11% non-mewah via DPP 11/12) sudah didukung ✅; **batas upah
Jaminan Pensiun BPJS naik per Maret 2026** ⚠️ perlu update.

## Yang dikerjakan

1. **Trial 14 → 30 hari.** `TRIAL_DAYS = 30` (packages/shared) — otomatis menggerakkan register
   & pembuatan perusahaan tambahan. Kelima teks UI kini **diturunkan dari konstanta** (CTA
   register, hero/harga/FAQ/CTA-band landing) sehingga tak bisa drift lagi; docs ikut.
2. **Batas upah JP 2026.** `jpCap` 10.547.400 → **11.086.300** (resmi BPJS per Maret 2026;
   naik tiap Maret mengikuti pertumbuhan PDB) + komentar verifikasi diperbarui; unit test
   payslip cap disesuaikan (potongan JP maks kini Rp110.863).
3. **Format tanggal Indonesia.** Helper `formatDate` ("2026-07-08" → "8 Jul 2026", Intl id-ID)
   di api/client.ts, diterapkan di tampilan tanggal utama: daftar & kartu dokumen penjualan/
   pembelian, cetakan faktur (tanggal & jatuh tempo), jurnal umum, kedaluwarsa lot, jadwal
   servis & work order, jurnal proyek, tabel e-Faktur. Input tanggal & CSV tetap ISO.
4. **Email lebih profesional.** Semua email (verifikasi, reset, undangan, pengingat & akhir
   trial) kini bertanda tangan "— Tim erpindo"; email trial-berakhir menyertakan tautan ke
   Pengaturan bila `APP_URL` diset.

## Validasi (semua hijau)

- Typecheck · unit test 24 (payslip JP cap baru) · build · **smoke tetap 292** (trial memakai
  `TRIAL_DAYS_OVERRIDE` di suite; gaji smoke di bawah cap JP — angka akuntansi tak berubah).

## Berikutnya

Fase 3b: edit master data + ConfirmDialog + void faktur (lihat rencana Fase 3).
