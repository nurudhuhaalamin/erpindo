import {
  validasiNilaiKustom,
  type ApiCustomFieldDef,
  type ApiCustomFieldValue,
  type CustomFieldModule,
  type CustomFieldType,
} from "@erpindo/shared";
import type { SqlExecutor } from "@erpindo/db";

/**
 * Field kustom (Fase 20j) — baca definisi, validasi, dan simpan nilai.
 *
 * Dipisah dari route-nya karena TIGA modul memakainya (kontak, produk, faktur)
 * dan tiap salinan aturan adalah satu tempat baru untuk berbeda diam-diam.
 */

type DefRow = {
  id: string;
  module: CustomFieldModule;
  field_key: string;
  label: string;
  type: CustomFieldType;
  options: string | null;
  required: number;
  sort_order: number;
  created_at: string;
};

function toApiDef(r: DefRow): ApiCustomFieldDef {
  return {
    id: r.id,
    module: r.module,
    fieldKey: r.field_key,
    label: r.label,
    type: r.type,
    options: r.options ? (JSON.parse(r.options) as string[]) : null,
    required: r.required === 1,
    sortOrder: r.sort_order,
    createdAt: r.created_at,
  };
}

/** Definisi aktif untuk satu modul, urut tampil. */
export async function definisiKustom(
  db: SqlExecutor,
  module: CustomFieldModule,
): Promise<ApiCustomFieldDef[]> {
  const { results } = await db
    .prepare(
      `SELECT id, module, field_key, label, type, options, required, sort_order, created_at
       FROM custom_field_defs WHERE module = ? AND is_archived = 0
       ORDER BY sort_order, label`,
    )
    .bind(module)
    .all<DefRow>();
  return results.map(toApiDef);
}

export class CustomFieldError extends Error {}

/**
 * Validasi TANPA menyimpan.
 *
 * Dipakai jalur dokumen (faktur): nilainya harus ditolak **sebelum** jurnal &
 * stok dibuat. Menyimpan dulu lalu gagal berarti faktur terlanjur terposting
 * dengan field wajib yang kosong — dan jurnal di repo ini tidak bisa dihapus.
 */
export async function periksaNilaiKustom(
  db: SqlExecutor,
  module: CustomFieldModule,
  values: Record<string, string> | undefined,
): Promise<void> {
  const hasil = validasiNilaiKustom(await definisiKustom(db, module), values);
  if (!hasil.ok) throw new CustomFieldError(hasil.pesan);
}

/**
 * Validasi nilai lalu tulis ke `custom_field_values`.
 *
 * Melempar {@link CustomFieldError} bila tidak sah — pemanggil memetakannya ke
 * 400. Validasinya memakai `validasiNilaiKustom()` dari `packages/shared`,
 * fungsi yang sama yang dipakai web, sehingga tak ada dua aturan yang bisa
 * berbeda.
 */
export async function simpanNilaiKustom(
  db: SqlExecutor,
  input: {
    module: CustomFieldModule;
    refType: string;
    refId: string;
    values: Record<string, string> | undefined;
  },
): Promise<void> {
  const defs = await definisiKustom(db, input.module);
  // Tanpa definisi apa pun, nilai yang dikirim tetap diperiksa — sehingga
  // pemanggil yang mengirim field ke modul tanpa field kustom mendapat galat,
  // bukan penyimpanan hampa.
  const hasil = validasiNilaiKustom(defs, input.values);
  if (!hasil.ok) throw new CustomFieldError(hasil.pesan);
  if (!input.values) return;

  for (const def of defs) {
    const v = (input.values[def.fieldKey] ?? "").trim();
    if (!v) continue;
    await db
      .prepare(
        `INSERT INTO custom_field_values (id, def_id, ref_type, ref_id, value)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT (def_id, ref_type, ref_id) DO UPDATE SET value = excluded.value`,
      )
      .bind(crypto.randomUUID(), def.id, input.refType, input.refId, v)
      .run();
  }
}

/** Nilai field kustom satu record, sudah bergabung dengan definisinya. */
export async function nilaiKustom(
  db: SqlExecutor,
  refType: string,
  refId: string,
): Promise<ApiCustomFieldValue[]> {
  const { results } = await db
    .prepare(
      `SELECT v.def_id, d.field_key, d.label, d.type, v.value
       FROM custom_field_values v JOIN custom_field_defs d ON d.id = v.def_id
       WHERE v.ref_type = ? AND v.ref_id = ? AND d.is_archived = 0
       ORDER BY d.sort_order, d.label`,
    )
    .bind(refType, refId)
    .all<{ def_id: string; field_key: string; label: string; type: CustomFieldType; value: string }>();
  return results.map((r) => ({
    defId: r.def_id,
    fieldKey: r.field_key,
    label: r.label,
    type: r.type,
    value: r.value,
  }));
}

/**
 * Nilai untuk BANYAK record sekaligus — dipakai daftar & ekspor.
 *
 * Satu kueri untuk seluruh halaman, bukan satu kueri per baris: ekspor 500
 * kontak lewat jalur per-baris berarti 500 perjalanan ke D1.
 */
export async function nilaiKustomBanyak(
  db: SqlExecutor,
  refType: string,
  refIds: string[],
): Promise<Map<string, ApiCustomFieldValue[]>> {
  const peta = new Map<string, ApiCustomFieldValue[]>();
  if (refIds.length === 0) return peta;
  const { results } = await db
    .prepare(
      `SELECT v.ref_id, v.def_id, d.field_key, d.label, d.type, v.value
       FROM custom_field_values v JOIN custom_field_defs d ON d.id = v.def_id
       WHERE v.ref_type = ? AND d.is_archived = 0
         AND v.ref_id IN (${refIds.map(() => "?").join(",")})
       ORDER BY d.sort_order, d.label`,
    )
    .bind(refType, ...refIds)
    .all<{
      ref_id: string; def_id: string; field_key: string; label: string; type: CustomFieldType; value: string;
    }>();
  for (const r of results) {
    const daftar = peta.get(r.ref_id) ?? [];
    daftar.push({ defId: r.def_id, fieldKey: r.field_key, label: r.label, type: r.type, value: r.value });
    peta.set(r.ref_id, daftar);
  }
  return peta;
}
