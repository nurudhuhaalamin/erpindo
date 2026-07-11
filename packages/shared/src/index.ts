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

export const TRIAL_DAYS = 30;

// ---------------------------------------------------------------------------
// Paket langganan & batasnya (Fase 2b). Integrasi pembayaran menyusul —
// struktur ini yang ditegakkan middleware sejak sekarang.
// ---------------------------------------------------------------------------

export const PLANS = ["trial", "starter", "business", "enterprise"] as const;
export type Plan = (typeof PLANS)[number];

export const PLAN_LABELS: Record<Plan, string> = {
  trial: "Trial",
  starter: "Starter",
  business: "Bisnis",
  enterprise: "Enterprise",
};

export const PLAN_LIMITS: Record<Plan, { maxUsers: number; pricePerMonth: number }> = {
  trial: { maxUsers: 3, pricePerMonth: 0 },
  starter: { maxUsers: 3, pricePerMonth: 149_000 },
  business: { maxUsers: 10, pricePerMonth: 349_000 },
  enterprise: { maxUsers: Number.MAX_SAFE_INTEGER, pricePerMonth: 799_000 },
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

/** Buat perusahaan tambahan untuk pengguna yang sudah login (multi-perusahaan). */
export const createCompanySchema = z.object({
  companyName: z.string().trim().min(2, "Nama perusahaan minimal 2 karakter").max(100),
});
export type CreateCompanyInput = z.infer<typeof createCompanySchema>;

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

/** Ubah peran anggota tim (Owner). "owner" = alih kepemilikan. */
export const updateMemberRoleSchema = z.object({
  role: z.enum(ROLES),
});
export type UpdateMemberRoleInput = z.infer<typeof updateMemberRoleSchema>;

export const acceptInviteSchema = z.object({ token: z.string().min(1) });

export const updateTenantSettingsSchema = z.object({
  displayName: z.string().trim().min(2).max(100).optional(),
  address: z.string().trim().max(500).optional(),
  npwp: z.string().trim().max(30).optional(),
  /**
   * Logo kop faktur/struk: data URL PNG/JPEG/SVG ≤64KB (base64, disimpan di
   * settings DB tenant — tanpa butuh object storage). String kosong = hapus.
   */
  logoDataUrl: z
    .string()
    .max(90_000, "Logo terlalu besar — maksimal ±64KB")
    .refine((v) => v === "" || /^data:image\/(png|jpeg|webp|svg\+xml);base64,/.test(v), "Format logo tidak dikenal")
    .optional(),
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

/** Ganti nama akun saja — kode & tipe terkunci demi integritas laporan historis. */
export const renameAccountSchema = z.object({
  name: z.string().trim().min(2, "Nama akun minimal 2 karakter").max(100),
});

// --- Asisten AI (Workers AI) -------------------------------------------------

export const aiChatSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().trim().min(1).max(2_000),
      }),
    )
    .min(1)
    .max(20),
});
export type AiChatInput = z.infer<typeof aiChatSchema>;

export const aiJurnalSchema = z.object({
  prompt: z.string().trim().min(5, "Tulis deskripsi transaksi, mis. 'bayar listrik 500 ribu dari kas'").max(500),
});
export type AiJurnalInput = z.infer<typeof aiJurnalSchema>;

/** Draf jurnal usulan AI — hanya usulan; manusia yang memposting lewat form Jurnal Umum. */
export type ApiAiJournalDraft = {
  entryDate: string;
  memo: string;
  lines: { accountId: string; accountCode: string; accountName: string; debit: number; credit: number }[];
};

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

// --- Template jurnal berulang & rekonsiliasi bank (Fase 5d) -----------------

export const journalTemplateSchema = z.object({
  name: z.string().trim().min(2, "Nama template minimal 2 karakter").max(100),
  memo: z.string().trim().max(500).optional(),
  lines: z.array(journalLineSchema).min(2, "Template minimal 2 baris"),
  /** 'monthly' = cron memposting otomatis tiap next_run_date; null = manual saja. */
  schedule: z.enum(["monthly"]).nullable().optional(),
  nextRunDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Tanggal tidak valid (YYYY-MM-DD)")
    .optional(),
});
export type JournalTemplateInput = z.infer<typeof journalTemplateSchema>;

