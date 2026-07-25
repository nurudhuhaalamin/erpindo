# Log Kerja — Fase 15a: Runbook go-live + audit degradasi anggun

**Tanggal:** 24 Juli 2026.

## Yang dikerjakan

Membuka rangkaian **persiapan peluncuran komersial**. Dua hal:

1. **Audit degradasi anggun (verifikasi kode).** Menelusuri seluruh jalur fitur
   berkunci di `apps/api/src` untuk memastikan tiap fitur benar-benar *nonaktif
   anggun* (pesan jelas, bukan error keras) saat kuncinya belum dipasang. Hasil:
   pola konsisten & benar —
   - Billing/Midtrans: `billingConfigured()` → checkout `503` berpesan.
   - Google (login + Drive): `googleConfigured()`/`driveConfigured()` → `503`/`configured:false`.
   - Admin Platform: tanpa `PLATFORM_ADMIN_EMAILS` → `/api/admin` `403`.
   - Email/Resend: fallback `ConsoleMailer` (dicatat ke log, tak gagal).
   - Asisten AI: `503 "binding-absent"`, kuota tak terpotong.
   Tak ditemukan celah "gagal keras". Lampiran R2 (Fase 2m) memang belum dibangun
   (tak ada binding R2 di `env.ts`) — jadi tak ada yang perlu dinyalakan.

2. **`docs/05-runbook-go-live.md`** — panduan operasional mengubah aplikasi live
   menjadi menghasilkan: empat kunci yang perlu dipasang (nama secret **persis**
   dari `env.ts`, tempat ambil, redirect URI Google, URL webhook Midtrans),
   tabel degradasi anggun, langkah **uji langganan sandbox**, **checklist
   pra-peluncuran** (gerbang mutu + asap manual), dan catatan pasca-peluncuran
   (pantauan, rollback, skala D1 dinamis, kuota AI).

Nama endpoint diverifikasi ke kode: webhook Midtrans `/api/billing/notification`
(bukan `/webhook`), callback Google `/api/auth/google/callback` & `/api/drive/callback`.

## Validasi

- Doc-only + audit baca-kode — tanpa perubahan kode produksi.
- typecheck/test/build tak terpengaruh; runbook merujuk gerbang mutu yang sudah ada
  (850 smoke · 222 unit · 184 ui-sim · lint).

## Catatan

- Ini fase pembuka program go-live. Item lanjutan yang bisa dikerjakan tanpa kunci
  pemilik: notifikasi WhatsApp (link `wa.me`), pembeda AI (deteksi anomali via
  Cron), dan lanjutan i18n modul.
