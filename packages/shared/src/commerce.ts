import { z } from "zod";

// ---------------------------------------------------------------------------
// Penjualan & Pembelian (Fase 1b)
// ---------------------------------------------------------------------------

/** Tarif PPN yang didukung (persen bulat). 0 = tidak kena pajak. */
export const TAX_RATES = [0, 11, 12] as const;

const commerceAmountSchema = z.number().int().min(0).max(1_000_000_000_000);

export const commerceLineSchema = z.object({
  productId: z.string().min(1, "Produk wajib dipilih"),
  description: z.string().trim().max(200).optional(),
  qty: z.number().int("Qty harus bilangan bulat").min(1, "Qty minimal 1").max(1_000_000),
  unitPrice: commerceAmountSchema,
  /** Diskon per baris dalam persen (0–100); nilai baris = qty × harga × (1 − diskon/100). */
  discountPct: z.number().min(0, "Diskon minimal 0%").max(100, "Diskon maksimal 100%").optional(),
  /** Untuk produk berpelacakan kedaluwarsa (pembelian): nomor lot & tanggal exp. */
  lotNo: z.string().trim().max(50).optional(),
  expiryDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Tanggal kedaluwarsa tidak valid")
    .optional(),
});

export const createInvoiceSchema = z.object({
  contactId: z.string().min(1, "Pelanggan wajib dipilih"),
  invoiceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Tanggal tidak valid"),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  taxRate: z
    .number()
    .int()
    .refine((v): v is (typeof TAX_RATES)[number] => (TAX_RATES as readonly number[]).includes(v), "Tarif pajak tidak dikenal")
    .default(0),
  warehouseId: z.string().min(1, "Gudang wajib dipilih"),
  projectId: z.string().optional(),
  /** Mata uang faktur (default IDR). Bila valas, nilai baris dalam mata uang itu. */
  currency: z.string().trim().length(3).toUpperCase().optional(),
  /** Kurs ke IDR saat posting (IDR per 1 unit valas). Wajib > 0 bila valas. */
  exchangeRate: z.number().positive().optional(),
  lines: z.array(commerceLineSchema).min(1, "Minimal 1 baris barang"),
});
export type CreateInvoiceInput = z.infer<typeof createInvoiceSchema>;

// --- Import pesanan marketplace (Fase 11e) ---------------------------------
export const MARKETPLACE_CHANNELS = ["shopee", "tokopedia", "tiktok", "lazada", "lainnya"] as const;
export type MarketplaceChannel = (typeof MARKETPLACE_CHANNELS)[number];
export const MARKETPLACE_CHANNEL_LABELS: Record<MarketplaceChannel, string> = {
  shopee: "Shopee",
  tokopedia: "Tokopedia",
  tiktok: "TikTok Shop",
  lazada: "Lazada",
  lainnya: "Lainnya",
};

export const marketplaceImportSchema = z.object({
  channel: z.enum(MARKETPLACE_CHANNELS),
  warehouseId: z.string().min(1, "Gudang wajib dipilih"),
  contactId: z.string().min(1, "Pelanggan marketplace wajib dipilih"),
  rows: z
    .array(
      z.object({
        externalOrderNo: z.string().trim().min(1, "No. pesanan wajib").max(60),
        orderDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Tanggal tidak valid"),
        sku: z.string().trim().min(1, "SKU wajib").max(60),
        qty: z.number().int().min(1).max(1_000_000),
        unitPrice: z.number().int().min(0).max(1_000_000_000_000),
        discountPct: z.number().min(0).max(100).optional(),
      }),
    )
    .min(1, "Minimal 1 baris pesanan")
    .max(1000, "Maksimal 1000 baris per impor"),
});
export type MarketplaceImportInput = z.infer<typeof marketplaceImportSchema>;

export type ApiMarketplaceOrder = {
  id: string;
  channel: string;
  externalOrderNo: string;
  invoiceNo: string | null;
  importedAt: string;
};

