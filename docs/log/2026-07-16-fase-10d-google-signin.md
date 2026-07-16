# Log Kerja — Fase 10d: Masuk/daftar via Google

**Tanggal:** 16 Juli 2026 · PR keempat Fase 10. Menjawab butir 5: pendaftaran & masuk via akun
Google — dibangun **siap-pakai**: tombol otomatis muncul begitu kredensial dipasang, tanpa
deploy ulang.

## Yang dibangun

- **Migrasi control-plane `0006_google_identity`**: `users` + `google_sub` (index unik parsial).
  `password_hash` tetap NOT NULL — user Google-only diberi hash acak yang tak pernah keluar dari
  proses, sehingga jalur login password untuk akun itu selalu gagal dengan aman.
- **`routes/authGoogle.ts`** (meniru pola OAuth drive.ts):
  - `GET /api/auth/google/available` — web menampilkan tombol hanya bila true.
  - `GET /api/auth/google` — redirect ke consent Google (scope `openid email profile`, state
    ditandatangani sha256 rahasia klien).
  - `GET /api/auth/google/callback` — state palsu → 400; consent dibatalkan → kembali ke /masuk
    dengan pesan ramah; tukar code → id_token → sub+email+nama. Tiga cabang: sudah ber-google_sub
    → sesi; email terdaftar (akun password) → google_sub ditautkan sekali + terverifikasi → sesi;
    user baru → dibuat **terverifikasi tanpa tenant** → sesi → `/daftar?via=google`.
  - Akun demo publik diblokir dari jalur Google.
- **UI**: tombol "Lanjutkan dengan Google" (logo resmi, pemisah "atau") di /masuk & /daftar;
  pesan hasil alur (?google=…) tampil sebagai alert; `/daftar?via=google` menjadi langkah
  "Satu langkah lagi" yang hanya menanyakan **nama perusahaan** (memakai endpoint
  multi-perusahaan yang sudah ada — provisioning DB tenant, COA, trial 30 hari otomatis).
- Guard rbac-guard: tiga endpoint Google masuk PUBLIC_ALLOWLIST dengan alasan tercatat
  (alur OAuth memang pra-login).

## Langkah pemilik (pending — sama dengan backup Drive)

Kredensialnya **satu dan sama** dengan integrasi backup Google Drive (Fase 8b):
1. console.cloud.google.com → APIs & Services → Credentials → OAuth Client ID (Web application).
2. Tambahkan **dua** Authorized redirect URI: `https://<domain>/api/drive/callback` dan
   `https://<domain>/api/auth/google/callback`.
3. Simpan `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` sebagai secret di dashboard Workers.
4. Selesai — tombol Google muncul sendiri di /masuk & /daftar (tanpa deploy ulang).

## Validasi

Typecheck · lint bersih · unit 33 · build · **smoke 720 → 728** (+8: available=false default,
mulai-alur 503 & callback redirect anggun tanpa kredensial; lalu instance wrangler kedua
ber-kredensial dummy: available=true, 302 ke accounts.google.com dengan state bertanda tangan,
state palsu 400, consent dibatalkan → redirect ramah) · **UI-SIM 142** (tanpa kredensial tombol
tidak tampil — asersi lama utuh). Bukti visual tombol di /masuk & /daftar terkirim.

## Berikutnya

Fase 10e: dashboard admin platform + halaman dukungan/masukan + blog CMS SEO (butir 4, 11, 17).
