# Fase 10e — Admin platform + Dukungan/Masukan + Blog SEO

**Tanggal:** 16 Juli 2026
**Branch/PR:** `claude/erp-business-planning-8wx296` → PR #78
**Uji:** typecheck 4/4 · lint bersih · 33 unit · build · **smoke 745** (dari 728) · **ui-sim 145** (dari 142)

Butir pemilik Fase 10: **4 (admin di-gate env)**, **11 (dukungan/masukan)**, **17 (blog SEO)**.

## Ringkasan

Tiga kapabilitas baru yang saling melengkapi, semuanya bertumpu pada **control-plane**
(`c.env.DB`, satu-satunya DB yang punya `.first()`):

1. **Admin platform** — dashboard khusus operator produk (di-gate `PLATFORM_ADMIN_EMAILS`).
2. **Dukungan & masukan** — kanal umpan balik untuk seluruh pengguna.
3. **Blog SEO** — artikel yang ditulis dari dashboard admin, dilayani **server-side render**
   oleh Worker agar terindeks mesin pencari.

## Gerbang akses (`PLATFORM_ADMIN_EMAILS`)

Pola sama dengan `COMPED_EMAILS`. Di `apps/api/src/middleware/auth.ts`:

- `isPlatformAdmin(env, email)` — cocokkan email sesi (lowercase) terhadap daftar env berpisah koma.
- `requirePlatformAdmin` — middleware setelah `requireAuth`; 403 `"Halaman ini khusus admin platform."`.

`/api/auth/me` kini menyertakan `user.isPlatformAdmin?` (additive). Web memakai flag ini untuk
merender item nav **Admin** (grup "Lainnya") — tanpa env terpasang, menu tak pernah muncul.

## Migrasi control-plane `0007_platform_admin`

Additive, bernomor urut setelah `0006_google_identity`:

- **`feedback`** (id, tenant_id NULLABLE, user_id → users, category CHECK `saran|bug|pertanyaan`,
  message, page_path, status CHECK `baru|dibaca|selesai` DEFAULT `baru`, admin_note,
  created/updated) + indeks status & user.
- **`blog_posts`** (id, slug UNIQUE, title, excerpt, body_md, cover_url, `published_at` NULL = draft,
  created/updated).

## API

`apps/api/src/routes/admin.ts` — middleware **per-handler** (bukan `.use`) mengikuti gerbang
struktural `rbac-guard.test.ts`:

- `GET /api/admin/overview` — total users/tenants, per status/paket, pendaftar terbaru (20,
  beserta email pemilik), tren 12 bulan (`substr(created_at,1,7)`), masukan baru.
- `GET /api/admin/tenants` — paginasi + filter status + pencarian nama/slug (escaping ala listDocs).
- `GET/PATCH /api/admin/feedback[/:id]` — daftar + ubah status/catatan (audit).
- `GET/POST/PATCH/DELETE /api/admin/blog-posts` — CRUD; `PATCH {published:boolean}` sebagai
  short-circuit (`published_at = COALESCE(published_at, datetime('now'))` / `NULL`); slug ganda 409.

`feedbackRoutes` (pengguna biasa): `POST /api/feedback` (`requireAuth` +
`rateLimitUser {limit:5, windowSeconds:300}`; `tenantId` opsional **divalidasi keanggotaan**) dan
`GET /api/feedback/mine`.

## Blog SSR — koreksi `run_worker_first` + service worker

Blog dilayani penuh oleh Worker sebelum fallback ASSETS. Dua konfigurasi WAJIB diperluas:

1. **`wrangler.jsonc`** `run_worker_first` → `["/api/*","/__scheduled","/blog","/blog/*",
   "/sitemap.xml","/robots.txt"]` (make-dev-config menyalin utuh → dev & smoke otomatis ikut).
2. **`apps/web/vite.config.ts`** `navigateFallbackDenylist` → **ditambah** `/^\/blog/`,
   `/^\/sitemap\.xml$/`, `/^\/robots\.txt$/`. **Tanpa ini, service worker PWA membajak navigasi
   `/blog` dan menyajikan cangkang aplikasi (SPA 404) untuk pengunjung yang pernah membuka
   aplikasi** — cacat nyata yang ditemukan saat pengambilan screenshot (browser ber-SW dapat
   "Not Found"; crawler tanpa SW tetap dapat HTML). Sekarang SW membiarkan Worker menangani blog.

`apps/api/src/routes/blog.ts`: `GET /blog` (daftar publish, Cache-Control 300 dtk),
`GET /blog/:slug` (draft/tak dikenal → 404 HTML; JSON-LD Article + meta OG), `GET /sitemap.xml`
(+lastmod), `GET /robots.txt` (Disallow /app, /api + Sitemap). Kerangka HTML inline-CSS, header
berlogo situs.

## Markdown renderer homegrown (`packages/shared`)

`renderMarkdown(md)` — subset **escape-first** (aman XSS by construction): seluruh input di-escape
lebih dulu, baru pola markdown diterjemahkan; tautan dibatasi http(s). Mendukung heading
`#..###` (→ `<h2>..<h4>`; `<h1>` dicadangkan untuk judul halaman), daftar `-`/`*`, paragraf, tebal,
miring, kode inline, tautan. Dipakai **dua tempat tanpa duplikasi**: Worker SSR `/blog` dan
pratinjau editor blog di React (`dangerouslySetInnerHTML` aman karena keluaran sudah di-escape).

## Web

- `pages/admin.tsx` — halaman bertab (`role=tablist`) **Ringkasan | Tenant | Masukan | Blog**;
  guard `!isPlatformAdmin` → Alert. Editor blog dengan tombol **Pratinjau** memakai `renderMarkdown`
  yang sama, tombol Terbitkan/Tarik/Hapus (ConfirmDialog).
- `pages/dukungan.tsx` — form kirim masukan + riwayat "Masukan saya" dengan status.
- Rute lazy `/app/admin` & `/app/dukungan` di `main.tsx`; item nav baru di `app.tsx`
  (Dukungan untuk semua, Admin hanya `isPlatformAdmin`). Tautan footer landing → `/blog`.

## Pengujian

- **Smoke +17** (seksi `14j`): `--var PLATFORM_ADMIN_EMAILS:budi@majujaya.co.id` (email pemilik
  smoke). `/api/admin/overview` 401 tanpa sesi + 403 oleh non-admin (Dewi) + 200 oleh admin;
  `/me isPlatformAdmin`; filter `?status=trial`; feedback 201 + kategori salah 400 + `/mine` +
  admin PATCH status; blog POST draft 201 → `/blog/<slug>` 404 → PATCH publish → 200 memuat
  `<title>` + `<h3>` + `<strong>` ter-render → `/blog` daftar → `/sitemap.xml` slug → `/robots.txt`
  Disallow.
- **UI-sim +3** (seksi `F17`): halaman `/app/dukungan` render (judul + form) dan menu **Admin
  tersembunyi** untuk pengguna biasa (`aside nav` hitung 0).

## Menunggu pemilik

Pasang `PLATFORM_ADMIN_EMAILS` (email Anda, pisah koma) di dashboard Workers agar menu Admin aktif.
Pemblokir launching #1 tetap **Midtrans**; Google (`GOOGLE_CLIENT_ID/SECRET`) & R2 masih tertunda.
