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
 * Fase 13a: pemaketan 4 tingkat. Harga per bulan per perusahaan; pengguna
 * SELALU tak terbatas di semua paket (pembeda utama vs ERP per-user). Tier
 * dibedakan oleh kedalaman operasional, jumlah entitas, dan kuota AI — TIDAK
 * PERNAH oleh jumlah user, dan TIDAK memotong akuntansi inti. Trial = akses
 * penuh 30 hari (rasa Enterprise) untuk konversi terbaik.
 *
 * SEMUA nilai keputusan bisnis terpusat di sini — menggeser modul antar paket
 * cukup mengubah satu baris di MODULE_MIN_PLAN.
 */
export const PLAN_LIMITS: Record<
  Plan,
  { label: string; pricePerMonth: number; aiDailyLimit: number; maxEntities: number; maxUsers: number }
> = {
  trial: { label: "Trial", pricePerMonth: 0, aiDailyLimit: 100, maxEntities: 1, maxUsers: Number.MAX_SAFE_INTEGER },
  starter: { label: "Starter", pricePerMonth: 499_000, aiDailyLimit: 25, maxEntities: 1, maxUsers: Number.MAX_SAFE_INTEGER },
  business: { label: "Business", pricePerMonth: 999_000, aiDailyLimit: 100, maxEntities: 1, maxUsers: Number.MAX_SAFE_INTEGER },
  enterprise: { label: "Enterprise", pricePerMonth: 2_499_000, aiDailyLimit: 250, maxEntities: 3, maxUsers: Number.MAX_SAFE_INTEGER },
};

/** Biaya per entitas tambahan di atas kuota paket Enterprise (Fase 13a). */
export const EXTRA_ENTITY_PRICE = 750_000;

export const PLAN_LABELS: Record<Plan, string> = {
  trial: PLAN_LIMITS.trial.label,
  starter: PLAN_LIMITS.starter.label,
  business: PLAN_LIMITS.business.label,
  enterprise: PLAN_LIMITS.enterprise.label,
};

/** Paket berbayar yang bisa dibeli (trial tidak dijual). */
export const PAID_PLANS = ["starter", "business", "enterprise"] as const;
export type PaidPlan = (typeof PAID_PLANS)[number];

/**
 * Alias kompatibilitas (deprecated): billing lama memakai satu harga Rp389rb.
 * Dipertahankan agar billing.ts belum berubah di Fase 13a; billing 4 paket
 * (Fase 13b) mengganti pemakaiannya dengan harga per-paket dari PLAN_LIMITS.
 */
export const SINGLE_PLAN = { label: "Lengkap", pricePerMonth: 389_000 } as const;

// ---------------------------------------------------------------------------
// Peta modul → paket minimum (Fase 13a). Modul yang TIDAK terdaftar di sini
// termasuk INTI dan tersedia di semua paket (akuntansi, penjualan/pembelian,
// POS, stok, kas & bank, laporan, pajak, master data). Yang terdaftar butuh
// paket minimal tertentu; di bawahnya API menolak 403 `plan-upgrade-required`.
// ---------------------------------------------------------------------------
export const MODULE_KEYS = [
  // Operasional — minimal Business
  "payroll",
  "attendance",
  "manufacturing",
  "projects",
  "procurement",
  "approvals",
  "customRoles",
  "crm",
  "maintenance",
  "helpdesk",
  "salesStaged",
  "currency",
  "contracts",
  "scheduledReports",
  "driveBackup",
  "orgStructure",
  // Skala — minimal Enterprise
  "consolidation",
  "dimensions",
  "apiAccess",
  "advancedSecurity",
] as const;
export type ModuleKey = (typeof MODULE_KEYS)[number];

export const MODULE_MIN_PLAN: Record<ModuleKey, Plan> = {
  payroll: "business",
  attendance: "business",
  manufacturing: "business",
  projects: "business",
  procurement: "business",
  approvals: "business",
  customRoles: "business",
  crm: "business",
  maintenance: "business",
  helpdesk: "business",
  salesStaged: "business",
  currency: "business",
  contracts: "business",
  scheduledReports: "business",
  driveBackup: "business",
  orgStructure: "business",
  consolidation: "enterprise",
  dimensions: "enterprise",
  apiAccess: "enterprise",
  advancedSecurity: "enterprise",
};

export const MODULE_LABELS: Record<ModuleKey, string> = {
  payroll: "HR & Penggajian",
  attendance: "Absensi",
  manufacturing: "Manufaktur",
  projects: "Proyek",
  procurement: "Pengadaan",
  approvals: "Persetujuan berjenjang",
  customRoles: "Peran kustom (RBAC)",
  crm: "CRM",
  maintenance: "Pemeliharaan aset",
  helpdesk: "Helpdesk",
  salesStaged: "Penjualan bertahap (SO/DO)",
  currency: "Multi mata uang",
  contracts: "Kontrak berulang",
  scheduledReports: "Laporan terjadwal",
  driveBackup: "Backup Google Drive",
  orgStructure: "Struktur organisasi",
  consolidation: "Konsolidasi multi-perusahaan",
  dimensions: "Dimensi / cost center",
  apiAccess: "API publik & webhook",
  advancedSecurity: "Keamanan lanjutan (2FA wajib, IP)",
};

/**
 * Peringkat akses paket. Trial disamakan dengan Enterprise (akses penuh 30 hari).
 * Bukan urutan harga — melainkan urutan cakupan fitur.
 */
const PLAN_ACCESS_RANK: Record<Plan, number> = { starter: 1, business: 2, enterprise: 3, trial: 3 };

/** Apakah paket mencakup modul tertentu. Modul inti (tak terdaftar) selalu true. */
export function planIncludesModule(plan: Plan, module: ModuleKey): boolean {
  const min = MODULE_MIN_PLAN[module];
  if (!min) return true;
  return PLAN_ACCESS_RANK[plan] >= PLAN_ACCESS_RANK[min];
}

/** Paket berbayar minimum yang membuka modul (untuk pesan upsell). */
export function minPlanForModule(module: ModuleKey): Plan {
  return MODULE_MIN_PLAN[module] ?? "starter";
}

/** Daftar modul yang tersedia pada suatu paket (dipakai UI untuk badge/upsell). */
export function modulesForPlan(plan: Plan): ModuleKey[] {
  return MODULE_KEYS.filter((m) => planIncludesModule(plan, m));
}

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
  /** Harga paket saat ini (0 bila trial). Katalog paket dibaca UI dari PLAN_LIMITS. */
  pricePerMonth: number;
  /** Grandfather: pelanggan lama harga tunggal → akses penuh walau paketnya starter/business. */
  legacyFullAccess: boolean;
  invoices: ApiSubscriptionInvoice[];
};

/** Pilih paket berbayar yang akan di-checkout (Fase 13b). */
export const checkoutSchema = z.object({
  plan: z.enum(PAID_PLANS),
});
export type CheckoutInput = z.infer<typeof checkoutSchema>;

/** Set paket tenant manual oleh platform admin (Fase 13b). */
export const setTenantPlanSchema = z.object({
  plan: z.enum(PLANS),
  status: z.enum(["trial", "active", "past_due", "suspended", "provisioning"]).optional(),
  legacyFullAccess: z.boolean().optional(),
});
export type SetTenantPlanInput = z.infer<typeof setTenantPlanSchema>;

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

