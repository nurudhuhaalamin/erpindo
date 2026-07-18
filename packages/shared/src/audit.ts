import { z } from "zod";

// ---------------------------------------------------------------------------
// Fase 9a: skema untuk input yang sebelumnya divalidasi manual (audit).
// ---------------------------------------------------------------------------

/** Ambang persetujuan pembelian (0 = nonaktif). */
export const approvalThresholdSchema = z.object({
  amount: z.number().int("Nominal harus bilangan bulat").min(0, "Nominal tidak boleh negatif").max(1_000_000_000_000),
});
export type ApprovalThresholdInput = z.infer<typeof approvalThresholdSchema>;

/** Catatan keputusan (tolak permintaan persetujuan). */
export const decisionNoteSchema = z.object({
  note: z.string().max(300, "Catatan maksimal 300 karakter").optional(),
});
export type DecisionNoteInput = z.infer<typeof decisionNoteSchema>;

/** Pemicu manual penerbitan work order servis. */
export const maintenanceRunSchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Tanggal tidak valid (YYYY-MM-DD)")
    .optional(),
});
export type MaintenanceRunInput = z.infer<typeof maintenanceRunSchema>;

/** Amplop impor batch master data (isi baris divalidasi per skema entitas). */
export const importRowsSchema = z.object({
  rows: z
    .array(z.unknown(), {
      required_error: "Tidak ada baris untuk diimpor.",
      invalid_type_error: "Tidak ada baris untuk diimpor.",
    })
    .min(1, "Tidak ada baris untuk diimpor.")
    .max(500, "Maksimal 500 baris per impor — pecah file Anda."),
});
export type ImportRowsInput = z.infer<typeof importRowsSchema>;

