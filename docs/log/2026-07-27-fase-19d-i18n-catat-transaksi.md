# Fase 19d — Catat Transaksi dwibahasa

Sasaran `apps/web/src/pages/catat.tsx`: wizard berbahasa sehari-hari untuk
pengguna yang tidak akrab dengan jurnal debit-kredit.

**49 → 14 temuan**, dan keempat belas sisanya positif palsu: nilai `id`/
`htmlFor` elemen form (`catat-tanggal`, `catat-jumlah`, …), konstanta sentinel
`__manual__`, dan satu potongan kode yang tertangkap regex.

**±40 entri kamus baru** (598 → 638). Dua kunci yang sudah ada dipakai ulang
alih-alih ditambah: `catatanOpsional` dan `pilihAkunOpsi`.

## Temuan utama: label merangkap sebagai pengenal

Ini bukan berkas yang bisa diterjemahkan dengan mengganti string satu per satu.
Kategori awam disimpan begini:

```ts
const CATEGORIES = {
  keluar: [{ label: "Bayar listrik, air & internet", code: "5-4000" }, …],
};
```

dan **labelnya merangkap tiga peran sekaligus**: teks yang ditampilkan, nilai
`<option>`, dan kunci pencarian akun:

```ts
byCode.get(categories.find((c) => c.label === category)?.code ?? "")
```

Kalau labelnya sekadar diterjemahkan, pencarian itu **putus setiap kali bahasa
diganti**: state `category` masih menyimpan teks bahasa lama sementara
daftarnya sudah berganti, sehingga `find()` mengembalikan `undefined`, kategori
terpilih diam-diam hilang, pratinjau lenyap, dan tombol "Catat" ikut mati.

Yang membuat ini berbahaya: **tidak ada yang gagal keras.** Halaman tetap
tampil, hanya berhenti bekerja.

Perbaikannya memisahkan peran itu — yang disimpan kini **kunci kamus**, dan
labelnya hanya untuk ditampilkan:

```ts
const CATEGORIES = {
  keluar: [{ key: "katListrikAir", code: "5-4000" }, …],
} satisfies Record<Exclude<Mode, "pindah">, { key: UiKey; code: string }[]>;
```

`satisfies` membuat kunci yang salah tulis tertangkap **saat kompilasi**, bukan
menjadi teks kosong saat dijalankan — pola yang sama dengan `DASHBOARD_WIDGETS`
di Fase 16u. `MODE_META` diperlakukan sama.

### Dibuktikan bekerja, bukan diasumsikan

Karena kegagalannya akan senyap, asersi biasa tidak cukup. Sebuah probe
sementara di ui-sim memilih kategori, mengisi jumlah, lalu membaca pratinjau
yang benar-benar dirender:

```
What will be recorded: Rp 500.000 leaves Kas for "Electricity, water & internet".
```

Pratinjau hanya muncul bila `targetAccount` berhasil ditemukan — jadi kalimat
itu sekaligus membuktikan pencarian berbasis kunci menemukan akunnya. Probe
dibuang setelah terbukti.

## Keputusan terjemahan

- **"Prive" dipertahankan apa adanya.** Itu istilah pembukuan baku Indonesia,
  dan padanan Inggrisnya ("owner's drawings") justru lebih teknis daripada
  target pembaca halaman ini. Diberi keterangan dalam kurung.
- **Memo jurnal ikut bahasa aktif.** Saat kategori dipilih, labelnya menjadi
  memo jurnal yang **tersimpan permanen**. Artinya pengguna EN menghasilkan
  memo berbahasa Inggris. Itu perilaku yang benar: memo mencatat apa yang
  dilihat penggunanya saat mencatat, bukan bahasa bawaan sistem.
- Kalimat pratinjau dirangkai dari potongan awalan/akhiran, mengikuti konvensi
  kamus sejak Fase 16 — bukan penyulihan (alasan lengkap di log 19c).

## Cek baru `F1d`

Penandanya sengaja dipilih dari yang dirender **tanpa syarat**: ketiga tombol
mode dan judul kartu penjelasan selalu ada, tidak bergantung akun, kategori,
atau peran. Ini langsung menerapkan pelajaran `F1c` kemarin, di mana penanda
yang hanya muncul bila ada data membuat cek merah walaupun terjemahannya benar.

## Validasi

Seluruh gerbang diverifikasi lewat **status keluar**.

| Gerbang | Hasil |
| --- | --- |
| `pnpm typecheck` | lolos (exit 0) |
| `pnpm lint` | bersih (exit 0) |
| `pnpm test` | **246** unit test lolos (tetap) |
| `pnpm build` | ok (exit 0) |
| `pnpm smoke` | **863** cek lolos (tetap) |
| `node scripts/ui-sim.mjs` | **237** cek lolos (naik dari 236) |
| `node scripts/sapu-i18n.mjs` | `catat.tsx` **49 → 14** (sisanya positif palsu) |

## Sisa program i18n

18 berkas, ±563 teks. Berikutnya **19e — `pajak.tsx`** (50, plus 7 peta label
di `packages/shared`).
