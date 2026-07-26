# Fase 17h — Modul Keuangan memakai komponen `Table`

Migrasi tabel per modul yang kedua (setelah Stok di 17g). Sasaran:
`apps/web/src/pages/finance.tsx` — 4 tabel tangan.

## Catatan arah

Fase 17 berhenti di sini. Pemilik mengubah arah desain menjadi **"bersih &
lapang, terang-dulu"** (lihat rencana Fase 18). Sub-fase ini tetap
diselesaikan dan dimasukkan karena **migrasi tabel bukan pekerjaan gaya** —
Fase 18 justru berdiri di atasnya: pola tabel responsif (18d) menambahkan
perilaku "kartu di layar kecil" ke komponen `Table`, dan itu hanya berlaku
untuk tabel yang sudah memakai komponen tersebut. Membuang pekerjaan ini
berarti mengerjakannya lagi dari nol.

## Yang dikerjakan

Keempat tabel dipindahkan ke `Table`/`Thead`/`Tr`/`Th`/`Td`:

1. **Bagan Akun (COA)** — daftar akun beserta aksi ubah nama.
2. **Baris jurnal** di daftar Jurnal Umum — blok debit/kredit per jurnal.
3. **Buku Besar** — mutasi + saldo berjalan.
4. **Neraca Saldo** — beserta baris total debit/kredit.

Yang hilang bersamanya: konstanta lokal `const th = …` **dan** `const td = …`
(pasangan yang sama dengan yang dihapus di `stok.tsx`), serta pengulangan
`border-b border-slate-100 py-2.5 pr-4 dark:border-slate-800/60` di setiap
`<td>`.

Tombol-tombol dalam sel (`simpan`, `batal`, `ubah nama`) berpindah dari
`className="h-8"` ke `size="xs"` — cara yang benar, tidak bergantung pada
resolusi konflik kelas.

### Keputusan yang mudah terbalik, dan karena itu dikunci uji

Kolom **kode akun** memakai font mono tetapi **tetap rata kiri**, sedangkan
kolom **nilai** (debit/kredit/saldo) memakai `Td numeric` → mono + **rata
kanan**. Menandai kode akun sebagai `numeric` akan terlihat "rapi" sekilas
padahal salah: kode akun adalah **pengenal**, bukan nilai, dan merata-kanankan
pengenal membuat kolomnya sulit dipindai.

Baris jurnal (tabel 2) sengaja **tanpa `Thead`** — judul kolomnya sudah ada di
kartu induk — dan tanpa garis antarbaris, karena itu satu blok debit/kredit,
bukan daftar yang perlu dipisah-pisah.

## Validasi

| Gerbang | Hasil |
| --- | --- |
| `pnpm typecheck` | 4/4 paket lolos |
| `pnpm lint` | bersih |
| `pnpm test` | 244 unit test lolos (tetap) |
| `pnpm build` | ok |
| `pnpm smoke` | 861 cek lolos (tetap) |
| `node scripts/ui-sim.mjs` | **223** cek lolos (naik dari 222) |

Cek baru **`F25`**: pada Neraca Saldo, kolom nilai ter-render mono + rata
**kanan** sementara kolom kode akun ter-render mono + rata **kiri** — dibaca
dari `getComputedStyle`, bukan dari kelas yang menempel. Cek ini akan berbunyi
kalau kelak seseorang menambahkan `numeric` pada kolom kode akun.