// --- Template industri (Fase 11f) ------------------------------------------
// Paket data awal per jenis usaha: contoh produk + kontak agar pengguna baru
// bisa langsung mencoba alur (bisa diubah/hapus kapan saja).
export const INDUSTRY_KEYS = ["retail", "fnb", "jasa", "grosir"] as const;
export type IndustryKey = (typeof INDUSTRY_KEYS)[number];
export const INDUSTRY_LABELS: Record<IndustryKey, string> = {
  retail: "Toko Retail / Kelontong",
  fnb: "Kuliner / F&B",
  jasa: "Jasa / Servis",
  grosir: "Grosir / Distribusi",
};

type TemplateProduct = { sku: string; name: string; unit: string; sellPrice: number; buyPrice: number; isService?: boolean };
type TemplateContact = { type: "customer" | "supplier"; name: string };

export const INDUSTRY_TEMPLATES: Record<IndustryKey, { products: TemplateProduct[]; contacts: TemplateContact[] }> = {
  retail: {
    products: [
      { sku: "RTL-001", name: "Air Mineral 600ml", unit: "botol", sellPrice: 3_000, buyPrice: 2_000 },
      { sku: "RTL-002", name: "Mie Instan Goreng", unit: "pcs", sellPrice: 3_500, buyPrice: 2_500 },
      { sku: "RTL-003", name: "Gula Pasir 1kg", unit: "pak", sellPrice: 15_000, buyPrice: 12_000 },
      { sku: "RTL-004", name: "Minyak Goreng 1L", unit: "botol", sellPrice: 18_000, buyPrice: 15_000 },
      { sku: "RTL-005", name: "Rokok (bungkus)", unit: "bungkus", sellPrice: 25_000, buyPrice: 22_000 },
    ],
    contacts: [
      { type: "customer", name: "Pelanggan Umum" },
      { type: "supplier", name: "Distributor Sembako" },
    ],
  },
  fnb: {
    products: [
      { sku: "FNB-001", name: "Es Teh Manis", unit: "gelas", sellPrice: 5_000, buyPrice: 1_500 },
      { sku: "FNB-002", name: "Kopi Susu", unit: "gelas", sellPrice: 18_000, buyPrice: 6_000 },
      { sku: "FNB-003", name: "Nasi Goreng Spesial", unit: "porsi", sellPrice: 25_000, buyPrice: 10_000 },
      { sku: "FNB-004", name: "Ayam Geprek", unit: "porsi", sellPrice: 22_000, buyPrice: 9_000 },
      { sku: "FNB-005", name: "Kentang Goreng", unit: "porsi", sellPrice: 15_000, buyPrice: 5_000 },
    ],
    contacts: [
      { type: "customer", name: "Pelanggan Dine-in" },
      { type: "supplier", name: "Pemasok Bahan Baku" },
    ],
  },
  jasa: {
    products: [
      { sku: "JSA-001", name: "Konsultasi (per jam)", unit: "jam", sellPrice: 150_000, buyPrice: 0, isService: true },
      { sku: "JSA-002", name: "Servis Ringan", unit: "unit", sellPrice: 100_000, buyPrice: 0, isService: true },
      { sku: "JSA-003", name: "Servis Berat", unit: "unit", sellPrice: 350_000, buyPrice: 0, isService: true },
      { sku: "JSA-004", name: "Biaya Pemanggilan", unit: "kali", sellPrice: 50_000, buyPrice: 0, isService: true },
    ],
    contacts: [
      { type: "customer", name: "Klien" },
      { type: "supplier", name: "Vendor Suku Cadang" },
    ],
  },
  grosir: {
    products: [
      { sku: "GRS-001", name: "Beras 25kg (karung)", unit: "karung", sellPrice: 320_000, buyPrice: 290_000 },
      { sku: "GRS-002", name: "Gula Pasir 50kg", unit: "karung", sellPrice: 700_000, buyPrice: 650_000 },
      { sku: "GRS-003", name: "Minyak Goreng 1 dus (12L)", unit: "dus", sellPrice: 200_000, buyPrice: 175_000 },
      { sku: "GRS-004", name: "Mie Instan 1 dus", unit: "dus", sellPrice: 110_000, buyPrice: 95_000 },
    ],
    contacts: [
      { type: "customer", name: "Toko Langganan" },
      { type: "supplier", name: "Pabrik / Principal" },
    ],
  },
};

export const industryTemplateSchema = z.object({ industry: z.enum(INDUSTRY_KEYS) });
export type IndustryTemplateInput = z.infer<typeof industryTemplateSchema>;