export type ApiJournalTemplate = {
  id: string;
  name: string;
  memo: string | null;
  lines: { accountId: string; accountCode: string; accountName: string; debit: number; credit: number }[];
  schedule: "monthly" | null;
  nextRunDate: string | null;
  isActive: boolean;
};

export const bankImportSchema = z.object({
  accountId: z.string().min(1, "Akun wajib dipilih"),
  items: z
    .array(
      z.object({
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Tanggal tidak valid (YYYY-MM-DD)"),
        description: z.string().trim().min(1).max(300),
        /** Rupiah bulat bertanda: + uang masuk, − uang keluar. */
        amount: z
          .number()
          .int()
          .refine((v) => v !== 0, "Jumlah tidak boleh 0"),
      }),
    )
    .min(1, "Tidak ada baris mutasi")
    .max(500, "Maksimal 500 baris per impor"),
});
export type BankImportInput = z.infer<typeof bankImportSchema>;

export type ApiBankStatementItem = {
  id: string;
  stmtDate: string;
  description: string;
  amount: number;
  matchedJournalLineId: string | null;
  matchedEntryNo: string | null;
};

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
  /** Ambang stok menipis (0 = tanpa peringatan): total stok ≤ nilai ini memicu notifikasi. */
  minStock: z.number().int().min(0).max(1_000_000).default(0),
  /** Kode batang (barcode/EAN) untuk pindai di kasir & pencarian cepat. */
  barcode: z.string().trim().max(60).optional().or(z.literal("")),
  /** Satuan besar opsional (mis. "dus") untuk konversi tampilan. */
  uomSecondary: z.string().trim().max(20).optional().or(z.literal("")),
  /** 1 satuan besar = uomFactor satuan dasar (mis. 1 dus = 24 pcs). */
  uomFactor: z.number().int().min(1).max(100_000).default(1),
  /** Produk melacak nomor seri (barang bernilai tinggi/garansi). */
  trackSerial: z.boolean().default(false),
});
export type ProductInput = z.infer<typeof productSchema>;

/** Nomor seri unit (Fase 7c). */
export const serialSchema = z.object({
  serialNo: z.string().trim().min(1, "Nomor seri wajib diisi").max(80),
  note: z.string().trim().max(200).optional().or(z.literal("")),
});
export type SerialInput = z.infer<typeof serialSchema>;
export const SERIAL_STATUSES = ["in_stock", "sold"] as const;
export type SerialStatus = (typeof SERIAL_STATUSES)[number];
export const SERIAL_STATUS_LABELS: Record<SerialStatus, string> = {
  in_stock: "Tersedia",
  sold: "Terjual",
};
export type ApiProductSerial = {
  id: string;
  productId: string;
  serialNo: string;
  status: SerialStatus;
  note: string | null;
  createdAt: string;
};
export const serialStatusSchema = z.object({ status: z.enum(SERIAL_STATUSES) });

/** Usulan pembelian dari titik pesan otomatis (Fase 7c). */
export type ApiReorderSuggestion = {
  productId: string;
  sku: string;
  name: string;
  unit: string;
  minStock: number;
  qty: number;
  shortfall: number;
  suggestedQty: number;
  buyPrice: number;
};

// --- Pajak UMKM (Fase 7d) ---------------------------------------------------
const TAX_PERIOD_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

/** PPh Final UMKM 0,5% (PP 55/2022): setoran per masa (bulan). */
export const pphFinalSchema = z.object({
  period: z.string().regex(TAX_PERIOD_RE, "Masa pajak harus format YYYY-MM"),
  accountId: z.string().min(1, "Pilih akun kas/bank"),
  paidDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Tanggal setor wajib diisi"),
});
export type PphFinalInput = z.infer<typeof pphFinalSchema>;
export type ApiPphFinal = {
  id: string;
  period: string;
  omzet: number;
  rate: number;
  amount: number;
  accountId: string;
  paidDate: string;
  createdAt: string;
};
export type ApiPphFinalPreview = { period: string; omzet: number; rate: number; amount: number; alreadyRecorded: boolean };

