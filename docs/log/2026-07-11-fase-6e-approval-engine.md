# Log Kerja — Fase 6e: Approval Workflow Engine

**Tanggal:** 11 Juli 2026 · **Temuan review pemilik #8** ("Approval workflow engine belum ada/lengkap").

## Yang dikerjakan

Persetujuan yang ada baru **ambang tunggal untuk pembelian** (satu approver = Owner, satu langkah).
Fase 6e menambah **engine persetujuan berjenjang & konfigurable** — berdampingan, jalur pembelian
lama tidak diubah.

1. **Migrasi `0027_approval_engine`**: `approval_rules` (aturan per jenis dokumen + ambang + urutan
   peran approver), `approval_flows` (alur yang diajukan), `approval_flow_steps` (jejak langkah).
   Tabel baru semua.
2. **Skema shared**: `APPROVAL_DOC_TYPES` (pembelian/pesanan_pembelian/pengeluaran/jurnal) + label,
   `APPROVAL_ROLES` (admin/owner), `approvalRuleSchema`, `submitApprovalSchema`, `decideStepSchema`;
   tipe `ApiApprovalRule`, `ApiApprovalFlow (+steps)`, `ApiApprovalStep`.
3. **API** `routes/approvalsEngine.ts` (mount di index), audit `approval.rule.*` / `approval.flow.*`:
   - Aturan: `GET` (viewer), `POST`/`PATCH`/`DELETE` (owner).
   - Ajukan `POST /approval-flows` (admin): cari aturan aktif cocok (doc_type sama & ambang
     terbesar ≤ nominal). Tak ada → **auto-approved**. Ada → buat langkah berurutan, pending.
   - `GET /approval-flows` (semua/riwayat) & `?queue=me` (alur menunggu peran saya).
   - `POST /approval-flows/:id/steps/decide` (approve/reject): peran pemutus **harus** = peran
     langkah aktif (else 403); approve → maju; langkah terakhir → 'approved'; reject → 'rejected'.
     Nama approver diambil dari control-plane (`users`).
4. **Web**: `approvals.tsx` dirombak jadi **bertab** (satu menu Persetujuan) — Antrean saya · Ajukan
   · Riwayat · Aturan (Owner) · Pembelian ambang (lama, API tak berubah). Form ajukan menampilkan
   **pratinjau aturan** yang berlaku; kartu Aturan dengan urutan approver bernomor; jejak langkah
   berwarna per status. Halaman tak lagi Owner-only. Label audit ditambahkan.
5. **Seed-demo**: 2 aturan (Pembelian ≥ 5jt: Admin→Pemilik; Pengeluaran ≥ 1jt: Pemilik) + 3 alur
   (menunggu berjenjang, disetujui, auto-approved).

## Validasi

- Typecheck · unit test (24) · build · **smoke 509 → 523** (+15: viewer buat aturan 403, buat
  aturan 2-langkah, urutan approver tersimpan, ajukan di bawah ambang → auto, ajukan di atas
  ambang → pending 2 langkah, peran salah memutus 403, antrean per peran benar (admin lalu owner),
  approve langkah-1 maju, approve terakhir → approved, putus alur selesai 409, jalur reject,
  riwayat memuat jejak). Jalur pembelian ambang-tunggal lama tetap diuji & hijau.
- Screenshot Riwayat + Aturan (desktop) + HP dikirim ke pemilik.

## Penutup

Ini PR terakhir Fase 6. Laporan akhir menyeluruh: `docs/log/2026-07-11-fase-6-laporan-akhir.md`.
