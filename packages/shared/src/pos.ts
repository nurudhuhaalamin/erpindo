import { z } from "zod";
import { TAX_RATES } from "./commerce";

export const openShiftSchema = z.object({
  warehouseId: z.string().min(1, "Gudang wajib dipilih"),
  openingCash: z.number().int().min(0).max(1_000_000_000_000),
});

export const POS_PAYMENT_METHODS = ["tunai", "qris", "kartu", "ewallet"] as const;
export type PosPaymentMethod = (typeof POS_PAYMENT_METHODS)[number];
export const POS_PAYMENT_METHOD_LABELS: Record<PosPaymentMethod, string> = {
  tunai: "Tunai",
  qris: "QRIS",
  kartu: "Kartu/EDC",
  ewallet: "E-Wallet",
};

const posSaleLineSchema = z.object({
  productId: z.string().min(1),
  qty: z.number().int().min(1),
  unitPrice: z.number().int().min(0),
  discountPct: z.number().min(0).max(100).optional(),
});

export const posSaleSchema = z.object({
  shiftId: z.string().min(1),
  taxRate: z
    .number()
    .int()
    .refine((v): v is (typeof TAX_RATES)[number] => (TAX_RATES as readonly number[]).includes(v), "Tarif pajak tidak dikenal")
    .default(0),
  // Legacy: pembayaran tunai tunggal (dipertahankan). Bila `payments` diisi, itu yang dipakai.
  cashReceived: z.number().int().min(0).max(1_000_000_000_000).optional(),
  // Pembayaran multi-metode: tiap tender {metode, nominal diserahкан}.
  payments: z
    .array(z.object({ method: z.enum(POS_PAYMENT_METHODS), amount: z.number().int().min(1) }))
    .min(1)
    .optional(),
  lines: z.array(posSaleLineSchema).min(1, "Keranjang kosong"),
});
export type PosSaleInput = z.infer<typeof posSaleSchema>;

/** Tahan transaksi (park): simpan keranjang sementara. */
export const holdSaleSchema = z.object({
  shiftId: z.string().min(1),
  label: z.string().trim().min(1, "Beri nama/label").max(60),
  cart: z.array(posSaleLineSchema).min(1, "Keranjang kosong"),
  taxRate: z.number().int().optional(),
});
export type HoldSaleInput = z.infer<typeof holdSaleSchema>;

export type ApiHeldSale = {
  id: string;
  label: string;
  cart: { productId: string; qty: number; unitPrice: number; discountPct?: number }[];
  taxRate: number;
  createdAt: string;
};

/** Refund POS (Fase 10c): kembalikan barang + uang tunai dari laci shift yang terbuka. */
export const posRefundSchema = z.object({
  invoiceId: z.string().min(1, "Pilih struk yang akan direfund"),
  lines: z
    .array(z.object({ productId: z.string().min(1), qty: z.number().int().min(1, "Qty minimal 1") }))
    .min(1, "Pilih minimal satu barang"),
  memo: z.string().trim().max(200).optional(),
});
export type PosRefundInput = z.infer<typeof posRefundSchema>;

/** Baris struk POS untuk panel Struk & Refund. */
export type ApiPosReceipt = {
  id: string;
  invoiceNo: string;
  invoiceDate: string;
  total: number;
  returnedAmount: number;
  lines: { productId: string; productName: string; qty: number; qtyReturnable: number; unitPrice: number }[];
};


/** Rekap penjualan POS satu hari (Fase 12e): per jam, per shift, per metode. */
export type ApiPosRecap = {
  date: string;
  salesCount: number;
  salesTotal: number;
  /** Jam dalam UTC (0–23) — klien mengonversi ke jam lokal perangkat. */
  byHour: { hourUtc: number; count: number; total: number }[];
  byShift: { shiftNo: string; status: "open" | "closed"; count: number; total: number; cashTotal: number }[];
  byMethod: { method: string; amount: number }[];
};