/** Objek pemotongan PPh 23 + tarif lazim (%). */
export const PPH23_OBJECTS = [
  { code: "jasa", label: "Jasa (teknik/manajemen/konsultan/lainnya)", rate: 2 },
  { code: "sewa", label: "Sewa & penghasilan lain terkait harta", rate: 2 },
  { code: "royalti", label: "Royalti", rate: 15 },
  { code: "bunga", label: "Bunga", rate: 15 },
  { code: "dividen", label: "Dividen", rate: 15 },
] as const;
export type Pph23ObjectCode = (typeof PPH23_OBJECTS)[number]["code"];
export const PPH23_OBJECT_LABELS: Record<string, string> = Object.fromEntries(PPH23_OBJECTS.map((o) => [o.code, o.label]));

export const pph23Schema = z.object({
  contactId: z.string().min(1, "Pilih rekanan"),
  taxDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Tanggal wajib diisi"),
  objectType: z.enum(PPH23_OBJECTS.map((o) => o.code) as [string, ...string[]]),
  gross: amountSchema.refine((n) => n >= 1, "Dasar pengenaan minimal 1"),
  rate: z.number().min(0).max(100),
  sourceAccountId: z.string().min(1, "Pilih akun sumber (hutang/kas/bank)"),
  note: z.string().trim().max(200).optional().or(z.literal("")),
});
export type Pph23Input = z.infer<typeof pph23Schema>;
export const pph23DepositSchema = z.object({
  accountId: z.string().min(1, "Pilih akun kas/bank"),
  depositDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Tanggal setor wajib diisi"),
});
export type Pph23DepositInput = z.infer<typeof pph23DepositSchema>;
export type ApiPph23 = {
  id: string;
  docNo: string;
  contactId: string;
  contactName: string;
  contactNpwp: string | null;
  taxDate: string;
  objectType: string;
  gross: number;
  rate: number;
  amount: number;
  deposited: boolean;
  note: string | null;
  createdAt: string;
};

/** SPT Masa PPN 1111: rekap keluaran (A) & masukan (B). */
export type ApiSptPpnRow = { docNo: string; date: string; partnerName: string; partnerNpwp: string | null; dpp: number; ppn: number };
export type ApiSptPpn = {
  period: string;
  output: ApiSptPpnRow[];
  input: ApiSptPpnRow[];
  totalOutputDpp: number;
  totalOutputPpn: number;
  totalInputDpp: number;
  totalInputPpn: number;
  net: number;
};

/** Notifikasi operasional (lonceng di topbar) — dihitung on-demand dari data nyata. */
export type ApiNotification = {
  type: "low_stock" | "overdue_invoice" | "open_ticket" | "pending_approval" | "crm_followup_due" | "crm_stale_lead";
  title: string;
  detail: string;
  /** Rute SPA yang dituju saat notifikasi diklik. */
  href: string;
};

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
  /** Tenggat tindak lanjut (opsional) — masuk lonceng notifikasi saat jatuh tempo. */
  dueAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Tanggal tidak valid")
    .optional(),
});
export type LeadActivityInput = z.infer<typeof leadActivitySchema>;

/** Laporan konversi CRM per sumber lead (Fase 5e). */
export type ApiCrmSourceRow = {
  source: string;
  total: number;
  won: number;
  lost: number;
  conversionPct: number;
};

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
  dueAt: string | null;
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
  /** Sisa cuti tahunan (hari) — dipotong saat cuti tahunan disetujui. */
  leaveBalance: number;
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
  /** Total komponen ad-hoc periode ini (bonus/lembur positif, potongan negatif) — sudah termasuk bruto. */
  adjustmentsTotal: number;
  /** Cicilan kasbon yang dipotong dari netto (di luar pajak). */
  loanDeduction: number;
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

