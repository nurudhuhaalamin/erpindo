# Log Kerja — Fase 14l: Ekstrak & uji jurnal pelepasan aset

**Tanggal:** 24 Juli 2026.

## Yang dikerjakan

Melanjutkan pola 14k (refactor behavior-preserving agar logika uang bisa diuji
unit). Penyusun **jurnal pelepasan aset** tadinya inline di handler `dispose`
(`routes/assets.ts`) — tak terjangkau uji unit. Diekstrak jadi fungsi murni
**`buildDisposalJournal`**:

```
bookValue = acquisitionCost − accumulatedDepreciation
gain      = proceeds − bookValue          // >0 laba, <0 rugi
lines     = [ debit Akumulasi, (debit Kas bila hasil>0),
              (debit Beban Lain bila rugi), kredit Aset Tetap,
              (kredit Pendapatan Lain bila laba) ].filter(nol)
```

Handler kini meresolusi akun (seperti dulu) lalu memanggil fungsi ini; angka,
arah baris, dan penyaringan baris nol **sama persis** dengan kode lama.

**`apps/api/test/disposal.test.ts`** (5 uji): laba (kredit Pendapatan Lain),
rugi (debit Beban Lain), tanpa hasil / aset dibuang (tak ada baris kas; rugi =
nilai buku), impas (tanpa baris laba/rugi), dan akumulasi nol (baris akumulasi
disaring). Setiap kasus mengasersi **jurnal seimbang** (Σdebit = Σkredit).

## Validasi

- **Unit 202 → 207** (+5): `apps/api` 100 → 105.
- **Smoke 850 (tetap)** — jalur route LULUS: "lepas aset: nilai buku 47jt, laba
  pelepasan 3jt" + "neraca saldo TETAP seimbang setelah penyusutan & pelepasan",
  membuktikan ekstraksi behavior-preserving.
- typecheck 4/4 · lint bersih · build · ui-sim 184 (tak berubah).

## Catatan jujur

- Smoke menguji cabang **laba**; cabang **rugi / tanpa hasil / impas / akumulasi
  nol** kini terkunci uji unit langsung — cakupan justru bertambah dari
  sebelumnya. Ekuivalensi kode dijamin karena baris disalin identik lalu
  difaktorkan, dan handler tetap meresolusi akun yang sama.
- Validasi (akun kas, tutup buku, aset sudah dilepas) sengaja tetap di handler.
