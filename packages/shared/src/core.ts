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

// ---------------------------------------------------------------------------
// RBAC granular (Fase 7e): izin per modul. ADDITIVE — Owner/Admin/Viewer tetap
// preset yang memetakan ke set izin; requireTenantRole lama tetap menegakkan
// baca/tulis per level, izin modul mengatur AKSES modul (visibilitas + gate).
// ---------------------------------------------------------------------------
export const PERMISSIONS = [
  { key: "penjualan", label: "Penjualan & Pesanan" },
  { key: "pembelian", label: "Pembelian & Pengadaan" },
  { key: "kasir", label: "Kasir (POS)" },
  { key: "stok", label: "Stok & Produk" },
  { key: "keuangan", label: "Keuangan & Akuntansi" },
  { key: "pajak", label: "Pajak" },
  { key: "laporan", label: "Laporan" },
  { key: "hr", label: "HR & Penggajian" },
  { key: "proyek", label: "Proyek & operasi" },
  { key: "crm", label: "CRM & Penawaran" },
  { key: "persetujuan", label: "Persetujuan" },
  { key: "pengaturan", label: "Pengaturan perusahaan" },
  { key: "pengguna", label: "Kelola pengguna & peran" },
] as const;
export type PermissionKey = (typeof PERMISSIONS)[number]["key"];
export const PERMISSION_KEYS = PERMISSIONS.map((p) => p.key) as PermissionKey[];
export const PERMISSION_LABELS: Record<string, string> = Object.fromEntries(PERMISSIONS.map((p) => [p.key, p.label]));

/** Peta preset peran → izin modul. Owner = semua; Admin = semua kecuali kelola pengguna;
 *  Viewer = semua modul terlihat (baca-saja ditegakkan oleh requireTenantRole). */
export const PRESET_PERMISSIONS: Record<Role, PermissionKey[]> = {
  owner: [...PERMISSION_KEYS],
  admin: PERMISSION_KEYS.filter((k) => k !== "pengguna"),
  viewer: [...PERMISSION_KEYS],
};

/** Peran kustom: nama + preset dasar (untuk kompatibilitas requireTenantRole) + izin modul. */
export const customRoleSchema = z.object({
  name: z.string().trim().min(2, "Nama peran minimal 2 karakter").max(40),
  baseRole: z.enum(["admin", "viewer"]),
  permissions: z.array(z.enum(PERMISSION_KEYS as [PermissionKey, ...PermissionKey[]])).min(1, "Pilih minimal satu modul"),
  /** RBAC berdimensi (Fase 8d): batasi data ke cost center tertentu. Kosong/absen = semua. */
  scopeCostCenterIds: z.array(z.string()).max(20, "Maksimal 20 cost center").optional(),
});
export type CustomRoleInput = z.infer<typeof customRoleSchema>;
export type ApiCustomRole = {
  id: string;
  name: string;
  baseRole: "admin" | "viewer";
  permissions: PermissionKey[];
  /** null = tanpa batasan dimensi (perilaku lama). */
  scopeCostCenterIds: string[] | null;
  memberCount: number;
  createdAt: string;
};
/** Penetapan peran anggota: preset (owner/admin/viewer) ATAU peran kustom. */
export const assignRoleSchema = z
  .object({
    preset: z.enum(ROLES).optional(),
    customRoleId: z.string().optional(),
  })
  .refine((v) => Boolean(v.preset) !== Boolean(v.customRoleId), "Pilih preset ATAU peran kustom (salah satu).");
export type AssignRoleInput = z.infer<typeof assignRoleSchema>;
export type ApiMyPermissions = {
  role: Role;
  roleName: string;
  permissions: PermissionKey[];
  /** RBAC berdimensi (Fase 8d): null = akses semua cost center. */
  scopeCostCenterIds?: string[] | null;
};

// --- Akuntansi dimensi + rekonsiliasi v2 (Fase 7f) --------------------------
export const costCenterSchema = z.object({
  code: z.string().trim().min(1, "Kode wajib diisi").max(20),
  name: z.string().trim().min(2, "Nama minimal 2 karakter").max(80),
});
export type CostCenterInput = z.infer<typeof costCenterSchema>;
export type ApiCostCenter = { id: string; code: string; name: string; createdAt: string };
/** Ringkasan laba/rugi per dimensi (cost center) suatu periode. */
export type ApiDimensionRow = { costCenterId: string | null; code: string; name: string; income: number; expense: number; net: number };
export type ApiDimensionReport = { from: string; to: string; rows: ApiDimensionRow[] };

/** Aturan auto-match rekonsiliasi bank v2: kata kunci deskripsi + toleransi hari. */
export const bankMatchRuleSchema = z.object({
  accountId: z.string().min(1, "Pilih akun bank"),
  keyword: z.string().trim().min(1, "Kata kunci wajib diisi").max(60),
  dateTolerance: z.number().int().min(0).max(14).default(3),
});
export type BankMatchRuleInput = z.infer<typeof bankMatchRuleSchema>;
export type ApiBankMatchRule = { id: string; accountId: string; keyword: string; dateTolerance: number; active: boolean; createdAt: string };

