# Fase 19n — Wizard "Mulai" dwibahasa

`apps/web/src/pages/mulai.tsx` — wizard empat langkah yang dilihat setiap
pengguna baru pada kunjungan pertamanya. **`BERSIH ✅`**: teks layar **23 → 0**,
toast **2 → 0**. ±25 entri kamus baru.

Dipecah dari rencana 19n (`mulai` + `migration` + `alat`) karena berkas ini
punya lima komponen dan satu konstanta langkah yang perlu dipetakan.
`migration` + `alat` menjadi 19o.

## Kenapa halaman ini layak didahulukan

Ini layar pertama yang dilihat pengguna baru — kalau seseorang mendaftar dengan
bahasa Inggris aktif, wizard berbahasa Indonesia adalah kesan pertama yang
salah. Berbeda dari halaman `admin` atau `migration` yang hanya dipakai
segelintir orang.

## Jebakan "nama cocok, makna tidak" — varian ketiga

`langkahProfil`, `langkahProduk`, `langkahKontak` **sudah ada** — tetapi isinya
kalimat daftar-tugas onboarding:

> `langkahProfil` = "Lengkapi profil perusahaan (alamat & NPWP)"

sedangkan wizard ini butuh **satu kata** sebagai penanda langkah ("Profil").
Nama kuncinya cocok, maknanya sama sekali berbeda. Dibuat kunci baru
berawalan `wizard*`.

Ini varian ketiga dari jebakan yang sama:

| Fase | Kunci lama | Isinya | Kebutuhan |
| --- | --- | --- | --- |
| 19f | `jumlah` | "Amount" (rupiah) | jumlah unit |
| 19h | `aset` | "Assets" (jamak) | satu aset |
| **19n** | `langkahProfil` | kalimat daftar tugas | satu kata penanda |

## Artefak penggantian bentuk baru: nilai atribut JSX

Aturan 19l (ganti dari terpanjang ke terpendek) mencegah tabrakan substring —
tetapi **tidak** mencegah bentuk ini:

```tsx
// sebelum
<StepCard title="Seberapa akrab Anda dengan akuntansi?" …>
// sesudah penggantian — TIDAK SAH
<StepCard title=u("seberapaAkrabAkuntansi") …>
```

Mengganti string berkutip dengan **ekspresi** memerlukan pembungkus `{…}` bila
posisinya adalah nilai atribut JSX. Enam kejadian sekaligus, seluruhnya
tertangkap `tsc`.

Aturannya bertambah satu: **penggantian string→ekspresi harus tahu posisinya.**
Di dalam JSX teks anak cukup `{u(...)}`; sebagai nilai atribut harus
`={u(...)}`; di dalam template literal harus `${u(...)}` (19h/19j).

## Konstanta langkah → kunci kamus

```ts
const STEP_KEYS = ["wizardProfil", "wizardPengalaman", "wizardProduk",
  "wizardKontak"] as const satisfies readonly UiKey[];
```

Kini `satisfies` benar-benar mengikat, karena `UiKey` sudah diperbaiki di 19k.

## Cek baru `F1n`

Rute `/app/mulai` diverifikasi ke `main.tsx` lebih dulu (halaman ini
`lazyRouteComponent`, jadi tidak ada di `audit-routes.mjs`).

## Validasi

Seluruh gerbang diverifikasi lewat **status keluar**.

| Gerbang | Hasil |
| --- | --- |
| `pnpm typecheck` | lolos (exit 0) |
| `pnpm lint` | bersih (exit 0) |
| `pnpm test` | **249** unit test lolos (tetap) |
| `pnpm build` | ok (exit 0) |
| `pnpm smoke` | **863** cek lolos (tetap) |
| `node scripts/ui-sim.mjs` | **247** cek lolos (naik dari 246) |

## Sisa program i18n

3 berkas: `admin`, `alat`, `migration` (±107 teks), ditambah sisa `app.tsx` +
`src/components/`. Ketiganya halaman internal/administratif, bukan alur
pelanggan sehari-hari.
