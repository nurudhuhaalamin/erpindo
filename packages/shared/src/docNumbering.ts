import { z } from "zod";

/**
 * Kustomisasi format nomor dokumen (Fase 13i). Tiap perusahaan bisa menetapkan
 * pola nomor per jenis dokumen (faktur jual/beli, pembayaran) memakai token —
 * mis. `INV-{YYYY}{MM}-{SEQ:4}` → `INV-202607-0001`. Tanpa pola tersimpan,
 * sistem memakai penomoran lama (`PREFIX-00001`) — jadi bersifat opt-in & aman
 * untuk perusahaan yang sudah berjalan.
 *
 * Token yang didukung:
 *  {YYYY} tahun 4 digit · {YY} 2 digit · {MM} bulan · {DD} tanggal ·
 *  {SEQ} nomor urut (default 5 digit) · {SEQ:n} nomor urut dipad n digit.
 *
 * Urutan di-scope pada bagian pola SEBELUM {SEQ}: bila pola memuat {YYYY}/{MM},
 * urutan otomatis reset tiap periode itu; tanpa token periode → urutan menerus.
 */

export const DOC_TYPES = [
  { key: "invoice", label: "Faktur penjualan", example: "INV-{YYYY}{MM}-{SEQ:4}" },
  { key: "purchase", label: "Faktur pembelian", example: "PB-{YYYY}{MM}-{SEQ:4}" },
  { key: "payment", label: "Pembayaran", example: "PAY-{YYYY}-{SEQ:5}" },
] as const;
export type DocType = (typeof DOC_TYPES)[number]["key"];
export const DOC_TYPE_KEYS = DOC_TYPES.map((d) => d.key) as DocType[];

/** Karakter yang diizinkan dalam pola (literal + token). */
const PATTERN_ALLOWED = /^[A-Za-z0-9/_{}:.-]+$/;

/** Apakah pola nomor dokumen valid (memuat {SEQ}, karakter aman, ≤ 40 char). */
export function isValidDocPattern(pattern: string): boolean {
  const p = pattern.trim();
  if (p.length === 0 || p.length > 40) return false;
  if (!PATTERN_ALLOWED.test(p)) return false;
  if (!/\{SEQ(:\d{1,2})?\}/.test(p)) return false;
  return true;
}

export const docNumberingSchema = z.object({
  invoice: z.string().trim().refine(isValidDocPattern, "Pola faktur harus memuat {SEQ}").optional(),
  purchase: z.string().trim().refine(isValidDocPattern, "Pola pembelian harus memuat {SEQ}").optional(),
  payment: z.string().trim().refine(isValidDocPattern, "Pola pembayaran harus memuat {SEQ}").optional(),
});
export type DocNumberingInput = z.infer<typeof docNumberingSchema>;
export type ApiDocNumbering = { invoice?: string; purchase?: string; payment?: string };

function pad(n: number, len: number): string {
  return String(n).padStart(len, "0");
}

/** Ambil bagian tanggal dari string ISO "YYYY-MM-DD…" (bebas zona waktu). */
function dateParts(dateISO: string): { yyyy: string; yy: string; mm: string; dd: string } {
  const yyyy = dateISO.slice(0, 4);
  return { yyyy, yy: yyyy.slice(2), mm: dateISO.slice(5, 7), dd: dateISO.slice(8, 10) };
}

function resolveDateTokens(s: string, dateISO: string): string {
  const p = dateParts(dateISO);
  return s
    .replace(/\{YYYY\}/g, p.yyyy)
    .replace(/\{YY\}/g, p.yy)
    .replace(/\{MM\}/g, p.mm)
    .replace(/\{DD\}/g, p.dd);
}

/** Render nomor dokumen lengkap dari pola, tanggal (ISO), dan nomor urut. */
export function renderDocNumber(pattern: string, dateISO: string, seq: number): string {
  const withDate = resolveDateTokens(pattern, dateISO);
  return withDate.replace(/\{SEQ(?::(\d{1,2}))?\}/g, (_m, n) => pad(seq, n ? Number(n) : 5));
}

/**
 * Bagian pola SEBELUM {SEQ} dengan token tanggal sudah diisi — dipakai untuk
 * menghitung urutan ber-scope (cari nomor yang berawalan ini di tabel).
 */
export function docNumberScopePrefix(pattern: string, dateISO: string): string {
  const idx = pattern.indexOf("{SEQ");
  const head = idx >= 0 ? pattern.slice(0, idx) : pattern;
  return resolveDateTokens(head, dateISO);
}
