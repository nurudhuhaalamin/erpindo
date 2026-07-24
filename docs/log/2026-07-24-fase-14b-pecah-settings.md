# Log Kerja — Fase 14b: Pecah settings.tsx

**Tanggal:** 24 Juli 2026.

## Yang dikerjakan

`apps/web/src/pages/settings.tsx` sudah membengkak jadi **1823 baris** berisi ~18
komponen lima tab. Dipecah per-tab menjadi modul kecil (pola Fase 9d/12c: **nama ekspor
tak berubah**), tanpa perubahan perilaku.

Struktur baru `apps/web/src/pages/settings/`:
- `index.tsx` — shell bertab `SettingsPage` + re-ekspor `AUDIT_ACTION_LABELS` &
  `friendlyAuditDetail` (agar `dashboard.tsx` & `app.tsx` tak berubah).
- `account.tsx` — ProfileCard, DisplayModeCard, SecurityCard (tab Akun).
- `company.tsx` — SubscriptionCard, CompanySettingsCard (+LogoUploader), DocNumberingCard,
  NewCompanyCard (tab Perusahaan).
- `team.tsx` — MembersCard, RolesCard, ApprovalThresholdCard (tab Tim).
- `data.tsx` — ExportBackupCard, TenantSecurityCard, AuditLogCard + helper audit (tab Data).
- `integrations.tsx` — ApiIntegrationCard, CloseBooksCard (tab Lainnya).

`settings.tsx` (1823 baris) dihapus; berkas terbesar kini `data.tsx` (~461 baris).
Impor minimal per berkas dihitung otomatis (deteksi pemakaian simbol) sehingga tak ada
impor menganggur. Larangan Fase 9d dijaga: **`api/client.ts` TIDAK disentuh**.

## Validasi

- typecheck 4/4 · lint bersih (no-unused-vars) · build · unit 156 · smoke 842.
- **UI-sim 182** (tak berubah): seluruh skenario tab Pengaturan tetap hijau — Profil,
  Langganan (3 paket), Penomoran dokumen, Keamanan lanjutan, API & Integrasi — membuktikan
  refactor mempertahankan perilaku. Murni churn struktural, tanpa perubahan fungsional.
