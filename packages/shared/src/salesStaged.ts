import { z } from "zod";
import { passwordSchema } from "./core";
import { TAX_RATES } from "./commerce";

// ---------------------------------------------------------------------------
// Penjualan bertahap (Fase 7b): Sales Order → Surat Jalan (DO) → Faktur
// ---------------------------------------------------------------------------

export const SO_STATUSES = ["open", "delivered", "invoiced", "cancelled"] as const;
export type SalesOrderStatus = (typeof SO_STATUSES)[number];
export const SO_STATUS_LABELS: Record<SalesOrderStatus, string> = {
  open: "Pesanan terbuka",
  delivered: "Sudah dikirim",
  invoiced: "Sudah difakturkan",
  cancelled: "Dibatalkan",
};

/** Pesanan penjualan (SO) — komitmen pelanggan, belum menggerakkan stok/jurnal. */
export const salesOrderSchema = z.object({
  contactId: z.string().min(1, "Pelanggan wajib dipilih"),
  orderDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Tanggal tidak valid"),
  expectedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  warehouseId: z.string().min(1, "Gudang wajib dipilih"),
  taxRate: z
    .number()
    .int()
    .refine((v): v is (typeof TAX_RATES)[number] => (TAX_RATES as readonly number[]).includes(v), "Tarif pajak tidak dikenal")
    .default(0),
  note: z.string().trim().max(300).optional(),
  lines: z
    .array(
      z.object({
        productId: z.string().min(1, "Produk wajib dipilih"),
        qty: z.number().int().min(1, "Jumlah minimal 1"),
        unitPrice: z.number().int().min(0, "Harga tidak boleh negatif"),
        discountPct: z.number().min(0).max(100).optional(),
      }),
    )
    .min(1, "Minimal 1 baris"),
});
export type SalesOrderInput = z.infer<typeof salesOrderSchema>;

/** Buat surat jalan (kirim penuh) dari SO — stok keluar & HPP diakui di sini. */
export const deliverOrderSchema = z.object({
  deliveryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Tanggal tidak valid"),
  note: z.string().trim().max(300).optional(),
});
export type DeliverOrderInput = z.infer<typeof deliverOrderSchema>;

/** Terbitkan faktur dari SO yang sudah dikirim — hanya piutang/pendapatan/PPN. */
export const invoiceFromSoSchema = z.object({
  invoiceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Tanggal tidak valid"),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});
export type InvoiceFromSoInput = z.infer<typeof invoiceFromSoSchema>;

/** Uang muka (DP) atas SO — kas/bank masuk, diakui sebagai uang muka pelanggan. */
export const soDownPaymentSchema = z.object({
  amount: z.number().int().min(1, "Nominal minimal Rp 1"),
  accountId: z.string().min(1, "Akun kas/bank wajib dipilih"),
  paymentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Tanggal tidak valid"),
});
export type SoDownPaymentInput = z.infer<typeof soDownPaymentSchema>;

export type ApiSalesOrderLine = {
  id: string;
  productId: string;
  productName: string;
  qty: number;
  unitPrice: number;
  discountPct: number;
  amount: number;
};
export type ApiSalesOrder = {
  id: string;
  soNo: string;
  contactId: string;
  contactName: string;
  orderDate: string;
  expectedDate: string | null;
  warehouseId: string;
  taxRate: number;
  status: SalesOrderStatus;
  dpAmount: number;
  subtotal: number;
  taxAmount: number;
  total: number;
  invoiceNo: string | null;
  deliveryNo: string | null;
  note: string | null;
  createdAt: string;
  lines: ApiSalesOrderLine[];
};

export const closeShiftSchema = z.object({
  closingCash: z.number().int().min(0).max(1_000_000_000_000),
});

export type ApiPosShift = {
  id: string;
  shiftNo: string;
  warehouseId: string;
  status: "open" | "closed";
  openingCash: number;
  openedAt: string;
  salesCount: number;
  cashSalesTotal: number;
  expectedCash: number;
};

export const stockTransferSchema = z
  .object({
    productId: z.string().min(1, "Produk wajib dipilih"),
    fromWarehouseId: z.string().min(1, "Gudang asal wajib dipilih"),
    toWarehouseId: z.string().min(1, "Gudang tujuan wajib dipilih"),
    qty: z.number().int("Qty harus bilangan bulat").min(1, "Qty minimal 1"),
  })
  .refine((v) => v.fromWarehouseId !== v.toWarehouseId, {
    message: "Gudang asal dan tujuan tidak boleh sama",
    path: ["toWarehouseId"],
  });
export type StockTransferInput = z.infer<typeof stockTransferSchema>;

export const updateProfileSchema = z.object({
  name: z.string().trim().min(2, "Nama minimal 2 karakter").max(100),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Password saat ini wajib diisi"),
  newPassword: passwordSchema,
});
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

export const closeBooksSchema = z.object({
  /** Semua transaksi bertanggal ≤ tanggal ini dikunci. */
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Tanggal tidak valid (YYYY-MM-DD)"),
});
export type CloseBooksInput = z.infer<typeof closeBooksSchema>;

