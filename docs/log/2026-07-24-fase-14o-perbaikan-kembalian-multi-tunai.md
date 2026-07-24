# Log Kerja — Fase 14o: Perbaikan kembalian multi-tender tunai (POS)

**Tanggal:** 24 Juli 2026.

## Yang dikerjakan

Menindaklanjuti **temuan laten** yang dicatat di 14n. Pada `computePosTenders`
(`routes/pos.ts`), kembalian dikurangkan dari **tiap** baris tunai:

```
amount = p.method === "tunai" ? p.amount - change : p.amount   // lama
```

Untuk satu tender tunai (satu-satunya kasus yang dikirim UI kasir) hasilnya
benar. Namun bila satu transaksi memakai **>1 tender tunai**, kembalian terpotong
berulang → nilai tunai yang masuk pembukuan kurang (mis. total 100rb, tunai
60rb+60rb, kembalian 20rb → pembukuan 80rb, seharusnya 100rb).

Perbaikan: kembalian dikurangkan dari **total** tunai, disebar antar tender tunai
**sekali**:

```
let changeLeft = change;
applied = tenders.map(p =>
  p.method !== "tunai" ? {…, amount: p.amount}
  : (deduct = min(changeLeft, p.amount), changeLeft -= deduct, {…, amount: p.amount - deduct}));
```

**Kesetaraan kasus nyata:** untuk satu tender tunai, `deduct = min(change,
p.amount) = change` (karena `change ≤ cashTendered = p.amount` sudah divalidasi)
→ `amount = p.amount − change`, **identik dengan kode lama**. Jadi seluruh jalur
kasir yang dipakai sekarang tak berubah; hanya edge multi-tunai yang dibenarkan.

## Validasi

- **Unit 221 → 222** (+1): uji baru membuktikan kembalian disebar (total 100rb,
  2×tunai 60rb → `cashApplied 100rb`, bukan 80rb); 9 uji POS lain tetap hijau.
- **Smoke 850 (tetap)** — "penjualan POS 2 pcs", "kas laci shift menyusut sebesar
  refund", "neraca saldo seimbang setelah refund POS" tetap lolos → jalur
  satu-tender identik.
- typecheck 4/4 · lint bersih · build · ui-sim 184.

## Catatan

- Ini **perubahan perilaku** yang disengaja tetapi hanya menyentuh kasus yang
  belum terpicu UI (koreksi bug), bukan jalur produksi aktif — karena itu aman &
  diverifikasi ganda (unit kesetaraan + smoke). Bila kelak UI mengizinkan
  beberapa tender tunai dalam satu transaksi, pembukuannya kini sudah benar.
