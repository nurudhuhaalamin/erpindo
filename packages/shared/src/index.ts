import { z } from "zod";

// ---------------------------------------------------------------------------
// Peran & status — konstanta lintas frontend/backend
// ---------------------------------------------------------------------------

export const ROLES = ["owner", "admin", "viewer"] as const;
export type Role = (typeof ROLES)[number];

/** Urutan kekuatan peran; angka lebih besar = hak lebih tinggi. */
export const ROLE_LEVEL: Record<Role, number> = {
  viewer: 1,
  admin: 2,
  owner: 3,
};

export const TENANT_STATUSES = [
  "provisioning",
  "trial",
  "active",
  "past_due",
  "suspended",
] as const;
export type TenantStatus = (typeof TENANT_STATUSES)[number];

export const TRIAL_DAYS = 14;

// ---------------------------------------------------------------------------
// Skema validasi bersama (dipakai form web & endpoint API)
// ---------------------------------------------------------------------------

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email("Alamat email tidak valid");

export const passwordSchema = z
  .string()
  .min(8, "Password minimal 8 karakter")
  .max(128, "Password maksimal 128 karakter");

export const slugSchema = z
  .string()
  .min(3, "Minimal 3 karakter")
  .max(40, "Maksimal 40 karakter")
  .regex(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/, "Hanya huruf kecil, angka, dan tanda hubung");

export const registerSchema = z.object({
  companyName: z.string().trim().min(2, "Nama perusahaan minimal 2 karakter").max(100),
  name: z.string().trim().min(2, "Nama minimal 2 karakter").max(100),
  email: emailSchema,
  password: passwordSchema,
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Password wajib diisi"),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const forgotPasswordSchema = z.object({ email: emailSchema });
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z.object({
  token: z.string().min(1),
  password: passwordSchema,
});
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

export const inviteSchema = z.object({
  email: emailSchema,
  role: z.enum(["admin", "viewer"]),
});
export type InviteInput = z.infer<typeof inviteSchema>;

export const acceptInviteSchema = z.object({ token: z.string().min(1) });

export const updateTenantSettingsSchema = z.object({
  displayName: z.string().trim().min(2).max(100).optional(),
  address: z.string().trim().max(500).optional(),
  npwp: z.string().trim().max(30).optional(),
});
export type UpdateTenantSettingsInput = z.infer<typeof updateTenantSettingsSchema>;

// ---------------------------------------------------------------------------
// Bentuk respons API (kontrak untuk frontend)
// ---------------------------------------------------------------------------

export type ApiUser = {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
};

export type ApiMembership = {
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  tenantStatus: TenantStatus;
  role: Role;
};

export type MeResponse = {
  user: ApiUser;
  memberships: ApiMembership[];
};

export type ApiMember = {
  userId: string;
  name: string;
  email: string;
  role: Role;
  joinedAt: string;
};

export type ApiError = { error: string; issues?: Record<string, string[]> };

// ---------------------------------------------------------------------------
// Modul Keuangan & Master Data (Fase 1)
// ---------------------------------------------------------------------------

export const ACCOUNT_TYPES = ["asset", "liability", "equity", "income", "expense"] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  asset: "Aset",
  liability: "Kewajiban",
  equity: "Ekuitas",
  income: "Pendapatan",
  expense: "Beban",
};

/** Saldo normal debit? (aset & beban bertambah di sisi debit) */
export const DEBIT_NORMAL: Record<AccountType, boolean> = {
  asset: true,
  expense: true,
  liability: false,
  equity: false,
  income: false,
};

export const createAccountSchema = z.object({
  code: z
    .string()
    .trim()
    .min(1, "Kode wajib diisi")
    .max(20)
    .regex(/^[0-9][0-9-]*$/, "Kode akun berupa angka dan tanda hubung, mis. 1-1600"),
  name: z.string().trim().min(2, "Nama akun minimal 2 karakter").max(100),
  type: z.enum(ACCOUNT_TYPES),
});
export type CreateAccountInput = z.infer<typeof createAccountSchema>;

/** Nominal rupiah bulat non-negatif (IDR tanpa sen), maksimal 1 triliun. */
const amountSchema = z.number().int("Nominal harus bilangan bulat").min(0).max(1_000_000_000_000);

export const journalLineSchema = z.object({
  accountId: z.string().min(1, "Akun wajib dipilih"),
  description: z.string().trim().max(200).optional(),
  debit: amountSchema.default(0),
  credit: amountSchema.default(0),
});

export const createJournalEntrySchema = z
  .object({
    entryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Tanggal tidak valid (YYYY-MM-DD)"),
    memo: z.string().trim().max(500).optional(),
    lines: z.array(journalLineSchema).min(2, "Jurnal minimal 2 baris"),
  })
  .superRefine((val, ctx) => {
    let debit = 0;
    let credit = 0;
    for (const [i, line] of val.lines.entries()) {
      if (line.debit === 0 && line.credit === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["lines", i],
          message: "Baris harus punya nilai debit atau kredit",
        });
      }
      if (line.debit > 0 && line.credit > 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["lines", i],
          message: "Satu baris tidak boleh debit dan kredit sekaligus",
        });
      }
      debit += line.debit;
      credit += line.credit;
    }
    if (debit !== credit) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["lines"],
        message: `Jurnal tidak seimbang: total debit ${debit} ≠ total kredit ${credit}`,
      });
    }
    if (debit === 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["lines"], message: "Total jurnal tidak boleh nol" });
    }
  });
