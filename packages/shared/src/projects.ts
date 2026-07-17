import { z } from "zod";
import { amountSchema } from "./accounting";
import { TAX_RATES } from "./commerce";

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

const dateOpt = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const projectTaskSchema = z.object({
  name: z.string().trim().min(1, "Nama tugas wajib diisi").max(200),
  dueDate: dateOpt.optional(),
  assigneeId: z.string().optional(),
  priority: z.enum(PROJECT_TASK_PRIORITIES).optional(),
  // Jadwal Gantt (Fase 7g): mulai/selesai + dependensi (predecessor).
  startDate: dateOpt.optional(),
  endDate: dateOpt.optional(),
  predecessorId: z.string().optional(),
});
export type ProjectTaskInput = z.infer<typeof projectTaskSchema>;

export const projectTaskStatusSchema = z.object({ status: z.enum(PROJECT_TASK_STATUSES) });

/** Perbarui tugas: ubah sebagian bidang (status/prioritas/penanggung jawab/tenggat/jadwal). */
export const projectTaskUpdateSchema = z
  .object({
    status: z.enum(PROJECT_TASK_STATUSES).optional(),
    priority: z.enum(PROJECT_TASK_PRIORITIES).optional(),
    // string kosong / null = kosongkan penanggung jawab
    assigneeId: z.string().nullable().optional(),
    dueDate: dateOpt.nullable().optional(),
    startDate: dateOpt.nullable().optional(),
    endDate: dateOpt.nullable().optional(),
    predecessorId: z.string().nullable().optional(),
    // Simpan baseline (rencana) = jadwal saat ini.
    setBaseline: z.boolean().optional(),
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
  startDate: string | null;
  endDate: string | null;
  predecessorId: string | null;
  baselineStart: string | null;
  baselineEnd: string | null;
};

// --- Manufaktur: work center + routing (Fase 7g) ----------------------------
export const workCenterSchema = z.object({
  code: z.string().trim().min(1, "Kode wajib diisi").max(20),
  name: z.string().trim().min(2, "Nama minimal 2 karakter").max(80),
  hourlyRate: amountSchema.default(0),
});
export type WorkCenterInput = z.infer<typeof workCenterSchema>;
export type ApiWorkCenter = { id: string; code: string; name: string; hourlyRate: number; createdAt: string };

export const routingStepSchema = z.object({
  workCenterId: z.string().min(1, "Pilih work center"),
  name: z.string().trim().min(1, "Nama tahap wajib diisi").max(120),
  standardCost: amountSchema.default(0),
});
export type RoutingStepInput = z.infer<typeof routingStepSchema>;
export const routingActualSchema = z.object({ actualCost: amountSchema });
export type RoutingActualInput = z.infer<typeof routingActualSchema>;
export type ApiRoutingStep = {
  id: string;
  productionId: string;
  workCenterId: string;
  workCenterName: string;
  stepOrder: number;
  name: string;
  standardCost: number;
  actualCost: number | null;
  status: "pending" | "done";
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