/** Preset pemetaan kolom CSV rekening koran bank besar (Fase 7f). */
export const BANK_CSV_PRESETS = [
  { code: "generic", label: "Umum (tanggal, keterangan, jumlah)", dateCol: "tanggal", descCol: "keterangan", debitCol: "", creditCol: "", amountCol: "jumlah", dateFormat: "YYYY-MM-DD" },
  { code: "bca", label: "BCA (mutasi rekening)", dateCol: "Tanggal", descCol: "Keterangan", debitCol: "Mutasi DB", creditCol: "Mutasi CR", amountCol: "", dateFormat: "DD/MM" },
  { code: "mandiri", label: "Mandiri (rekening koran)", dateCol: "Tanggal Transaksi", descCol: "Uraian", debitCol: "Debet", creditCol: "Kredit", amountCol: "", dateFormat: "DD/MM/YYYY" },
  { code: "bri", label: "BRI (mutasi)", dateCol: "Tanggal", descCol: "Uraian Transaksi", debitCol: "Debet", creditCol: "Kredit", amountCol: "", dateFormat: "DD-MM-YYYY" },
] as const;

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

/**
 * Fase 10b: satu harga untuk semua — paket "Lengkap" Rp389.000/bulan berisi
 * SELURUH fitur tanpa batas pengguna. Nilai enum kolom `plan` lama TIDAK
 * diubah (aman untuk data yang sudah ada); semua nilai berbayar kini dilabeli
 * dan dihargai sama.
 */
export const SINGLE_PLAN = { label: "Lengkap", pricePerMonth: 389_000 } as const;

export const PLAN_LABELS: Record<Plan, string> = {
  trial: "Trial",
  starter: SINGLE_PLAN.label,
  business: SINGLE_PLAN.label,
  enterprise: SINGLE_PLAN.label,
};

export const PLAN_LIMITS: Record<Plan, { maxUsers: number; pricePerMonth: number }> = {
  trial: { maxUsers: Number.MAX_SAFE_INTEGER, pricePerMonth: 0 },
  starter: { maxUsers: Number.MAX_SAFE_INTEGER, pricePerMonth: SINGLE_PLAN.pricePerMonth },
  business: { maxUsers: Number.MAX_SAFE_INTEGER, pricePerMonth: SINGLE_PLAN.pricePerMonth },
  enterprise: { maxUsers: Number.MAX_SAFE_INTEGER, pricePerMonth: SINGLE_PLAN.pricePerMonth },
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
  /** true hanya pada sesi akun demo publik baca-saja (Fase 10b). */
  isDemo?: boolean;
  /** true bila email ada di PLATFORM_ADMIN_EMAILS (Fase 10e) — menampilkan menu Admin. */
  isPlatformAdmin?: boolean;
};

export type ApiMembership = {
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  tenantStatus: TenantStatus;
  role: Role;
  plan: Plan;
  trialEndsAt: string | null;
  /** Tanggal langganan berakhir (Fase 11b); NULL untuk trial/comped. */
  subscriptionEndsAt?: string | null;
};

// --- Billing langganan (Fase 11b) ------------------------------------------
export type ApiSubscriptionInvoice = {
  id: string;
  orderId: string;
  amount: number;
  periodMonths: number;
  status: "pending" | "paid" | "failed" | "expired";
  transactionStatus: string | null;
  paidAt: string | null;
  createdAt: string;
};

export type BillingStatus = {
  /** true bila server key Midtrans terpasang → checkout aktif. */
  configured: boolean;
  plan: Plan;
  status: TenantStatus;
  trialEndsAt: string | null;
  subscriptionEndsAt: string | null;
  pricePerMonth: number;
  invoices: ApiSubscriptionInvoice[];
};

// --- Payment collection + WhatsApp share (Fase 11d) ------------------------
export type ApiPaymentLink = {
  orderId: string;
  amount: number;
  status: "pending" | "paid" | "expired" | "failed";
  redirectUrl: string | null;
  paidAt: string | null;
  createdAt: string;
};

/**
 * Bangun tautan WhatsApp klik-untuk-kirim (wa.me) — TANPA API/kunci, langsung
 * bekerja. Menormalkan nomor Indonesia (0812… → 62812…). Mengembalikan null
 * bila nomor tidak memadai (pemanggil bisa fallback ke wa.me tanpa nomor).
 */
export function waLink(phone: string | null | undefined, text: string): string | null {
  if (!phone) return null;
  let p = phone.replace(/[^0-9]/g, "");
  if (p.startsWith("620")) p = "62" + p.slice(3);
  else if (p.startsWith("0")) p = "62" + p.slice(1);
  else if (!p.startsWith("62")) p = "62" + p;
  if (p.length < 9) return null;
  return `https://wa.me/${p}?text=${encodeURIComponent(text)}`;
}

export type MeResponse = {
  user: ApiUser;
  memberships: ApiMembership[];
};

export type ApiMember = {
  userId: string;
  name: string;
  email: string;
  role: Role;
  customRoleId: string | null;
  roleName: string | null;
  joinedAt: string;
};

export type ApiError = { error: string; issues?: Record<string, string[]> };