export type CreateJournalEntryInput = z.infer<typeof createJournalEntrySchema>;

export const CONTACT_TYPES = ["customer", "supplier", "both"] as const;
export type ContactType = (typeof CONTACT_TYPES)[number];

export const contactSchema = z.object({
  type: z.enum(CONTACT_TYPES),
  name: z.string().trim().min(2, "Nama minimal 2 karakter").max(150),
  email: z.union([emailSchema, z.literal("")]).optional(),
  phone: z.string().trim().max(30).optional(),
  address: z.string().trim().max(500).optional(),
  npwp: z.string().trim().max(30).optional(),
});
export type ContactInput = z.infer<typeof contactSchema>;

export const productSchema = z.object({
  sku: z.string().trim().min(1, "SKU wajib diisi").max(50),
  name: z.string().trim().min(2, "Nama minimal 2 karakter").max(150),
  unit: z.string().trim().min(1).max(20).default("pcs"),
  sellPrice: amountSchema.default(0),
  buyPrice: amountSchema.default(0),
});
export type ProductInput = z.infer<typeof productSchema>;

export const warehouseSchema = z.object({
  code: z.string().trim().min(1, "Kode wajib diisi").max(20).toUpperCase(),
  name: z.string().trim().min(2, "Nama minimal 2 karakter").max(100),
  address: z.string().trim().max(500).optional(),
});
export type WarehouseInput = z.infer<typeof warehouseSchema>;

// Bentuk respons API modul (kontrak frontend)
export type ApiAccount = {
  id: string;
  code: string;
  name: string;
  type: AccountType;
  isSystem: boolean;
  isArchived: boolean;
};

export type ApiJournalLine = {
  id: string;
  accountId: string;
  accountCode: string;
  accountName: string;
  description: string | null;
  debit: number;
  credit: number;
};

export type ApiJournalEntry = {
  id: string;
  entryNo: string;
  entryDate: string;
  memo: string | null;
  status: "posted" | "void";
  lines: ApiJournalLine[];
};

export type ApiTrialBalanceRow = {
  accountId: string;
  code: string;
  name: string;
  type: AccountType;
  debit: number;
  credit: number;
};

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
  lines: z.array(commerceLineSchema).min(1, "Minimal 1 baris barang"),
});
export type CreateInvoiceInput = z.infer<typeof createInvoiceSchema>;

/** Skema pembelian identik dengan penjualan (pihak = pemasok). */
export const createPurchaseSchema = createInvoiceSchema;
export type CreatePurchaseInput = z.infer<typeof createPurchaseSchema>;

export const createPaymentSchema = z.object({
  refType: z.enum(["invoice", "purchase"]),
  refId: z.string().min(1),
  accountId: z.string().min(1, "Akun kas/bank wajib dipilih"),
  amount: z.number().int().min(1, "Nominal minimal Rp 1"),
  paymentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Tanggal tidak valid"),
});
export type CreatePaymentInput = z.infer<typeof createPaymentSchema>;

export type ApiCommerceLine = {
  id: string;
  productId: string;
  productName: string;
  description: string | null;
  qty: number;
  unitPrice: number;
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
  lines: ApiCommerceLine[];
};

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

export type ApiDashboard = {
  cashAndBank: number;
  salesThisMonth: number;
  salesCountThisMonth: number;
  receivableOutstanding: number;
  payableOutstanding: number;
  inventoryValue: number;
};

// ---------------------------------------------------------------------------
// Kartu stok, aging & tutup buku (Fase 1d)
// ---------------------------------------------------------------------------

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

export const closeBooksSchema = z.object({
  /** Semua transaksi bertanggal ≤ tanggal ini dikunci. */
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Tanggal tidak valid (YYYY-MM-DD)"),
});
export type CloseBooksInput = z.infer<typeof closeBooksSchema>;

/** Ubah nama perusahaan menjadi slug subdomain yang aman. */
export function toSlug(name: string): string {
  return (
    name
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40)
      .replace(/-+$/g, "") || "perusahaan"
  );
}
