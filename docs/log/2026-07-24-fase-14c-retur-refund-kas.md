# Log Kerja — Fase 14c: Retur dengan refund kas

**Tanggal:** 24 Juli 2026.

## Yang dikerjakan

Menutup fitur yang selama ini **"belum didukung"**: retur atas dokumen yang **sudah
dibayar**. Sebelumnya `returns.ts` menolak retur bila nilainya melebihi sisa tagihan
("Retur dengan refund kas belum didukung") karena jurnalnya mengkredit Piutang / mendebit
Hutang penuh — yang akan membuat saldo negatif bila pelanggan sudah membayar.

Kini nilai retur dipecah:
- **Sebatas sisa tagihan** → mengurangi Piutang (retur jual) / Hutang (retur beli), seperti dulu.
- **Kelebihannya** → **refund tunai** lewat akun kas/bank pilihan: retur jual mengkredit
  kas (uang keluar ke pelanggan); retur beli mendebit kas (uang diterima dari pemasok).

Akun refund wajib dipilih hanya bila ada kelebihan; bila tidak, API membalas
`400 { detail: "refund-account-required" }` dengan pesan berisi nominal refund. Akun
divalidasi harus aset aktif (kas/bank).

### Berkas

- `packages/shared/src/approvals.ts`: `createReturnSchema` + `refundAccountId?` (opsional).
- `apps/api/src/routes/returns.ts`: hitung `appliedToDoc`/`refund`; validasi akun refund;
  jurnal jual/beli memecah Piutang/Hutang + akun refund; respons & audit memuat `refund`.
- `apps/web/src/pages/commerce.tsx`: dialog Retur menambah pemilih **"Akun refund tunai
  (bila nilai retur melebihi sisa tagihan)"** dari daftar akun kas/bank; toast menyebut
  nominal refund. `client.ts`: `createReturn` menerima `refundAccountId` & mengembalikan `refund`.

## Validasi

- **Smoke 842 → 847** (+5): faktur dibayar lunas → retur seluruh barang tanpa akun refund →
  `400 refund-account-required`; dengan akun kas → `201` + `refund` 166.500; neraca saldo
  tetap seimbang. Uji diberi tanggal Agustus agar tak mengganggu jendela laporan arus kas Juli.
- typecheck 4/4 · lint bersih · build · unit 156 · ui-sim 182 (tanpa regresi).

## Catatan

Alur retur di UI belum tercakup ui-sim (di luar cakupan skenario saat ini); logika akuntansi
diuji menyeluruh lewat smoke (termasuk keseimbangan neraca).
