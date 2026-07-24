import { z } from "zod";

// ---------------------------------------------------------------------------
// Approval workflow engine (Fase 6e): aturan berjenjang + alur multi-langkah
// ---------------------------------------------------------------------------

export const APPROVAL_DOC_TYPES = ["pembelian", "pesanan_pembelian", "pengeluaran", "jurnal"] as const;
export type ApprovalDocType = (typeof APPROVAL_DOC_TYPES)[number];
export const APPROVAL_DOC_TYPE_LABELS: Record<ApprovalDocType, string> = {
  pembelian: "Pembelian",
  pesanan_pembelian: "Pesanan pembelian",
  pengeluaran: "Pengeluaran kas",
  jurnal: "Jurnal",
};

/** Peran yang bisa jadi approver (viewer tak pernah menyetujui). */
export const APPROVAL_ROLES = ["admin", "owner"] as const;
export type ApprovalRole = (typeof APPROVAL_ROLES)[number];
export const APPROVAL_ROLE_LABELS: Record<ApprovalRole, string> = {
  admin: "Admin",
  owner: "Pemilik",
};

export const APPROVAL_STATUSES = ["pending", "approved", "rejected"] as const;
export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number];
export const APPROVAL_STATUS_LABELS: Record<ApprovalStatus, string> = {
  pending: "Menunggu",
  approved: "Disetujui",
  rejected: "Ditolak",
};

/** Aturan persetujuan: alur di atas ambang untuk jenis dokumen tertentu, disetujui berurutan per peran. */
export const approvalRuleSchema = z.object({
  name: z.string().trim().min(2, "Nama aturan minimal 2 karakter").max(100),
  docType: z.enum(APPROVAL_DOC_TYPES),
  minAmount: z.number().int().min(0, "Ambang tidak boleh negatif"),
  approverRoles: z.array(z.enum(APPROVAL_ROLES)).min(1, "Minimal 1 approver").max(4, "Maksimal 4 langkah"),
});
export type ApprovalRuleInput = z.infer<typeof approvalRuleSchema>;

export const updateApprovalRuleSchema = approvalRuleSchema.partial().extend({ active: z.boolean().optional() });

/** Ajukan alur persetujuan generik. */
export const submitApprovalSchema = z.object({
  docType: z.enum(APPROVAL_DOC_TYPES),
  title: z.string().trim().min(2, "Judul minimal 2 karakter").max(150),
  amount: z.number().int().min(1, "Nominal minimal Rp 1"),
});
export type SubmitApprovalInput = z.infer<typeof submitApprovalSchema>;

export const decideStepSchema = z.object({
  decision: z.enum(["approve", "reject"]),
  note: z.string().trim().max(300).optional(),
});
export type DecideStepInput = z.infer<typeof decideStepSchema>;

export type ApiApprovalRule = {
  id: string;
  name: string;
  docType: ApprovalDocType;
  minAmount: number;
  approverRoles: ApprovalRole[];
  active: boolean;
  createdAt: string;
};

export type ApiApprovalStep = {
  id: string;
  stepOrder: number;
  approverRole: ApprovalRole;
  status: ApprovalStatus;
  decidedBy: string | null;
  decidedByName: string | null;
  decidedAt: string | null;
  note: string | null;
};

export type ApiApprovalFlow = {
  id: string;
  flowNo: string;
  docType: ApprovalDocType;
  title: string;
  amount: number;
  status: ApprovalStatus;
  currentStep: number;
  requestedByName: string | null;
  createdAt: string;
  steps: ApiApprovalStep[];
};

export const createPaymentSchema = z.object({
  refType: z.enum(["invoice", "purchase"]),
  refId: z.string().min(1),
  accountId: z.string().min(1, "Akun kas/bank wajib dipilih"),
  /** Nominal IDR (dokumen IDR). Untuk dokumen valas, isi foreignAmount + exchangeRate. */
  amount: z.number().int().min(1, "Nominal minimal Rp 1").optional(),
  /** Jumlah dibayar dalam mata uang faktur (dokumen valas). */
  foreignAmount: z.number().int().min(1).optional(),
  /** Kurs saat pembayaran (IDR per unit valas). */
  exchangeRate: z.number().positive().optional(),
  paymentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Tanggal tidak valid"),
});
export type CreatePaymentInput = z.infer<typeof createPaymentSchema>;

/** Baris pembayaran (Fase 10c) — untuk daftar + tombol Hapus/void. */
export type ApiPayment = {
  id: string;
  paymentNo: string;
  direction: "receive" | "pay";
  refType: "invoice" | "purchase";
  refId: string;
  docNo: string | null;
  accountId: string;
  accountName: string | null;
  amount: number;
  paymentDate: string;
  currency: string;
  exchangeRate: number;
  foreignAmount: number | null;
  voidedAt: string | null;
  journalNo: string | null;
  voidJournalNo: string | null;
  /** Pembayaran POS tidak bisa di-void terpisah (jurnal menyatu dengan struk). */
  isPos: boolean;
};

export type ApiCommerceLine = {
  id: string;
  productId: string;
  productName: string;
  description: string | null;
  qty: number;
  unitPrice: number;
  /** Diskon per baris (persen, 0–100). */
  discountPct: number;
  amount: number;
};

export type ApiCommerceDoc = {
  id: string;
  docNo: string;
  contactId: string;
  contactName: string;
  date: string;
  dueDate: string | null;
  status: "posted" | "paid";
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  total: number;
  paidAmount: number;
  returnedAmount: number;
  /** Mata uang & kurs faktur (IDR bila lokal); foreignTotal = total dalam valas. */
  currency: string;
  exchangeRate: number;
  foreignTotal: number;
  /** Terisi bila dokumen dibatalkan (jurnal pembalik diposting, stok dikembalikan). */
  voidedAt: string | null;
  lines: ApiCommerceLine[];
};

export const createReturnSchema = z.object({
  refType: z.enum(["invoice", "purchase"]),
  refId: z.string().min(1),
  warehouseId: z.string().min(1, "Gudang wajib dipilih"),
  returnDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Tanggal tidak valid"),
  memo: z.string().trim().max(200).optional(),
  /**
   * Akun kas/bank untuk refund tunai (Fase 14c). Wajib bila nilai retur melebihi
   * sisa tagihan (mis. faktur sudah dibayar): kelebihan dikembalikan tunai ke
   * pelanggan (retur jual) atau diterima dari pemasok (retur beli).
   */
  refundAccountId: z.string().optional(),
  lines: z
    .array(
      z.object({
        productId: z.string().min(1),
        qty: z.number().int("Qty harus bilangan bulat").min(1, "Qty minimal 1"),
      }),
    )
    .min(1, "Minimal 1 baris retur"),
});
export type CreateReturnInput = z.infer<typeof createReturnSchema>;

export type ApiStockLevel = {
  productId: string;
  sku: string;
  productName: string;
  unit: string;
  warehouseId: string;
  warehouseName: string;
  qty: number;
  avgCost: number;
  value: number;
};

