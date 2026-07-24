# Log Kerja — Fase 14k: Ekstrak & uji mesin selisih kurs pelunasan

**Tanggal:** 24 Juli 2026.

## Yang dikerjakan

Berbeda dari 14g–14j (murni uji), fase ini **menyentuh kode produksi**: sebuah
**refactor behavior-preserving** agar logika uang/hukum yang selama ini tertanam
di handler bisa diuji unit langsung.

Aritmetika **selisih kurs pelunasan** tadinya inline di handler pembayaran
(`routes/commerce.ts` POST `/payments`) — tak terjangkau uji unit. Diekstrak jadi
fungsi murni **`computeForexSettlement`** (`lib/commercePosting.ts`):

```
counterCleared = round(foreignAmount × docRate)    // menutup piutang/hutang (kurs faktur)
cashIdr        = round(foreignAmount × paymentRate) // kas berpindah (kurs bayar)
forexGain      = receive ? cashIdr − counterCleared : counterCleared − cashIdr
```

Handler kini memanggil fungsi ini alih-alih menghitung sendiri. Faktur IDR
memakai `docRate = paymentRate = 1` → hasil **identik** dengan cabang lama
(`counterCleared = cashIdr = nominal`, selisih 0). Tak ada perubahan perilaku:
angka, arah jurnal, dan pembulatan sama persis.

**`apps/api/test/forexSettlement.test.ts`** (7 uji): IDR tanpa selisih (kedua
arah); penerimaan valas kurs naik → laba / kurs turun → rugi; pembayaran valas
kurs naik → rugi / kurs turun → laba; pembulatan `Math.round` (round(499,5)=500);
kurs bayar = kurs faktur → selisih 0.

## Validasi

- **Unit 195 → 202** (+7): `apps/api` 93 → 100.
- **Smoke 850 (tetap)** — jalur route diuji utuh & LULUS, membuktikan ekstraksi
  behavior-preserving: "pelunasan USD @15.500 → selisih kurs laba 5.000",
  "neraca saldo TETAP seimbang setelah pelunasan valas", dan "void pembayaran
  valas (3 baris jurnal terbalik utuh)" semua tetap hijau.
- typecheck 4/4 · lint bersih · build · ui-sim 184 (tak berubah — tanpa UI baru).

## Catatan jujur

- Ini refactor jalur uang inti, karena itu **wajib lewat smoke** (bukan uji-saja
  seperti 14g–14j). Ekuivalensi cabang IDR dibuktikan matematis (kurs 1) +
  smoke; ekuivalensi cabang valas dibuktikan smoke selisih-kurs yang sudah ada.
- Validasi & pesan error kontekstual (faktur valas wajib isi kurs, dsb.) sengaja
  tetap di handler; hanya aritmetika murni yang diekstrak.
