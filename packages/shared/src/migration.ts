import { z } from "zod";

/**
 * Migrasi & saldo awal (Fase 13f) — penghancur hambatan pindah dari sistem lama.
 * Pengguna mengunggah saldo awal akun + stok awal per gudang; sistem menyusun
 * SATU jurnal pembuka yang dijamin seimbang (selisih otomatis ke Ekuitas Saldo
 * Awal / Laba Ditahan) dan menyetel nilai persediaan agar cocok dengan buku besar.
 *
 * Saldo awal hanya boleh sekali, saat buku masih kosong (belum ada jurnal
 * terposting) — mencegah dobel dan menjaga integritas.
 */

const amount = z.number().int("Nominal harus bilangan bulat").min(0).max(1_000_000_000_000);
const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Tanggal tidak valid");

/** Baris saldo awal akun: kode akun COA + saldo debit ATAU kredit (salah satu). */
export const openingAccountLineSchema = z
  .object({
    accountCode: z.string().trim().min(1, "Kode akun wajib"),
    debit: amount.default(0),
    credit: amount.default(0),
  })
  .refine((l) => !(l.debit > 0 && l.credit > 0), "Baris tidak boleh berisi debit dan kredit sekaligus")
  .refine((l) => l.debit > 0 || l.credit > 0, "Isi salah satu debit atau kredit");

/** Baris stok awal per gudang. Nilai (qty × biaya) otomatis jadi saldo Persediaan. */
export const openingStockLineSchema = z.object({
  productId: z.string().min(1, "Produk wajib"),
  warehouseId: z.string().min(1, "Gudang wajib"),
  qty: z.number().int().min(1, "Qty minimal 1").max(100_000_000),
  unitCost: amount,
});

export const openingBalanceSchema = z.object({
  asOfDate: dateStr,
  /** Saldo awal akun NON-persediaan (kas, bank, piutang, hutang, modal, dst.). */
  accounts: z.array(openingAccountLineSchema).max(500).default([]),
  /** Stok awal — nilainya otomatis menjadi saldo akun Persediaan (1-1300). */
  stock: z.array(openingStockLineSchema).max(5000).default([]),
});
export type OpeningBalanceInput = z.infer<typeof openingBalanceSchema>;

export type ApiOpeningStatus = {
  /** true bila buku masih kosong (belum ada jurnal terposting) → saldo awal boleh diisi. */
  canSetOpening: boolean;
  postedEntries: number;
};