export const currencySchema = z.object({
  code: z.string().trim().length(3, "Kode mata uang 3 huruf").toUpperCase(),
  name: z.string().trim().min(2).max(50),
  rate: z.number().positive("Kurs harus lebih dari 0"),
});
export type CurrencyInput = z.infer<typeof currencySchema>;

export type ApiCurrency = { code: string; name: string; rate: number; isBase: boolean };

/** Skema pembelian identik dengan penjualan (pihak = pemasok). */
export const createPurchaseSchema = createInvoiceSchema;
export type CreatePurchaseInput = z.infer<typeof createPurchaseSchema>;

// ---------------------------------------------------------------------------
// Procurement / procure-to-pay (Fase 6d): PR → PO → penerimaan (GRN) → faktur
// ---------------------------------------------------------------------------

export const REQUISITION_STATUSES = ["submitted", "approved", "rejected", "ordered"] as const;
export type RequisitionStatus = (typeof REQUISITION_STATUSES)[number];
export const REQUISITION_STATUS_LABELS: Record<RequisitionStatus, string> = {
  submitted: "Diajukan",
  approved: "Disetujui",
  rejected: "Ditolak",
  ordered: "Jadi pesanan",
};

export const PO_STATUSES = ["ordered", "received", "cancelled"] as const;
export type PoStatus = (typeof PO_STATUSES)[number];
export const PO_STATUS_LABELS: Record<PoStatus, string> = {
  ordered: "Dipesan",
  received: "Diterima",
  cancelled: "Dibatalkan",
};

/** Permintaan pembelian (PR): daftar barang yang diminta, belum ada harga/pemasok. */
export const requisitionSchema = z.object({
  note: z.string().trim().max(300).optional(),
  lines: z
    .array(
      z.object({
        productId: z.string().min(1, "Produk wajib dipilih"),
        qty: z.number().int().min(1, "Jumlah minimal 1"),
        note: z.string().trim().max(150).optional(),
      }),
    )
    .min(1, "Minimal 1 baris permintaan"),
});
export type RequisitionInput = z.infer<typeof requisitionSchema>;

export const decideRequisitionSchema = z.object({ status: z.enum(["approved", "rejected"]) });

/** Pesanan pembelian (PO) ke pemasok: harga per baris + pajak + gudang tujuan. */
export const purchaseOrderSchema = z.object({
  requisitionId: z.string().optional(),
  contactId: z.string().min(1, "Pemasok wajib dipilih"),
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
      }),
    )
    .min(1, "Minimal 1 baris pesanan"),
});
export type PurchaseOrderInput = z.infer<typeof purchaseOrderSchema>;

/** Penerimaan barang (GRN): jumlah diterima per baris PO → memicu faktur pembelian. */
export const receiveGoodsSchema = z.object({
  receiptDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Tanggal tidak valid"),
  note: z.string().trim().max(300).optional(),
  lines: z
    .array(
      z.object({
        poLineId: z.string().min(1),
        qtyReceived: z.number().int().min(0),
      }),
    )
    .min(1, "Minimal 1 baris penerimaan"),
});
export type ReceiveGoodsInput = z.infer<typeof receiveGoodsSchema>;

export type ApiRequisitionLine = {
  id: string;
  productId: string;
  productName: string;
  qty: number;
  note: string | null;
};
export type ApiRequisition = {
  id: string;
  reqNo: string;
  note: string | null;
  status: RequisitionStatus;
  createdAt: string;
  lines: ApiRequisitionLine[];
};

export type ApiPurchaseOrderLine = {
  id: string;
  productId: string;
  productName: string;
  qty: number;
  unitPrice: number;
};
export type ApiPurchaseOrder = {
  id: string;
  poNo: string;
  contactId: string;
  contactName: string;
  orderDate: string;
  expectedDate: string | null;
  warehouseId: string;
  taxRate: number;
  status: PoStatus;
  note: string | null;
  total: number;
  purchaseNo: string | null;
  createdAt: string;
  lines: ApiPurchaseOrderLine[];
};

export type ApiGoodsReceipt = {
  id: string;
  grnNo: string;
  poNo: string;
  receiptDate: string;
  purchaseNo: string | null;
  note: string | null;
  createdAt: string;
};

