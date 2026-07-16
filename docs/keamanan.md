# Keamanan ERPindo — praktik internal

Dokumen ini merangkum praktik keamanan yang diterapkan di kode & operasi ERPindo.
Ditulis jujur — tanpa klaim sertifikasi. Diperbarui pada Fase 10h.

## Isolasi data

- **Database terpisah per perusahaan.** Setiap tenant memiliki database D1 sendiri
  (`getTenantDb` memetakan `dbRef` tenant ke binding terpisah). Data satu perusahaan
  tidak pernah berbagi tabel dengan perusahaan lain. Control-plane (`c.env.DB`) hanya
  menyimpan akun, keanggotaan, langganan, dan metadata platform.
- **RBAC berlapis.** Owner/Admin/Viewer sebagai preset + peran kustom per-modul
  (`custom_roles`) + pembatasan dimensi per cost center (Fase 8d). Ditegakkan
  server-side lewat `requireTenantRole` / `resolvePermissions`.
- **Gerbang RBAC struktural.** `apps/api/test/rbac-guard.test.ts` memindai seluruh
  registrasi rute dan menggagalkan build bila ada endpoint tanpa `requireAuth`
  (kecuali allowlist publik eksplisit: health, register/login, callback OAuth,
  demo, blog SSR + sitemap/robots).

## Autentikasi & sesi

- Kata sandi di-hash (tidak pernah disimpan polos). Sesi lewat cookie
  `erpindo_sid` HttpOnly.
- **2FA TOTP** (RFC 6238) opsional per pengguna; rahasia TOTP disimpan
  **terenkripsi** (`lib/crypto.ts`, WebCrypto AES-GCM).
- **Login Google (OAuth 2.0)** — state ditandatangani (sha256), id_token dibaca
  via koneksi TLS ke Google; degradasi anggun bila kredensial belum dipasang.

## Header keamanan (Fase 10h)

Diterapkan lewat `secureHeaders` di `apps/api/src/index.ts` untuk semua respons:

- **Content-Security-Policy**: `default-src 'self'`, `script-src 'self'`,
  `style-src 'self' 'unsafe-inline'` (atribut gaya React & gaya inline blog),
  `img-src 'self' data:`, `connect-src 'self'`, `object-src 'none'`,
  `base-uri 'self'`, `frame-ancestors 'none'`. **Tidak** memaksa
  `upgrade-insecure-requests` (agar dev/CI di http lokal tak rusak).
- **Strict-Transport-Security** (HSTS) 1 tahun + includeSubDomains.
- **X-Frame-Options: DENY** + `frame-ancestors 'none'` (anti clickjacking).
- **Referrer-Policy: strict-origin-when-cross-origin**.
- **Permissions-Policy**: kamera, mikrofon, geolokasi, dan payment dimatikan.
- **X-Content-Type-Options: nosniff** (default secureHeaders).

## Integritas keuangan

- **Jurnal immutable.** Buku besar tidak pernah dihapus/diedit — koreksi selalu
  lewat **jurnal pembalik** bertaut dua arah (Fase 10c). Neraca saldo dijaga
  seimbang oleh `postJournal` dan diverifikasi di setiap skenario smoke.
- **Kunci periode** (tutup buku) mencegah posting mundur ke periode terkunci.

## Rate limiting

- Endpoint sensitif/berat dibatasi via `middleware/rateLimit.ts` (kunci per-user,
  fallback IP): login/register, AI, ekspor berat, masukan pengguna
  (`/api/feedback` 5/5 menit), backup Drive.

## Rahasia & konfigurasi

- **Tidak ada secret di repo.** Semua kredensial (COMPED_EMAILS,
  PLATFORM_ADMIN_EMAILS, GOOGLE_CLIENT_ID/SECRET, dsb.) lewat variabel/secret
  Cloudflare Workers. Identitas model AI juga tidak pernah ditulis ke artefak repo.

## Portabilitas (anti lock-in)

- **Ekspor penuh** (ZIP berisi CSV per tabel) selalu tersedia — bahkan saat
  langganan berakhir (mode baca-saja memblokir tulis, bukan baca). Cadangan
  otomatis ke Google Drive (opsional, terenkripsi refresh token).

## Uji otomatis sebagai pagar keamanan

Setiap perubahan wajib lolos: 749 skenario smoke end-to-end, 160 cek simulasi UI
browser nyata, 33 unit test, typecheck & lint — termasuk gerbang RBAC struktural
dan verifikasi neraca saldo seimbang di setiap pembalikan transaksi.