/** Komponen gaji ad-hoc satu periode (bonus/lembur positif, potongan negatif) — ikut PPh 21 & BPJS. */
export const payrollAdjustmentSchema = z.object({
  period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Periode harus berformat YYYY-MM"),
  employeeId: z.string().min(1, "Karyawan wajib dipilih"),
  name: z.string().trim().min(2, "Nama komponen minimal 2 karakter").max(100),
  amount: z
    .number()
    .int("Nominal harus bilangan bulat")
    .refine((v) => v !== 0, "Nominal tidak boleh 0")
    .refine((v) => Math.abs(v) <= 1_000_000_000_000, "Nominal terlalu besar"),
});
export type PayrollAdjustmentInput = z.infer<typeof payrollAdjustmentSchema>;

export type ApiPayrollAdjustment = {
  id: string;
  period: string;
  employeeId: string;
  employeeName: string;
  name: string;
  amount: number;
  /** Terisi setelah periode itu digaji — komponen sudah terpakai. */
  runId: string | null;
  createdAt: string;
};

/** Kasbon/pinjaman karyawan: dicairkan dari kas, cicilan otomatis memotong gaji tiap run. */
export const employeeLoanSchema = z
  .object({
    employeeId: z.string().min(1, "Karyawan wajib dipilih"),
    name: z.string().trim().min(2, "Keterangan minimal 2 karakter").max(100),
    principal: amountSchema.refine((v) => v > 0, "Pokok pinjaman harus lebih dari 0"),
    monthlyDeduction: amountSchema.refine((v) => v > 0, "Cicilan per bulan harus lebih dari 0"),
    cashAccountId: z.string().min(1, "Akun kas/bank wajib dipilih"),
    loanDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Tanggal tidak valid"),
  })
  .refine((v) => v.monthlyDeduction <= v.principal, {
    message: "Cicilan per bulan tidak boleh melebihi pokok pinjaman",
    path: ["monthlyDeduction"],
  });
export type EmployeeLoanInput = z.infer<typeof employeeLoanSchema>;

export type ApiEmployeeLoan = {
  id: string;
  employeeId: string;
  employeeName: string;
  name: string;
  principal: number;
  monthlyDeduction: number;
  balance: number;
  status: "active" | "paid";
  journalNo: string | null;
  createdAt: string;
};

export const LEAVE_TYPES = ["annual", "sick", "permit"] as const;
export type LeaveType = (typeof LEAVE_TYPES)[number];

export const leaveRequestSchema = z
  .object({
    employeeId: z.string().min(1, "Karyawan wajib dipilih"),
    type: z.enum(LEAVE_TYPES),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Tanggal tidak valid"),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Tanggal tidak valid"),
    note: z.string().trim().max(300).optional(),
  })
  .refine((v) => v.endDate >= v.startDate, {
    message: "Tanggal selesai tidak boleh sebelum tanggal mulai",
    path: ["endDate"],
  });
export type LeaveRequestInput = z.infer<typeof leaveRequestSchema>;

export const decideLeaveSchema = z.object({
  status: z.enum(["approved", "rejected"]),
});
export type DecideLeaveInput = z.infer<typeof decideLeaveSchema>;

export type ApiLeaveRequest = {
  id: string;
  employeeId: string;
  employeeName: string;
  type: LeaveType;
  startDate: string;
  endDate: string;
  days: number;
  status: "pending" | "approved" | "rejected";
  note: string | null;
  createdAt: string;
};

// --- Absensi/kehadiran (Fase 6b) ---------------------------------------------

export const ATTENDANCE_STATUSES = ["hadir", "izin", "sakit", "alfa", "cuti"] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

export const ATTENDANCE_STATUS_LABELS: Record<AttendanceStatus, string> = {
  hadir: "Hadir",
  izin: "Izin",
  sakit: "Sakit",
  alfa: "Alfa",
  cuti: "Cuti",
};

/** Catat/koreksi kehadiran satu karyawan pada satu tanggal (upsert). */
export const attendanceSchema = z.object({
  employeeId: z.string().min(1, "Karyawan wajib dipilih"),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Tanggal tidak valid"),
  status: z.enum(ATTENDANCE_STATUSES),
  clockIn: z.string().regex(/^\d{2}:\d{2}$/, "Jam tidak valid").optional().or(z.literal("")),
  clockOut: z.string().regex(/^\d{2}:\d{2}$/, "Jam tidak valid").optional().or(z.literal("")),
  note: z.string().trim().max(200).optional(),
});
export type AttendanceInput = z.infer<typeof attendanceSchema>;

