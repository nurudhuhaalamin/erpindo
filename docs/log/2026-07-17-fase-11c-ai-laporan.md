# Fase 11c — AI-native gelombang 1: Tanya Laporan (bahasa natural, grounded)

**Tanggal:** 17 Juli 2026
**Branch/PR:** `claude/erp-business-planning-8wx296` → PR #82 (akumulasi Fase 11)
**Uji:** typecheck 4/4 · lint bersih · 31 unit · build · **smoke 761** (+2) · **ui-sim 160**

Asisten ERPindo kini bisa **menjawab pertanyaan keuangan dalam bahasa sehari-hari** —
"berapa laba bulan ini?", "bandingkan pendapatan bulan ini vs lalu", "berapa saldo kas & piutang?"
— dijawab **dari buku perusahaan itu sendiri**, bukan mengarang.

## Prinsip: grounded & read-only
Model **tidak menghitung dan tidak menebak angka**. Server lebih dulu menghitung ringkasan nyata
dari **jurnal terposting** (`buildReportSnapshot`) lalu memberi model DATA itu sebagai konteks;
model hanya meringkas/menjelaskan. System prompt melarang mengarang: bila data tak memuat
jawabannya, model diminta bilang terus terang. **AI tidak menulis data apa pun** (konsisten dengan
mode Tanya & Draf Jurnal).

Ringkasan yang dihitung: pendapatan/beban/laba **bulan ini** & **bulan lalu**, **saldo kas & bank**,
**piutang usaha**, **hutang usaha** — semua dari `journal_lines` × `accounts` × `journal_entries`
(status posted).

## Perubahan
- **`packages/shared`:** `aiReportSchema` ({ question }).
- **`routes/ai.ts`:** `POST /:tenantId/ai/laporan` (requireAuth + viewer — read-only, semua anggota)
  + helper `buildReportSnapshot(db)`. Reuse infra kuota/model/degradasi yang sudah ada.
- **Web:** `Asisten` dapat mode ketiga **"Laporan"** (ikon grafik) — tanya-jawab keuangan; klien
  `api.aiLaporan`. Contoh pertanyaan di empty-state + catatan "hanya membaca".
- **Degradasi anggun:** tanpa binding `AI` (dev/CI) → 503 `binding-absent`; fitur lain tak terganggu.

## Uji
- **Smoke (+2):** `/ai/laporan` 401 tanpa sesi; viewer → 200 (produksi) atau 503 `binding-absent`
  (dev tanpa binding). Membuktikan RBAC (read-only untuk semua anggota) + degradasi.
- Perhitungan snapshot memakai query agregat yang sama polanya dengan modul Laporan yang sudah
  teruji; model dijalankan hanya di produksi (binding AI), sama seperti mode AI lainnya.

## Catatan gelombang AI berikutnya
OCR struk/faktur (vision model) & auto-rekonsiliasi adalah increment AI berikutnya; ditunda dari
11c agar tidak mengapalkan pipeline gambar yang tak bisa diuji di sini. Fondasi (kuota, model
fallback, guardrail draft/read-only) sudah siap dipakai ulang.
