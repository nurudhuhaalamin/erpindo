import { z } from "zod";

/**
 * Field kustom per modul (Fase 20j).
 *
 * Pemilik menambahkan kolom sendiri pada Kontak, Produk, dan Faktur — tampil di
 * form, ikut tercetak, dan ikut terekspor.
 */

/** Modul yang bisa diberi field kustom. */
export const CUSTOM_FIELD_MODULES = ["contact", "product", "invoice"] as const;
export type CustomFieldModule = (typeof CUSTOM_FIELD_MODULES)[number];

/**
 * Tipe yang didukung, sengaja dibatasi empat.
 *
 * Tiap tipe menambah satu jalur validasi, satu kontrol form, satu aturan
 * konversi ekspor, dan satu cara gagal. Membuka tipe bebas berarti menambah
 * jalur yang tak satu pun gerbang bisa menguji.
 */
export const CUSTOM_FIELD_TYPES = ["teks", "angka", "tanggal", "pilihan"] as const;
export type CustomFieldType = (typeof CUSTOM_FIELD_TYPES)[number];

export const CUSTOM_FIELD_MODULE_LABELS: Record<CustomFieldModule, string> = {
  contact: "Kontak",
  product: "Produk",
  invoice: "Faktur penjualan",
};

export const CUSTOM_FIELD_TYPE_LABELS: Record<CustomFieldType, string> = {
  teks: "Teks",
  angka: "Angka",
  tanggal: "Tanggal",
  pilihan: "Pilihan",
};

/** Kunci field: dipakai sebagai judul kolom ekspor, jadi dibatasi aman. */
const FIELD_KEY_RE = /^[a-z][a-z0-9_]{1,29}$/;

export const customFieldDefSchema = z
  .object({
    module: z.enum(CUSTOM_FIELD_MODULES),
    fieldKey: z
      .string()
      .trim()
      .regex(FIELD_KEY_RE, "Kunci hanya huruf kecil, angka, dan garis bawah (mulai dengan huruf)"),
    label: z.string().trim().min(2, "Label minimal 2 karakter").max(60),
    type: z.enum(CUSTOM_FIELD_TYPES),
    /** Hanya untuk tipe `pilihan`. */
    options: z.array(z.string().trim().min(1)).max(30, "Maksimal 30 pilihan").optional(),
    required: z.boolean().default(false),
    sortOrder: z.number().int().min(0).max(999).default(0),
  })
  // Tipe `pilihan` tanpa daftar pilihan menghasilkan dropdown kosong yang tidak
  // bisa diisi — dan field wajib yang mustahil diisi mengunci seluruh form.
  .refine((v) => v.type !== "pilihan" || (v.options?.length ?? 0) > 0, {
    message: "Tipe 'pilihan' wajib punya minimal satu pilihan.",
    path: ["options"],
  });
export type CustomFieldDefInput = z.infer<typeof customFieldDefSchema>;

export type ApiCustomFieldDef = {
  id: string;
  module: CustomFieldModule;
  fieldKey: string;
  label: string;
  type: CustomFieldType;
  options: string[] | null;
  required: boolean;
  sortOrder: number;
  createdAt: string;
};

/** Nilai field kustom pada satu dokumen/record. */
export type ApiCustomFieldValue = {
  defId: string;
  fieldKey: string;
  label: string;
  type: CustomFieldType;
  value: string;
};

/** Peta `fieldKey → nilai` yang dikirim bersama dokumen/master data. */
export const customFieldValuesSchema = z.record(z.string(), z.string().max(500)).optional();
export type CustomFieldValuesInput = z.infer<typeof customFieldValuesSchema>;

export type ValidasiFieldKustom = { ok: true } | { ok: false; pesan: string };

/**
 * Periksa nilai terhadap definisinya.
 *
 * Fungsi murni, dipakai **server dan web dari satu tempat** — layar yang
 * menerima nilai lalu ditolak server (atau sebaliknya) adalah cacat yang hanya
 * muncul di tangan pengguna.
 */
export function validasiNilaiKustom(
  defs: Pick<ApiCustomFieldDef, "fieldKey" | "label" | "type" | "options" | "required">[],
  nilai: Record<string, string> | undefined,
): ValidasiFieldKustom {
  const isi = nilai ?? {};
  for (const def of defs) {
    const v = (isi[def.fieldKey] ?? "").trim();

    if (!v) {
      if (def.required) return { ok: false, pesan: `"${def.label}" wajib diisi.` };
      continue;
    }

    if (def.type === "angka" && !/^-?\d+(\.\d+)?$/.test(v)) {
      return { ok: false, pesan: `"${def.label}" harus berupa angka.` };
    }
    if (def.type === "tanggal" && !/^\d{4}-\d{2}-\d{2}$/.test(v)) {
      return { ok: false, pesan: `"${def.label}" harus tanggal berformat YYYY-MM-DD.` };
    }
    if (def.type === "pilihan" && !(def.options ?? []).includes(v)) {
      return { ok: false, pesan: `"${def.label}" harus salah satu pilihan yang tersedia.` };
    }
  }

  // Nilai untuk kunci yang tidak dikenal DITOLAK, bukan diabaikan diam-diam.
  // Mengabaikannya berarti salah ketik kunci menghasilkan data yang tampak
  // tersimpan di layar tetapi tidak pernah ada.
  const dikenal = new Set(defs.map((d) => d.fieldKey));
  for (const kunci of Object.keys(isi)) {
    if (!dikenal.has(kunci)) {
      return { ok: false, pesan: `Field kustom "${kunci}" tidak dikenal.` };
    }
  }

  return { ok: true };
}