export type ApiAttendance = {
  id: string;
  employeeId: string;
  employeeName: string;
  date: string;
  clockIn: string | null;
  clockOut: string | null;
  status: AttendanceStatus;
  note: string | null;
};

/** Rekap bulanan per karyawan: jumlah hari per status. */
export type ApiAttendanceRecap = {
  employeeId: string;
  employeeName: string;
  hadir: number;
  izin: number;
  sakit: number;
  alfa: number;
  cuti: number;
  total: number;
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

export const PROJECT_TASK_PRIORITIES = ["low", "medium", "high"] as const;
export type ProjectTaskPriority = (typeof PROJECT_TASK_PRIORITIES)[number];

export const PROJECT_TASK_PRIORITY_LABELS: Record<ProjectTaskPriority, string> = {
  low: "Rendah",
  medium: "Sedang",
  high: "Tinggi",
};

export const projectTaskSchema = z.object({
  name: z.string().trim().min(1, "Nama tugas wajib diisi").max(200),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  assigneeId: z.string().optional(),
  priority: z.enum(PROJECT_TASK_PRIORITIES).optional(),
});
export type ProjectTaskInput = z.infer<typeof projectTaskSchema>;

export const projectTaskStatusSchema = z.object({ status: z.enum(PROJECT_TASK_STATUSES) });

/** Perbarui tugas: ubah sebagian bidang (status/prioritas/penanggung jawab/tenggat). */
export const projectTaskUpdateSchema = z
  .object({
    status: z.enum(PROJECT_TASK_STATUSES).optional(),
    priority: z.enum(PROJECT_TASK_PRIORITIES).optional(),
    // string kosong / null = kosongkan penanggung jawab
    assigneeId: z.string().nullable().optional(),
    dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, "Tidak ada perubahan");
export type ProjectTaskUpdateInput = z.infer<typeof projectTaskUpdateSchema>;

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
  assigneeId: string | null;
  assigneeName: string | null;
  priority: ProjectTaskPriority;
  sortOrder: number;
};

/** Beban kerja per penanggung jawab: jumlah tugas terbuka (belum selesai). */
export type ApiProjectWorkload = {
  assigneeId: string | null;
  assigneeName: string;
  todo: number;
  inProgress: number;
  done: number;
  openTasks: number;
};

// --- Proyek lanjut (Fase 5g): termin penagihan, RAB, timesheet ---------------

/** Termin penagihan proyek: nama tahap + nominal. */
export const projectMilestoneSchema = z.object({
  name: z.string().trim().min(2, "Nama termin minimal 2 karakter").max(150),
  amount: amountSchema.refine((v) => v > 0, "Nominal termin harus lebih dari 0"),
});
export type ProjectMilestoneInput = z.infer<typeof projectMilestoneSchema>;

/** Buat faktur dari termin: pola faktur jasa (tanpa stok), tertaut proyek. */
export const invoiceMilestoneSchema = z.object({
  invoiceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Tanggal tidak valid"),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  taxRate: z.union([z.literal(0), z.literal(11), z.literal(12)]).default(0),
  warehouseId: z.string().min(1, "Gudang wajib dipilih"),
});
export type InvoiceMilestoneInput = z.infer<typeof invoiceMilestoneSchema>;

/** RAB: baris anggaran biaya per kategori. */
export const projectBudgetSchema = z.object({
  category: z.string().trim().min(2, "Kategori minimal 2 karakter").max(100),
  plannedAmount: amountSchema.refine((v) => v > 0, "Anggaran harus lebih dari 0"),
});
export type ProjectBudgetInput = z.infer<typeof projectBudgetSchema>;

/** Timesheet: jam kerja per karyawan pada proyek (informatif → estimasi biaya tenaga kerja). */
export const timeEntrySchema = z.object({
  employeeId: z.string().optional(),
  entryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Tanggal tidak valid"),
  hours: z.number().positive("Jam harus lebih dari 0").max(24, "Maksimal 24 jam per entri"),
  hourlyRate: amountSchema.default(0),
  note: z.string().trim().max(200).optional(),
});
export type TimeEntryInput = z.infer<typeof timeEntrySchema>;

export type ApiProjectMilestone = {
  id: string;
  name: string;
  amount: number;
  status: "planned" | "invoiced";
  invoiceId: string | null;
  invoiceNo: string | null;
};

export type ApiProjectBudget = {
  id: string;
  category: string;
  plannedAmount: number;
};

export type ApiTimeEntry = {
  id: string;
  employeeId: string | null;
  employeeName: string | null;
  entryDate: string;
  hours: number;
  hourlyRate: number;
  amount: number;
  note: string | null;
};

export type ApiProjectDetail = ApiProject & {
  tasks: ApiProjectTask[];
  /** Beban kerja tugas terbuka per penanggung jawab (urut terbanyak). */
  workload: ApiProjectWorkload[];
  entries: { entryNo: string; entryDate: string; memo: string | null; revenue: number; cost: number }[];
  milestones: ApiProjectMilestone[];
  budgets: ApiProjectBudget[];
  timeEntries: ApiTimeEntry[];
  /** Total anggaran RAB (jumlah planned_amount). */
  plannedCost: number;
  /** Estimasi biaya tenaga kerja dari timesheet (jam × tarif). */
  laborCost: number;
  /** Progres = tugas selesai / total tugas (persen, 0 bila belum ada tugas). */
  progressPct: number;
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
// Manufaktur + QC (Fase 2u)
// ---------------------------------------------------------------------------

/** Simpan/perbarui Bill of Materials (resep) satu produk jadi. */
export const setBomSchema = z.object({
  productId: z.string().min(1),
  outputQty: z.number().int().positive().default(1),
  notes: z.string().trim().max(500).optional(),
  lines: z
    .array(
      z.object({
        componentId: z.string().min(1),
        qty: z.number().int().positive(),
      }),
    )
    .min(1, "Minimal 1 komponen"),
});
export type SetBomInput = z.infer<typeof setBomSchema>;

export const createProductionOrderSchema = z.object({
  productId: z.string().min(1),
  warehouseId: z.string().min(1),
  qty: z.number().int().positive(),
});
export type CreateProductionOrderInput = z.infer<typeof createProductionOrderSchema>;

export const QC_RESULTS = ["passed", "quarantined"] as const;
export type QcResult = (typeof QC_RESULTS)[number];
/** Inspeksi QC: lulus, atau karantina (butuh gudang karantina tujuan). */
export const qcInspectSchema = z.object({
  result: z.enum(QC_RESULTS),
  warehouseId: z.string().min(1).optional(),
});
export type QcInspectInput = z.infer<typeof qcInspectSchema>;

export type ApiBomLine = {
  componentId: string;
  sku: string;
  name: string;
  unit: string;
  qty: number;
};

export type ApiBom = {
  id: string;
  productId: string;
  productSku: string;
  productName: string;
  outputQty: number;
  notes: string | null;
  lines: ApiBomLine[];
};

export const PRODUCTION_STATUSES = ["draft", "produced"] as const;
export type ProductionStatus = (typeof PRODUCTION_STATUSES)[number];
export const QC_STATUSES = ["none", "pending", "passed", "quarantined"] as const;
export type QcStatus = (typeof QC_STATUSES)[number];

export type ApiProductionOrder = {
  id: string;
  orderNo: string;
  productId: string;
  productName: string;
  warehouseId: string;
  warehouseName: string;
  qty: number;
  status: ProductionStatus;
  qcStatus: QcStatus;
  unitCost: number;
  totalCost: number;
  qcWarehouseName: string | null;
  createdAt: string;
  producedAt: string | null;
};

// ---------------------------------------------------------------------------
// Maintenance / servis aset (Fase 2v)
// ---------------------------------------------------------------------------

export const createMaintenanceScheduleSchema = z.object({
  assetId: z.string().min(1),
  name: z.string().trim().min(2, "Nama servis minimal 2 karakter").max(120),
  intervalMonths: z.number().int().min(1).max(120),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Tanggal harus YYYY-MM-DD"),
});
export type CreateMaintenanceScheduleInput = z.infer<typeof createMaintenanceScheduleSchema>;

export const maintenanceScheduleStatusSchema = z.object({ active: z.boolean() });

export const createWorkOrderSchema = z.object({
  assetId: z.string().min(1),
  title: z.string().trim().min(2, "Judul minimal 2 karakter").max(200),
  scheduledDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Tanggal harus YYYY-MM-DD"),
});
export type CreateWorkOrderInput = z.infer<typeof createWorkOrderSchema>;

export const completeWorkOrderSchema = z.object({
  completedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Tanggal harus YYYY-MM-DD"),
  cost: z.number().int().min(0),
  cashAccountId: z.string().optional(),
  notes: z.string().trim().max(500).optional(),
});
export type CompleteWorkOrderInput = z.infer<typeof completeWorkOrderSchema>;

export type ApiMaintenanceSchedule = {
  id: string;
  assetId: string;
  assetName: string;
  name: string;
  intervalMonths: number;
  nextDueDate: string;
  active: boolean;
};

export const WORK_ORDER_STATUSES = ["open", "done"] as const;
export type WorkOrderStatus = (typeof WORK_ORDER_STATUSES)[number];

export type ApiWorkOrder = {
  id: string;
  orderNo: string;
  assetId: string;
  assetName: string;
  scheduleId: string | null;
  title: string;
  status: WorkOrderStatus;
  scheduledDate: string;
  completedDate: string | null;
  cost: number;
  notes: string | null;
  createdAt: string;
};

// ---------------------------------------------------------------------------
// Helpdesk / tiket dukungan (Fase 2w)
// ---------------------------------------------------------------------------

export const TICKET_PRIORITIES = ["low", "medium", "high", "urgent"] as const;
export type TicketPriority = (typeof TICKET_PRIORITIES)[number];
export const TICKET_PRIORITY_LABELS: Record<TicketPriority, string> = {
  low: "Rendah",
  medium: "Sedang",
  high: "Tinggi",
  urgent: "Mendesak",
};

export const TICKET_STATUSES = ["open", "in_progress", "resolved", "closed"] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];
export const TICKET_STATUS_LABELS: Record<TicketStatus, string> = {
  open: "Terbuka",
  in_progress: "Diproses",
  resolved: "Selesai",
  closed: "Ditutup",
};

export const createTicketSchema = z.object({
  contactId: z.string().min(1, "Kontak wajib dipilih"),
  subject: z.string().trim().min(3, "Subjek minimal 3 karakter").max(200),
  description: z.string().trim().max(5000).optional(),
  priority: z.enum(TICKET_PRIORITIES).default("medium"),
});
export type CreateTicketInput = z.infer<typeof createTicketSchema>;

export const updateTicketSchema = z
  .object({
    status: z.enum(TICKET_STATUSES).optional(),
    assignedTo: z.string().nullable().optional(),
  })
  .refine((v) => v.status !== undefined || v.assignedTo !== undefined, {
    message: "Tidak ada perubahan",
  });
export type UpdateTicketInput = z.infer<typeof updateTicketSchema>;

export const ticketReplySchema = z.object({
  body: z.string().trim().min(1, "Balasan tidak boleh kosong").max(5000),
  internal: z.boolean().default(false),
});
export type TicketReplyInput = z.infer<typeof ticketReplySchema>;

export type ApiTicket = {
  id: string;
  ticketNo: string;
  contactId: string;
  contactName: string;
  subject: string;
  description: string | null;
  priority: TicketPriority;
  status: TicketStatus;
  assignedTo: string | null;
  assignedName: string | null;
  createdAt: string;
  resolvedAt: string | null;
  replyCount: number;
};

export type ApiTicketReply = {
  id: string;
  body: string;
  authorName: string;
  internal: boolean;
  createdAt: string;
};

export type ApiTicketDetail = ApiTicket & { replies: ApiTicketReply[] };

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
