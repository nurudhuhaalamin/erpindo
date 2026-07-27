# Fase 19h — Manufaktur & Pemeliharaan dwibahasa

Dua berkas, keduanya kini **`BERSIH ✅` sepenuhnya**:

| Berkas | Teks layar | Toast |
| --- | --- | --- |
| `manufacturing.tsx` | **48 → 0** | 6 → 0 |
| `maintenance.tsx` | **36 → 0** | 3 → 0 |

**±60 entri kamus baru.**

## Istilah manufaktur yang sengaja dipertahankan

"BoM", "work center", dan "routing" **tidak diterjemahkan**. Ketiganya dipakai
apa adanya di industri manufaktur Indonesia — operator yang mencari fitur ini
justru mengetik kata itu. Yang diberi keterangan, bukan diganti: judul kartunya
menjadi "Bill of materials (BoM)" dan "Production routing (standard vs actual
cost)".

Batas yang sama dengan Fase 19e untuk istilah pajak: **nama yang dipakai
pemakainya dipertahankan, konsep di sekelilingnya diterjemahkan.**

## Konstanta status QC → kunci kamus

`QC_LABEL` menyimpan teks Indonesia di tingkat modul. Diubah menjadi peta kunci
ber-`satisfies`, pola yang sama dengan `CATEGORIES` (19d) dan
`DASHBOARD_WIDGETS` (16u):

```ts
const QC_LABEL_KEY = {
  none: "qcNone", pending: "qcPending",
  passed: "qcPassed", quarantined: "qcQuarantined",
} satisfies Record<keyof typeof QC_TONE, UiKey>;
```

Menambah status QC baru tanpa terjemahannya kini **gagal saat kompilasi**,
bukan tampil sebagai lencana kosong.

## Alat sapu menangkap bug yang saya buat

Substitusi menaruh `{u("totalBiayaServis")}` ke dalam **template literal**:

```tsx
description={`{u("totalBiayaServis")} ${formatIDR(totalCost)}`}
```

Di sana `{…}` bukan interpolasi JSX melainkan **karakter biasa**, jadi
pengguna akan melihat teks `{u("totalBiayaServis")}` terpampang apa adanya.
Ditangkap `scripts/sapu-i18n.mjs`, yang memang punya penjaga khusus untuk ini:

```
⚠️  maintenance.tsx:347  {u("totalBiayaServis")} di dalam template literal —
    keluar harfiah, seharusnya ${u("totalBiayaServis")}
```

Perlu dicatat bahwa **`tsc` dan `eslint` tidak akan menangkapnya** — secara
tipe dan sintaks kodenya sah sempurna. Hanya alat yang tahu maksudnya bisa
tahu itu salah. Ini pembenaran yang bagus untuk alat sapu yang dibangun di
Fase 16, dan pengingat bahwa "typecheck hijau" bukan sinonim "benar".

## Dua kunci kembar lagi, dan satu near-miss

- `tambahKomponen` dan `pilihOpsi` sudah ada sejak Fase 16 dengan isi sama →
  dipakai ulang. (Kejadian keempat berturut-turut.)
- `asetTunggal` **sengaja dibuat baru**: kunci `aset` yang sudah ada berisi
  "Aset"/**"Assets"** — jamak, untuk judul modul — sedangkan di Pemeliharaan ia
  label sebuah field yang menunjuk **satu** aset.

## Rute ditebak, lalu diperiksa

Cek `F1h` sempat saya tulis dengan rute `/app/aset/pemeliharaan`, ditebak dari
nama menunya. Rute sebenarnya `/app/maintenance`. Ketahuan sebelum dijalankan
karena rutenya diperiksa ke `audit-routes.mjs` — kebiasaan yang sudah tertulis
di komentar cek-cek `F0*` sejak Fase 16, dan kali ini terbukti berguna lagi.

Sejalan dengan koreksi 19g: **klaim tentang keadaan repo harus datang dari
pencarian, bukan dari nama yang kelihatan masuk akal.**

## Cek baru `F1h`

Satu cek untuk dua rute, karena keduanya satu sub-fase. Penandanya judul kartu
yang dirender tanpa syarat data: BoM + routing di Manufaktur, jadwal servis di
Pemeliharaan.

## Validasi

Seluruh gerbang diverifikasi lewat **status keluar**.

| Gerbang | Hasil |
| --- | --- |
| `pnpm typecheck` | lolos (exit 0) |
| `pnpm lint` | bersih (exit 0) |
| `pnpm test` | **246** unit test lolos (tetap) |
| `pnpm build` | ok (exit 0) |
| `pnpm smoke` | **863** cek lolos (tetap) |
| `node scripts/ui-sim.mjs` | **241** cek lolos (naik dari 240) |
| `node scripts/sapu-i18n.mjs` | kedua berkas **BERSIH ✅** |

## Sisa program i18n

13 berkas, ±363 teks. Berikutnya **19i — `approvals` + `contracts` + `helpdesk`**
(64). `approvals` sekalian ikut memindahkan `<h1>`-nya ke `PAGE_HEADINGS`,
seperti dicatat di koreksi 19g.
