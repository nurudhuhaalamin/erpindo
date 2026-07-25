# Log Kerja — Fase 16h: Isi halaman CRM dwibahasa

**Tanggal:** 25 Juli 2026.

## Yang dikerjakan

Lapis kedelapan program i18n modul. `crm.tsx` memuat dua halaman — **Pipeline**
(lead, papan kanban, aktivitas follow-up, laporan konversi per sumber) dan
**Penawaran** (buat, kirim, terima/tolak, konversi ke faktur).

44 entri kamus baru + **51 penggantian** di enam komponen (`LeadsPage`,
`SourceReportCard`, `LeadRow`, `QuotationsPage`, `QuoteRow`).

## Empat pola dipakai SEBELUM menulis kode

Fase pertama yang mensurvei dengan **keempat pola sekaligus di awal**, bukan
menemukannya lewat kegagalan CI. Hasil survei awal langsung memuat:

| Pola | Ditemukan di crm.tsx |
|---|---|
| Teks JSX multi-baris | 23 |
| Atribut **tanpa batas panjang** | 16 — termasuk **4 kalimat panjang** yang dengan alat lama tak akan terdaftar |
| Teks setelah ekspresi (`{expr} teks <`) | **5** — semuanya tak akan tertangkap regex `>teks<` |
| Sudah tersedia di kamus | 7 |

Sapuan akhir atas **tujuh** berkas yang sudah dikerjakan menemukan **2 sisa** di
halaman lama — "Catat" (commerce, 16c) dan "Buat permintaan pembelian" (stok,
16d) — keduanya pola teks-setelah-ekspresi. Diperbaiki di sini.

## Rute uji diverifikasi lebih dulu

Pelajaran 16g (rute salah → halaman kosong → asersi negatif lolos hampa)
diterapkan: rute dicek ke `main.tsx` **sebelum** menjalankan uji. Ternyata tidak
ada rute `/app/crm` telanjang — yang benar `/app/crm/leads`. Kesalahan yang sama
seperti 16g dicegah tanpa perlu satu pun siklus CI merah.

## Validasi

- **UI-sim +1 (`F0j`)**: penanda **positif** ("Active leads"/"No leads yet" +
  "Source") dan negatif dari teks murni UI ("Lead aktif", "Konversi per sumber").
- typecheck 4/4 · lint bersih · build · unit 234 · smoke 861 (tak berubah).

## Catatan

- Lint sempat menandai hook `useUi` menganggur di `KanbanBoard` (komponen itu
  hanya menata kartu, tanpa teks sendiri) — hooknya dihapus, bukan dibiarkan.
- **Cakupan kumulatif: ±17 layar** tuntas isinya; kamus **249 entri**.
