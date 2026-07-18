import { z } from "zod";
import { PTKP_STATUSES, type PtkpStatus } from "./payroll";
import { amountSchema } from "./accounting";

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
  /** Struktur organisasi (Fase 8c) — opsional, kompatibel mundur. */
  departmentId: z.string().optional(),
  managerId: z.string().optional(),
});
export type EmployeeInput = z.infer<typeof employeeSchema>;

/** Departemen (Fase 8c) — hierarki via parentId. */
export const departmentSchema = z.object({
  code: z.string().trim().min(1, "Kode wajib diisi").max(20),
  name: z.string().trim().min(2, "Nama minimal 2 karakter").max(100),
  parentId: z.string().optional(),
});
export type DepartmentInput = z.infer<typeof departmentSchema>;

export type ApiDepartment = {
  id: string;
  code: string;
  name: string;
  parentId: string | null;
  parentName: string | null;
  employeeCount: number;
};

/** Simpul bagan organisasi: departemen + karyawan di dalamnya + sub-departemen. */
export type ApiOrgNode = {
  id: string;
  code: string;
  name: string;
  employees: { id: string; name: string; position: string | null; managerName: string | null }[];
  children: ApiOrgNode[];
};

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
  /** Struktur organisasi (Fase 8c). */
  departmentId: string | null;
  departmentName: string | null;
  managerId: string | null;
  managerName: string | null;
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
  /** Fase 10c: terisi bila run sudah dibatalkan (jurnal terbalik, kasbon pulih). */
  voidedAt?: string | null;
  voidJournalNo?: string | null;
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

