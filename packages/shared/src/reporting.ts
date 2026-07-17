import { z } from "zod";

// ---------------------------------------------------------------------------
// Laporan keuangan & dashboard (Fase 1c)
// ---------------------------------------------------------------------------

export type ApiReportLine = { accountId: string; code: string; name: string; amount: number };

export type ApiIncomeStatement = {
  from: string;
  to: string;
  income: ApiReportLine[];
  expense: ApiReportLine[];
  totalIncome: number;
  totalExpense: number;
  netProfit: number;
};

export type ApiBalanceSheet = {
  asOf: string;
  assets: ApiReportLine[];
  liabilities: ApiReportLine[];
  equity: ApiReportLine[];
  totalAssets: number;
  totalLiabilities: number;
  totalEquity: number;
  balanced: boolean;
};

// ---------------------------------------------------------------------------
// Konsolidasi multi-perusahaan (Fase 2t): laporan gabungan lintas tenant yang
// dimiliki (peran owner) oleh pengguna yang sama. Baris digabung per kode akun,
// dengan rincian nilai per perusahaan + total konsolidasi.
// ---------------------------------------------------------------------------

export type ApiConsolidationCompany = { tenantId: string; name: string };

export type ApiConsolidatedRow = {
  code: string;
  name: string;
  /** tenantId -> nilai untuk perusahaan itu (0 bila tak muncul). */
  amounts: Record<string, number>;
  total: number;
};

export type ApiConsolidatedIncomeStatement = {
  from: string;
  to: string;
  companies: ApiConsolidationCompany[];
  income: ApiConsolidatedRow[];
  expense: ApiConsolidatedRow[];
  totalIncomeByCompany: Record<string, number>;
  totalExpenseByCompany: Record<string, number>;
  netProfitByCompany: Record<string, number>;
  totalIncome: number;
  totalExpense: number;
  netProfit: number;
};

export type ApiConsolidatedBalanceSheet = {
  asOf: string;
  companies: ApiConsolidationCompany[];
  assets: ApiConsolidatedRow[];
  liabilities: ApiConsolidatedRow[];
  equity: ApiConsolidatedRow[];
  totalAssetsByCompany: Record<string, number>;
  totalLiabilitiesByCompany: Record<string, number>;
  totalEquityByCompany: Record<string, number>;
  totalAssets: number;
  totalLiabilities: number;
  totalEquity: number;
  balanced: boolean;
};

// ---------------------------------------------------------------------------
// Ekspor e-Faktur (Fase 2x): baris faktur keluaran ber-PPN untuk impor e-Faktur.
// ---------------------------------------------------------------------------

export type ApiEfakturRow = {
  invoiceNo: string;
  invoiceDate: string;
  buyerNpwp: string | null;
  buyerName: string;
  dpp: number;
  ppn: number;
  total: number;
};

export type ApiEfakturReport = {
  from: string;
  to: string;
  rows: ApiEfakturRow[];
  totalDpp: number;
  totalPpn: number;
};

export type ApiCashFlow = {
  from: string;
  to: string;
  openingBalance: number;
  inflows: { label: string; amount: number }[];
  outflows: { label: string; amount: number }[];
  totalIn: number;
  totalOut: number;
  netChange: number;
  closingBalance: number;
};

export type ApiDashboard = {
  cashAndBank: number;
  salesThisMonth: number;
  salesCountThisMonth: number;
  /** Penjualan bulan lalu (untuk delta perbandingan di kartu KPI). */
  salesLastMonth: number;
  receivableOutstanding: number;
  payableOutstanding: number;
  inventoryValue: number;
  openLeadsCount: number;
};

// ---------------------------------------------------------------------------
// Laporan penjualan analitik (Fase 5h): agregat per produk & per pelanggan
// ---------------------------------------------------------------------------

export type ApiSalesByProduct = {
  productId: string;
  sku: string;
  name: string;
  qty: number;
  revenue: number;
};

export type ApiSalesByCustomer = {
  contactId: string;
  name: string;
  invoiceCount: number;
  revenue: number;
};

export type ApiSalesAnalytics = {
  from: string;
  to: string;
  totalRevenue: number;
  invoiceCount: number;
  byProduct: ApiSalesByProduct[];
  byCustomer: ApiSalesByCustomer[];
};

// ---------------------------------------------------------------------------
// Dashboard kustom, tren bulanan & laporan terjadwal (Fase 7h)
// ---------------------------------------------------------------------------

/** Satu bulan pada grafik tren bulanan: omzet & jumlah faktur. */
export type ApiSalesMonthlyRow = { month: string; total: number; count: number };

/** Snapshot laporan terjadwal (mis. rekap penjualan bulanan) yang ditulis Cron. */
export type ApiReportSnapshot = {
  id: string;
  kind: string;
  period: string;
  title: string;
  /** Ringkasan terurai dari payload JSON. */
  summary: { totalRevenue: number; invoiceCount: number; topProduct: string | null; note?: string };
  createdAt: string;
};

/** Jalankan rekap laporan terjadwal untuk satu periode secara manual (YYYY-MM). */
export const runRecapSchema = z.object({
  period: z.string().regex(/^\d{4}-\d{2}$/, "Periode tidak valid (YYYY-MM)"),
});
export type RunRecapInput = z.infer<typeof runRecapSchema>;

/** Status sambungan backup Google Drive (Fase 8b). */
export type ApiDriveStatus = {
  configured: boolean;
  connected: boolean;
  accountEmail?: string | null;
  lastBackupAt?: string | null;
  lastBackupStatus?: string | null;
};

// ---------------------------------------------------------------------------
// Kartu stok, aging & tutup buku (Fase 1d)
// ---------------------------------------------------------------------------

export type ApiStockLot = {
  id: string;
  productId: string;
  sku: string;
  productName: string;
  warehouseName: string;
  lotNo: string | null;
  expiryDate: string | null;
  qty: number;
  daysToExpiry: number | null;
};

export type ApiStockCardRow = {
  date: string;
  refType: string;
  qty: number;
  unitCost: number;
  balance: number;
};

export const AGING_BUCKETS = ["current", "d1_30", "d31_60", "d61_90", "d90_plus"] as const;
export type AgingBucket = (typeof AGING_BUCKETS)[number];

export const AGING_BUCKET_LABELS: Record<AgingBucket, string> = {
  current: "Belum jatuh tempo",
  d1_30: "1–30 hari",
  d31_60: "31–60 hari",
  d61_90: "61–90 hari",
  d90_plus: "> 90 hari",
};

export type ApiAgingRow = {
  contactId: string;
  contactName: string;
  buckets: Record<AgingBucket, number>;
  total: number;
};

export const stockAdjustmentSchema = z.object({
  productId: z.string().min(1, "Produk wajib dipilih"),
  warehouseId: z.string().min(1, "Gudang wajib dipilih"),
  /** Jumlah fisik hasil hitung opname. */
  physicalQty: z.number().int("Qty harus bilangan bulat").min(0).max(1_000_000_000),
  note: z.string().trim().max(200).optional(),
});
export type StockAdjustmentInput = z.infer<typeof stockAdjustmentSchema>;

export type ApiAuditLog = {
  id: string;
  action: string;
  userName: string | null;
  detail: string | null;
  createdAt: string;
};

// --- POS / Kasir ------------------------------------------------------------
