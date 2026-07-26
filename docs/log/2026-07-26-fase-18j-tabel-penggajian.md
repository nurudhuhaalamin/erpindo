# Fase 18j — Modul Penggajian memakai `Table` + kartu di HP

Lanjutan rangkaian 18i+. Sasaran: `apps/web/src/pages/payroll.tsx` — 4 tabel,
berkas terbesar kedua di aplikasi (1.369 baris).

## Yang dikerjakan

Keempat tabel dipindahkan ke `Table`/`Thead`/`Tr`/`Th`/`Td` beserta `label`
untuk mode kartu:

1. **Daftar karyawan** — **9 kolom**, tabel terlebar di seluruh aplikasi.
   Inilah yang paling tidak terbaca di HP sebelum pola kartu.
2. **Komponen gaji tambahan** (tunjangan/potongan).
3. **Kasbon karyawan**.
4. **Rincian slip gaji per run** — bruto, BPJS, PPh 21, netto.

## Satu sel yang sengaja TIDAK `numeric`

Kolom **PPh 21 (TER)** memuat nominal **dan** keterangan kategori/tarif
(`TER A/2.5%`). Menandainya `numeric` akan memaksa **seluruh** isi sel jadi
mono — termasuk keterangan dalam kurung, yang jadi sulit dibaca.

Diselesaikan dengan `text-right` pada selnya, lalu utilitas `num` dipasang
hanya pada nominalnya:

```tsx
<Td label="PPh 21 (TER)" className="text-right">
  <span className="num">{formatIDR(p.pph21)}</span>{" "}
  <span className="text-xs text-slate-400">({p.terCategory}/{p.terRate}%)</span>
</Td>
```

Ini pola ketiga dari jenis yang sama: kolom lencana di Stok (17g), kolom kode
akun di Keuangan (17h), dan sekarang kolom bercampur nominal-keterangan.
Aturannya konsisten — **`numeric` untuk sel yang isinya murni nilai**, bukan
untuk setiap sel yang kebetulan memuat angka.

## Sisa pekerjaan

Tersisa **32 `<table>` tangan**, 5 di `print.tsx` yang dikecualikan permanen.
Sasaran sebenarnya **27 tabel di 16 berkas** — `pajak`, `masterdata`, dan
`admin` masing-masing 3; lima berkas @2; delapan berkas @1.

## Validasi

Seluruh gerbang diverifikasi lewat **status keluar**.

| Gerbang | Status keluar |
| --- | --- |
| `pnpm typecheck` | 0 |
| `pnpm lint` | 0 |
| `pnpm test` | 0 — 244 unit test |
| `pnpm build` | 0 |
| `pnpm smoke` | 0 — 863 cek |
| `node scripts/ui-sim.mjs` | 0 — 231 cek |

Tidak ada cek baru; polanya dijaga `F28` di tingkat komponen. Yang jadi ujian
di sini adalah asersi yang **sudah ada** — khususnya `F19` yang membuka tab
Penggajian dan tab Kasbon, dan membaca isinya.
