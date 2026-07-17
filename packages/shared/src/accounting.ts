import { z } from "zod";
import { emailSchema } from "./core";

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

/** Tanya-jawab laporan bahasa natural (Fase 11c) — dijawab dari data buku nyata (read-only). */
export const aiReportSchema = z.object({
  question: z.string().trim().min(3, "Tulis pertanyaan, mis. 'berapa laba bulan ini?'").max(500),
});
export type AiReportInput = z.infer<typeof aiReportSchema>;

/** Draf jurnal usulan AI — hanya usulan; manusia yang memposting lewat form Jurnal Umum. */
export type ApiAiJournalDraft = {
  entryDate: string;
  memo: string;
  lines: { accountId: string; accountCode: string; accountName: string; debit: number; credit: number }[];
};

/** Nominal rupiah bulat non-negatif (IDR tanpa sen), maksimal 1 triliun. */
export const amountSchema = z.number().int("Nominal harus bilangan bulat").min(0).max(1_000_000_000_000);

export const journalLineSchema = z.object({
  accountId: z.string().min(1, "Akun wajib dipilih"),
  description: z.string().trim().max(200).optional(),
  debit: amountSchema.default(0),
  credit: amountSchema.default(0),
  /** Dimensi opsional (Fase 7f): cost center / departemen per baris. */
  costCenterId: z.string().optional(),
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
  /** Fase 10c: nomor jurnal pembalik bila jurnal ini sudah dibalik. */
  reversedByEntryNo?: string | null;
  /** Fase 10c: nomor jurnal asal bila jurnal ini adalah pembalik. */
  reversesEntryNo?: string | null;
};

/** Fase 10c: balik jurnal / void pembayaran — tanggal opsional (default tanggal asal). */
export const reverseJournalSchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Tanggal tidak valid (YYYY-MM-DD)")
    .optional(),
});
export type ReverseJournalInput = z.infer<typeof reverseJournalSchema>;

export type ApiTrialBalanceRow = {
  accountId: string;
  code: string;
  name: string;
  type: AccountType;
  debit: number;
  credit: number;
};

