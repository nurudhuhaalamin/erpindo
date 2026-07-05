import { z } from "zod";

export * from "./payroll";
import { PTKP_STATUSES, type PtkpStatus } from "./payroll";

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
// Paket langganan & batasnya (Fase 2b). Integrasi pembayaran menyusul —
// struktur ini yang ditegakkan middleware sejak sekarang.
// ---------------------------------------------------------------------------

export const PLANS = ["trial", "starter", "business", "enterprise"] as const;
export type Plan = (typeof PLANS)[number];

export const PLAN_LABELS: Record<Plan, string> = {
  trial: "Trial",
  starter: "Starter",
  business: "Business",
  enterprise: "Enterprise",
};

export const PLAN_LIMITS: Record<Plan, { maxUsers: number; pricePerMonth: number }> = {
  trial: { maxUsers: 3, pricePerMonth: 0 },
  starter: { maxUsers: 3, pricePerMonth: 149_000 },
  business: { maxUsers: 15, pricePerMonth: 599_000 },
  enterprise: { maxUsers: Number.MAX_SAFE_INTEGER, pricePerMonth: 0 },
};

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
  /** Kode authenticator 6 digit — wajib bila akun mengaktifkan 2FA. */
  totpCode: z.string().trim().optional(),
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
  totpEnabled: boolean;
};

export type ApiMembership = {
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  tenantStatus: TenantStatus;
  role: Role;
  plan: Plan;
  trialEndsAt: string | null;
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
    projectId: z.string().optional(),
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
  /** Wajib mencatat lot & tanggal kedaluwarsa saat pembelian (F&B/farmasi). */
  trackExpiry: z.boolean().default(false),
  /** Jasa: tidak melacak stok — faktur tak menggerakkan stok/HPP. */
  isService: z.boolean().default(false),
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
  returnedAmount: number;
  /** Mata uang & kurs faktur (IDR bila lokal); foreignTotal = total dalam valas. */
  currency: string;
  exchangeRate: number;
  foreignTotal: number;
  lines: ApiCommerceLine[];
};

