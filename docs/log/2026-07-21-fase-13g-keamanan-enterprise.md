# Log Kerja — Fase 13g: Keamanan enterprise (2FA wajib · pembatasan IP · audit CSV)

**Tanggal:** 21 Juli 2026.

## Yang dikerjakan

Modul `advancedSecurity` (paket Enterprise) kini punya kontrol keamanan tingkat
perusahaan yang bisa diatur Owner:

1. **2FA wajib per perusahaan.** Toggle di Pengaturan → Data & Keamanan. Bila aktif,
   anggota tanpa TOTP aktif diblokir dari seluruh endpoint tenant dengan
   `403 { detail: "2fa-required" }` — mereka menyiapkan 2FA di Profil dulu
   (infrastruktur TOTP sudah ada sejak Fase 2c; endpoint `/api/auth/2fa/*` di luar
   cakupan tenant sehingga tetap terjangkau untuk enrolment).
2. **Pembatasan IP (CIDR IPv4).** Daftar CIDR/IP per tenant (maks 50). Request dari IP
   di luar daftar → `403 { detail: "ip-not-allowed" }`. Daftar kosong = tanpa
   pembatasan (perilaku lama). Matcher CIDR fungsi murni di `packages/shared`.
3. **Ekspor audit log CSV.** `GET /security/audit.csv` mengunduh hingga 10.000 baris
   audit (waktu, aksi, pengguna, email, IP, detail) dengan BOM UTF-8 agar rapi di Excel.
4. **Katup pengaman anti-lockout.** Endpoint konfigurasi `…/security` SELALU
   dikecualikan dari penegakan IP **dan** 2FA — Owner yang salah mengetik CIDR atau
   menyalakan 2FA tanpa TOTP tetap bisa membukanya kembali dari IP mana pun. Ekspor
   audit (`…/security/audit.csv`) TIDAK termasuk katup ini sehingga tetap ditegakkan.

### Berkas

- `packages/shared/src/security.ts` (baru): `tenantSecuritySchema`, `isValidCidr`,
  `ipv4ToInt`, `ipInCidr`, `ipAllowed`, tipe `ApiTenantSecurity`. Diekspor via barrel.
- `packages/db/src/migrations.ts`: control-plane `0013_tenant_security`
  (`require_2fa INTEGER NOT NULL DEFAULT 0`, `allowed_ips TEXT`).
- `apps/api/src/middleware/auth.ts`: `requireTenantRole` memuat kolom keamanan +
  `users.totp_enabled`, lalu menegakkan IP → 2FA (dengan pengecualian `…/security`).
  Peta `MODULE_ROUTE_PREFIXES` menambah `security → advancedSecurity`.
- `apps/api/src/routes/security.ts` (baru): `GET/PATCH /security` + `GET /security/audit.csv`
  (khusus Owner), didaftarkan di `index.ts`.
- `apps/web`: `client.ts` (`getSecurity`/`updateSecurity`/`securityAuditCsvUrl` +
  tipe), `settings.tsx` kartu **Keamanan lanjutan** di tab Data & Keamanan (form 2FA +
  IP + tombol ekspor CSV; menampilkan kartu upsell bila paket < Enterprise via 403).

## Keputusan & catatan jujur

- Gate klien kartu keamanan digerakkan oleh **hasil 403 server** (bukan hitung paket di
  klien) supaya pelanggan `legacy_full_access` (paket lama) tetap melihat form — server
  yang memutuskan, klien mengikuti.
- Pembatasan IP hanya IPv4 (pasar utama). IPv6 belum didukung — dicatat sebagai backlog;
  request IPv6 saat daftar aktif akan diblokir (fail-closed) karena `ipv4ToInt` menolaknya.
- Retensi audit: ekspor mengambil seluruh riwayat control-plane yang tersimpan (batas
  10.000 baris per unduhan); belum ada kebijakan purge otomatis — arsip eksternal via CSV.

## Validasi

- **Unit 105 → 115** (+10): matcher CIDR (`ipv4ToInt`, `ipInCidr` termasuk /0, /32, IP
  tunggal, oktet & bit tak valid), `ipAllowed` (daftar kosong = izinkan; "unknown" diblokir
  saat daftar aktif), `tenantSecuritySchema` (default kosong, tolak "999.1.1.1").
- **Smoke 808 → 819** (+11): GET /security default, gate paket Business → 403 upgrade,
  PATCH tolak CIDR tak valid, 2FA wajib memblokir owner tanpa TOTP + katup /security tetap
  terjangkau, matikan 2FA → akses kembali, IP di luar daftar 403 vs dalam CIDR 200,
  /security terjangkau dari IP terblokir, ekspor audit CSV 200 + header kolom.
  (`makeClient` diperluas menerima header ekstra untuk mensimulasikan `cf-connecting-ip`.)
- **UI-sim 179 → 180** (+1): tab Data & Keamanan menampilkan kartu Keamanan lanjutan
  (2FA wajib + pembatasan IP + ekspor audit CSV).
- typecheck 4/4 · lint bersih · build.
