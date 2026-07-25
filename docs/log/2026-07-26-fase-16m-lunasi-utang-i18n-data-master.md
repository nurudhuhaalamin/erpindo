# Fase 16m — Lunasi utang i18n halaman Data Master

Sub-fase kedua pelunasan utang hasil audit Fase 16k. Sasaran:
`apps/web/src/pages/masterdata.tsx` — satu berkas yang menyajikan **tiga
halaman** (`/app/master/produk`, `/app/master/kontak`, `/app/master/gudang`)
dan menyandang utang 54 temuan meski Fase 16b menyatakannya "tuntas".

## Yang dikerjakan

- **38 entri kamus baru** di `apps/web/src/i18n/ui.ts` (440 → 478).
- **24 blok teks + 3 tombol** di `masterdata.tsx` diganti ke `u("…")`.

Utangnya berulang dalam bentuk yang sama pada ketiga entitas — begitu polanya
terlihat, sisanya tinggal mengikuti:

| Bentuk | Produk | Kontak | Gudang |
| --- | --- | --- | --- |
| Judul kartu form (tambah/ubah) | ✔ | ✔ | ✔ |
| Deskripsi kartu form | ✔ | ✔ | ✔ |
| `EmptyState` judul **dan** deskripsi | ✔ | ✔ | ✔ |
| Deskripsi `ConfirmDialog` arsip | ✔ | ✔ | ✔ |
| Tombol submit `Simpan`/`Tambah` | ✔ | ✔ | ✔ |

Ditambah yang khas halaman Produk: tiga label kotak centang panjang (lacak lot
& kedaluwarsa, jasa tanpa stok, lacak nomor seri), panel nomor seri, dan
placeholder satuan besar.

## Konstanta tingkat modul, lagi

`CONTACT_TYPE_LABELS` adalah `Record<ContactType, string>` di tingkat modul,
jadi **tidak boleh memanggil hook**. Perlakuannya disamakan dengan
`TASK_COLUMNS` pada Fase 16j: yang disimpan adalah **kunci kamus**, dan
penerjemahan terjadi saat render.

```ts
const CONTACT_TYPE_LABELS: Record<ContactType, UiKey> = {
  customer: "pelanggan",
  supplier: "pemasok",
  both: "pelangganPemasok",
};
// render: <Badge>{u(CONTACT_TYPE_LABELS[k.type])}</Badge>
```

Ini kedua kalinya bentuk ini muncul. Karena itu ia layak dianggap pola tetap,
bukan kejadian sekali: **setiap tabel/konstanta tingkat modul yang menyimpan
teks tampilan harus menyimpan `UiKey`, bukan `string`.**

## Yang sengaja TIDAK diterjemahkan

Sapuan menyisakan tujuh temuan, seluruhnya sudah diperiksa satu per satu:

- **Header & contoh baris template CSV** — `["sku", "nama", "satuan", …]` dan
  `["BRG-001", "Kopi Arabika 1kg", "pcs", …]`. Ini **format berkas**, bukan
  teks layar: `mapRow` membaca kolom `r.nama`, jadi mengganti header berarti
  mengubah format impor — perkara data, bukan perkara bahasa.
- **Placeholder `PT Pelanggan Setia`** sengaja sama di kedua bahasa. `PT`
  adalah bentuk badan hukum Indonesia; nama perusahaan yang separuh
  diterjemahkan justru terbaca lebih janggal daripada yang dibiarkan utuh.
  Sebaliknya `Gudang Cabang Bandung` → `Bandung Branch Warehouse` karena
  seluruhnya deskriptif.
- Sisanya: nama berkas template, potongan kode, dan argumen kunci kamus.

## Prinsip itu dipasang ke alat

Argumen "header template CSV adalah format berkas, bukan teks layar" tidak
cukup ditulis di log — kalau tidak dipasang ke alat, sapuan berikutnya akan
melaporkannya lagi sebagai utang dan menggoda untuk "diperbaiki".

Karena itu `scripts/sapu-i18n.mjs` kini memperlakukan isi `downloadCsv()`
sama seperti `downloadXlsx()`: kelompok **BERKAS**, bukan `LAYAR`. Keduanya
menghasilkan berkas yang dibaca mesin lain (atau diimpor balik), jadi
menerjemahkannya mengubah format, bukan bahasa.

Efeknya langsung terasa saat menyiapkan fase berikutnya: `reports.tsx` yang
di audit 16k tercatat 44 temuan ternyata **27 di antaranya header kolom
ekspor**. Utang layarnya jauh lebih kecil daripada yang tercatat. Ini
penegasan ketiga bahwa angka ~297 dari 16k adalah batas atas yang longgar.

## Validasi

| Gerbang | Hasil |
| --- | --- |
| `pnpm typecheck` | 4/4 paket lolos |
| `pnpm lint` | bersih |
| `pnpm test` | 234 unit test lolos |
| `pnpm build` | ok |
| `pnpm smoke` | 861 cek lolos |
| `node scripts/ui-sim.mjs` | **200** cek lolos (naik dari 198) |

Dua cek baru, rutenya diverifikasi ke `main.tsx` lebih dulu:

- `F0o` — `/app/master/produk`: `Add product` + `Track serial numbers`.
- `F0p` — `/app/master/kontak`: `Add contact`.

Keduanya memakai penanda positif agar tidak lolos secara hampa, dan penanda
negatifnya murni teks UI — bukan nama produk atau kontak yang berasal dari data
pengguna.