export const createReturnSchema = z.object({
  refType: z.enum(["invoice", "purchase"]),
  refId: z.string().min(1),
  warehouseId: z.string().min(1, "Gudang wajib dipilih"),
  returnDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Tanggal tidak valid"),
  memo: z.string().trim().max(200).optional(),
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

// ---------------------------------------------------------------------------
// CRM Pipeline (Fase 2l): lead, funnel, aktivitas, penawaran (quotation)
// ---------------------------------------------------------------------------

/** Tahap funnel penjualan, berurutan dari awal ke penutupan. */
export const LEAD_STAGES = ["new", "contacted", "qualified", "proposal", "won", "lost"] as const;
export type LeadStage = (typeof LEAD_STAGES)[number];

export const LEAD_STAGE_LABELS: Record<LeadStage, string> = {
  new: "Baru",
  contacted: "Dihubungi",
  qualified: "Terkualifikasi",
  proposal: "Penawaran",
  won: "Menang",
  lost: "Kalah",
};

export const LEAD_ACTIVITY_TYPES = ["call", "email", "meeting", "whatsapp", "note"] as const;
export type LeadActivityType = (typeof LEAD_ACTIVITY_TYPES)[number];

export const LEAD_ACTIVITY_LABELS: Record<LeadActivityType, string> = {
  call: "Telepon",
  email: "Email",
  meeting: "Pertemuan",
  whatsapp: "WhatsApp",
  note: "Catatan",
};

export const leadSchema = z.object({
  name: z.string().trim().min(2, "Nama minimal 2 karakter").max(150),
  contactPerson: z.string().trim().max(150).optional(),
  email: z.union([emailSchema, z.literal("")]).optional(),
  phone: z.string().trim().max(30).optional(),
  source: z.string().trim().max(100).optional(),
  estValue: amountSchema.default(0),
  notes: z.string().trim().max(1000).optional(),
});
export type LeadInput = z.infer<typeof leadSchema>;

/** Perubahan lead: geser tahap funnel dan/atau sunting field. Semua opsional. */
export const updateLeadSchema = z.object({
  name: z.string().trim().min(2).max(150).optional(),
  contactPerson: z.string().trim().max(150).optional(),
  email: z.union([emailSchema, z.literal("")]).optional(),
  phone: z.string().trim().max(30).optional(),
  source: z.string().trim().max(100).optional(),
  estValue: amountSchema.optional(),
  notes: z.string().trim().max(1000).optional(),
  stage: z.enum(LEAD_STAGES).optional(),
});
export type UpdateLeadInput = z.infer<typeof updateLeadSchema>;

export const leadActivitySchema = z.object({
  type: z.enum(LEAD_ACTIVITY_TYPES),
  note: z.string().trim().min(1, "Catatan wajib diisi").max(1000),
  activityDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Tanggal tidak valid"),
});
export type LeadActivityInput = z.infer<typeof leadActivitySchema>;

export const createQuotationSchema = z.object({
  contactId: z.string().min(1, "Pelanggan wajib dipilih"),
  leadId: z.string().optional(),
  quoteDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Tanggal tidak valid"),
  validUntil: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  taxRate: z
    .number()
    .int()
    .refine((v): v is (typeof TAX_RATES)[number] => (TAX_RATES as readonly number[]).includes(v), "Tarif pajak tidak dikenal")
    .default(0),
  notes: z.string().trim().max(500).optional(),
  lines: z.array(commerceLineSchema).min(1, "Minimal 1 baris barang"),
});
export type CreateQuotationInput = z.infer<typeof createQuotationSchema>;

export const QUOTATION_STATUSES = ["draft", "sent", "accepted", "rejected", "converted"] as const;
export type QuotationStatus = (typeof QUOTATION_STATUSES)[number];

/** Transisi status penawaran yang boleh dilakukan manual (converted dikelola sistem). */
export const quotationStatusSchema = z.object({
  status: z.enum(["sent", "accepted", "rejected", "draft"]),
});
export type QuotationStatusInput = z.infer<typeof quotationStatusSchema>;

/** Konversi penawaran → faktur penjualan: butuh gudang untuk pergerakan stok. */
export const convertQuotationSchema = z.object({
  warehouseId: z.string().min(1, "Gudang wajib dipilih"),
  invoiceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Tanggal tidak valid"),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});
export type ConvertQuotationInput = z.infer<typeof convertQuotationSchema>;

export type ApiLead = {
  id: string;
  name: string;
  contactPerson: string | null;
  email: string | null;
  phone: string | null;
  source: string | null;
  stage: LeadStage;
  estValue: number;
  notes: string | null;
  status: "open" | "won" | "lost";
  convertedContactId: string | null;
  activityCount: number;
  createdAt: string;
};

export type ApiLeadActivity = {
  id: string;
  type: LeadActivityType;
  note: string;
  activityDate: string;
  userName: string | null;
  createdAt: string;
};

export type ApiQuotation = {
  id: string;
  quoteNo: string;
  contactId: string;
  contactName: string;
  leadId: string | null;
  quoteDate: string;
  validUntil: string | null;
  status: QuotationStatus;
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  total: number;
  notes: string | null;
  resultInvoiceId: string | null;
  lines: ApiCommerceLine[];
};

// ---------------------------------------------------------------------------
// Anggaran (Fase 2n): target pendapatan/beban per akun per bulan
// ---------------------------------------------------------------------------

const PERIOD_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export const setBudgetSchema = z.object({
  accountId: z.string().min(1, "Akun wajib dipilih"),
  period: z.string().regex(PERIOD_RE, "Periode harus berformat YYYY-MM"),
  amount: amountSchema.default(0),
});
export type SetBudgetInput = z.infer<typeof setBudgetSchema>;

export type ApiBudgetRow = {
  accountId: string;
  code: string;
  name: string;
  type: "income" | "expense";
  budget: number;
  actual: number;
  /** Selisih favorable: pendapatan actual>budget atau beban actual<budget. */
  variance: number;
};

export type ApiBudgetReport = {
  period: string;
  rows: ApiBudgetRow[];
  totalBudgetIncome: number;
  totalActualIncome: number;
  totalBudgetExpense: number;
  totalActualExpense: number;
};

// ---------------------------------------------------------------------------
// HR & Payroll (Fase 2o): karyawan, penggajian bulanan (PPh 21 TER + BPJS)
// ---------------------------------------------------------------------------

export const employeeSchema = z.object({
  name: z.string().trim().min(2, "Nama minimal 2 karakter").max(150),
  position: z.string().trim().max(100).optional(),
  ptkpStatus: z.enum(PTKP_STATUSES),
  baseSalary: amountSchema.default(0),
  allowances: amountSchema.default(0),
  bankAccount: z.string().trim().max(50).optional(),
  joinDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});
export type EmployeeInput = z.infer<typeof employeeSchema>;

/** Jalankan penggajian: satu bulan + akun kas pembayar. */
export const runPayrollSchema = z.object({
  period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Periode harus berformat YYYY-MM"),
  cashAccountId: z.string().min(1, "Akun kas/bank wajib dipilih"),
  paymentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Tanggal tidak valid"),
});
export type RunPayrollInput = z.infer<typeof runPayrollSchema>;

export type ApiEmployee = {
  id: string;
  name: string;
  position: string | null;
  ptkpStatus: PtkpStatus;
  baseSalary: number;
  allowances: number;
  bankAccount: string | null;
  joinDate: string | null;
  isActive: boolean;
};

export type ApiPayslip = {
  id: string;
  employeeId: string;
  employeeName: string;
  position: string | null;
  baseSalary: number;
  allowances: number;
  gross: number;
  bpjsHealthEmployee: number;
  bpjsJhtEmployee: number;
  bpjsJpEmployee: number;
  terCategory: string;
  terRate: number;
  pph21: number;
  totalDeductions: number;
  net: number;
};

export type ApiPayrollRun = {
  id: string;
  runNo: string;
  period: string;
  status: "posted";
  totalGross: number;
  totalDeductions: number;
  totalNet: number;
  journalNo: string | null;
  createdAt: string;
  payslips: ApiPayslip[];
};

// ---------------------------------------------------------------------------
// Aset Tetap (Fase 2p): register aset, penyusutan garis lurus, pelepasan
// ---------------------------------------------------------------------------

export const fixedAssetSchema = z
  .object({
    name: z.string().trim().min(2, "Nama minimal 2 karakter").max(150),
    category: z.string().trim().max(100).optional(),
    acquisitionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Tanggal tidak valid"),
    acquisitionCost: z.number().int().min(1, "Nilai perolehan minimal Rp 1").max(1_000_000_000_000),
    usefulLifeMonths: z.number().int().min(1, "Masa manfaat minimal 1 bulan").max(600),
    residualValue: amountSchema.default(0),
    cashAccountId: z.string().min(1, "Akun kas/bank wajib dipilih"),
  })
  .refine((v) => v.residualValue < v.acquisitionCost, {
    message: "Nilai residu harus lebih kecil dari nilai perolehan",
    path: ["residualValue"],
  });
export type FixedAssetInput = z.infer<typeof fixedAssetSchema>;

export const runDepreciationSchema = z.object({
  period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Periode harus berformat YYYY-MM"),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Tanggal tidak valid"),
});
export type RunDepreciationInput = z.infer<typeof runDepreciationSchema>;

export const disposeAssetSchema = z.object({
  disposalDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Tanggal tidak valid"),
  proceeds: amountSchema.default(0),
  cashAccountId: z.string().min(1, "Akun kas/bank wajib dipilih"),
});
export type DisposeAssetInput = z.infer<typeof disposeAssetSchema>;

export type ApiFixedAsset = {
  id: string;
  name: string;
  category: string | null;
  acquisitionDate: string;
  acquisitionCost: number;
  usefulLifeMonths: number;
  residualValue: number;
  accumulatedDepreciation: number;
  bookValue: number;
  monthlyDepreciation: number;
  status: "active" | "disposed";
  disposedDate: string | null;
};

// ---------------------------------------------------------------------------
// Proyek (Fase 2q): proyek & tugas, tagging biaya/pendapatan, profitabilitas
// ---------------------------------------------------------------------------

export const PROJECT_STATUSES = ["active", "completed", "on_hold"] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const projectSchema = z.object({
  code: z.string().trim().min(1, "Kode wajib diisi").max(30).toUpperCase(),
  name: z.string().trim().min(2, "Nama minimal 2 karakter").max(150),
  contactId: z.string().optional(),
  budget: amountSchema.default(0),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  notes: z.string().trim().max(500).optional(),
});
export type ProjectInput = z.infer<typeof projectSchema>;

export const updateProjectStatusSchema = z.object({ status: z.enum(PROJECT_STATUSES) });

export const PROJECT_TASK_STATUSES = ["todo", "in_progress", "done"] as const;
export type ProjectTaskStatus = (typeof PROJECT_TASK_STATUSES)[number];

export const projectTaskSchema = z.object({
  name: z.string().trim().min(1, "Nama tugas wajib diisi").max(200),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});
export type ProjectTaskInput = z.infer<typeof projectTaskSchema>;

export const projectTaskStatusSchema = z.object({ status: z.enum(PROJECT_TASK_STATUSES) });

export type ApiProject = {
  id: string;
  code: string;
  name: string;
  contactId: string | null;
  contactName: string | null;
  status: ProjectStatus;
  budget: number;
  startDate: string | null;
  endDate: string | null;
  notes: string | null;
  revenue: number;
  cost: number;
  profit: number;
  taskCount: number;
  doneCount: number;
};

export type ApiProjectTask = {
  id: string;
  name: string;
  status: ProjectTaskStatus;
  dueDate: string | null;
};

export type ApiProjectDetail = ApiProject & {
  tasks: ApiProjectTask[];
  entries: { entryNo: string; entryDate: string; memo: string | null; revenue: number; cost: number }[];
};

// ---------------------------------------------------------------------------
// Kontrak & tagihan berulang (Fase 2s)
// ---------------------------------------------------------------------------

export const CONTRACT_FREQUENCIES = ["monthly", "quarterly", "yearly"] as const;
export type ContractFrequency = (typeof CONTRACT_FREQUENCIES)[number];

export const CONTRACT_FREQUENCY_LABELS: Record<ContractFrequency, string> = {
  monthly: "Bulanan",
  quarterly: "Triwulanan",
  yearly: "Tahunan",
};

export const createContractSchema = z.object({
  code: z.string().trim().min(1, "Kode wajib diisi").max(30).toUpperCase(),
  contactId: z.string().min(1, "Pelanggan wajib dipilih"),
  name: z.string().trim().min(2, "Nama minimal 2 karakter").max(150),
  frequency: z.enum(CONTRACT_FREQUENCIES),
  taxRate: z
    .number()
    .int()
    .refine((v): v is (typeof TAX_RATES)[number] => (TAX_RATES as readonly number[]).includes(v), "Tarif pajak tidak dikenal")
    .default(0),
  warehouseId: z.string().min(1, "Gudang wajib dipilih"),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Tanggal tidak valid"),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  lines: z
    .array(
      z.object({
        productId: z.string().min(1, "Produk wajib dipilih"),
        description: z.string().trim().max(200).optional(),
        qty: z.number().int().min(1).max(1_000_000),
        unitPrice: z.number().int().min(0).max(1_000_000_000_000),
      }),
    )
    .min(1, "Minimal 1 baris"),
});
export type CreateContractInput = z.infer<typeof createContractSchema>;

export const CONTRACT_STATUSES = ["active", "paused", "ended"] as const;
export type ContractStatus = (typeof CONTRACT_STATUSES)[number];
export const contractStatusSchema = z.object({ status: z.enum(CONTRACT_STATUSES) });

export type ApiContractLine = {
  id: string;
  productId: string;
  productName: string;
  description: string | null;
  qty: number;
  unitPrice: number;
  amount: number;
};

export type ApiContract = {
  id: string;
  code: string;
  contactId: string;
  contactName: string;
  name: string;
  frequency: ContractFrequency;
  taxRate: number;
  nextInvoiceDate: string;
  endDate: string | null;
  status: ContractStatus;
  invoiceCount: number;
  total: number;
  lines: ApiContractLine[];
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
  receivableOutstanding: number;
  payableOutstanding: number;
  inventoryValue: number;
  openLeadsCount: number;
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

export const openShiftSchema = z.object({
  warehouseId: z.string().min(1, "Gudang wajib dipilih"),
  openingCash: z.number().int().min(0).max(1_000_000_000_000),
});

export const posSaleSchema = z.object({
  shiftId: z.string().min(1),
  taxRate: z
    .number()
    .int()
    .refine((v): v is (typeof TAX_RATES)[number] => (TAX_RATES as readonly number[]).includes(v), "Tarif pajak tidak dikenal")
    .default(0),
  cashReceived: z.number().int().min(0).max(1_000_000_000_000),
  lines: z
    .array(
      z.object({
        productId: z.string().min(1),
        qty: z.number().int().min(1),
        unitPrice: z.number().int().min(0),
      }),
    )
    .min(1, "Keranjang kosong"),
});
export type PosSaleInput = z.infer<typeof posSaleSchema>;

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
