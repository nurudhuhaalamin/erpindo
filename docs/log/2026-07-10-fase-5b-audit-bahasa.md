# Log Kerja — Fase 5b: Audit Tata Bahasa & Copywriting Menyeluruh

**Tanggal:** 10 Juli 2026 · **Temuan review pemilik #2:** beberapa teks tata bahasanya tidak sesuai.

## Metode audit (semua permukaan, sesuai pilihan pemilik)

1. **Sapuan ejaan otomatis** atas seluruh `apps/web/src`, `apps/api/src` (email), dan skrip ops —
   daftar kata tak baku umum (kadaluarsa, silahkan, merubah, resiko, praktek, analisa, di+verba
   terpisah, diatas/dibawah tersambung, non-aktif, ijin, jadual, dst.): **0 temuan** — ejaan
   sudah baku sejak awal (aplikasi konsisten memakai "kedaluwarsa", "risiko", dsb.).
2. **Proofread manual** semua kalimat panjang: paragraf pengantar tiap halaman, pesan
   toast/error/empty state (±70 kalimat), seluruh salinan landing page, 4 template email
   (verifikasi, reset password, pengingat trial, undangan), dan **82 kalimat prosa panduan**
   (23 modul).
3. **Cek konsistensi istilah**: hutang (dipakai konsisten, mengikuti kebiasaan bisnis/ERP
   Indonesia), e-Faktur (tampilan) vs e-faktur/efaktur (hanya path/identifier — benar),
   faktur/pemasok/pelanggan/gudang/persediaan/jatuh tempo — konsisten. Tidak ada label UI
   berbahasa Inggris yang tersisa (Save/Cancel/dll. nihil).

## Perbaikan (4 kalimat di konten panduan)

- "nilai buku **ter-update**" → "nilai buku **ikut terbarui**" (aset).
- "lot **ter-dekat exp**" → "lot **dengan tanggal kedaluwarsa terdekat**" (stok).
- "pendapatan/biaya otomatis **ter-tag**" → "**tertandai ke proyek itu**" (proyek).
- Tahapan funnel CRM: "baru → dihubungi → **qualified** → menang/kalah" →
  "baru → dihubungi → **terkualifikasi → penawaran** → menang/kalah" (selaras label di aplikasi).

`docs/panduan/` di-regenerasi dari konten yang diperbaiki (satu sumber kebenaran).

## Kesimpulan untuk pemilik

Audit menyeluruh menemukan kualitas teks sudah tinggi; yang janggal hanya 4 kalimat di panduan
(istilah campur Inggris) — semuanya diperbaiki. Bila Anda menemukan kalimat spesifik lain yang
terasa janggal, kirim tangkapan layarnya — akan langsung dibereskan.

## Validasi

Typecheck · unit test (24) · build · smoke 397 — semua lulus (perubahan string-only).
