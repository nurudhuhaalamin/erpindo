import type { ApiCustomFieldDef, ApiCustomFieldValue, CustomFieldModule, CustomFieldType } from "@erpindo/shared";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../api/client";
import { useUi, type UiKey } from "../i18n/ui";
import { Input, Label, Select } from "./ui";

/**
 * Kontrol form untuk field kustom (Fase 20j).
 *
 * Dipakai TIGA layar (kontak, produk, faktur). Satu komponen, bukan tiga
 * salinan: tiga salinan berarti tiga tempat untuk berbeda diam-diam dalam
 * menangani tipe, dan tipe yang ditangani berbeda antar-layar akan menghasilkan
 * nilai yang ditolak server hanya di sebagian layar.
 */

/** Label tipe tinggal di kamus web; `packages/shared` tetap Indonesia (pola 16t). */
const TIPE_KEY: Record<CustomFieldType, UiKey> = {
  teks: "tipeTeks",
  angka: "tipeAngka",
  tanggal: "tipeTanggal",
  pilihan: "tipePilihan",
};

export { TIPE_KEY };

export function CustomFieldInputs({
  defs,
  values,
  onChange,
  idPrefix,
}: {
  defs: ApiCustomFieldDef[];
  values: Record<string, string>;
  onChange: (fieldKey: string, value: string) => void;
  idPrefix: string;
}) {
  const u = useUi();
  if (defs.length === 0) return null;
  return (
    <div data-testid={`field-kustom-${idPrefix}`} className="grid gap-3 sm:grid-cols-3">
      {defs.map((d) => {
        const id = `${idPrefix}-cf-${d.fieldKey}`;
        const v = values[d.fieldKey] ?? "";
        return (
          <div key={d.id}>
            <Label htmlFor={id}>
              {d.label}
              {d.required ? <span className="text-rose-600 dark:text-rose-400"> *</span> : null}
            </Label>
            {d.type === "pilihan" ? (
              <Select id={id} value={v} onChange={(e) => onChange(d.fieldKey, e.target.value)}>
                <option value="">{u("pilihOpsi")}</option>
                {(d.options ?? []).map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </Select>
            ) : (
              <Input
                id={id}
                type={d.type === "angka" ? "number" : d.type === "tanggal" ? "date" : "text"}
                value={v}
                onChange={(e) => onChange(d.fieldKey, e.target.value)}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

/**
 * Keadaan field kustom untuk satu form (Fase 20j).
 *
 * Form master data memakai `FormData` (tak terkendali), sementara field kustom
 * butuh keadaan terkendali — dropdown `pilihan` dan input tanggal tidak bisa
 * diandalkan lewat `FormData` saja tanpa menduplikasi konversi tipe di tiap
 * layar. Hook ini yang menampungnya, satu kali untuk tiga layar.
 */
export function useFieldKustom(tenantId: string, module: CustomFieldModule) {
  const query = useQuery({
    queryKey: ["custom-fields", tenantId, module],
    queryFn: () => api.customFieldDefs(tenantId, module),
  });
  const [values, setValues] = useState<Record<string, string>>({});
  const defs = query.data?.defs ?? [];

  return {
    defs,
    values,
    setValue: (fieldKey: string, value: string) =>
      setValues((v) => ({ ...v, [fieldKey]: value })),
    reset: () => setValues({}),
    /** Isi form dari nilai yang sudah tersimpan (saat menekan "Ubah"). */
    isiDari: (tersimpan: ApiCustomFieldValue[] | undefined) =>
      setValues(Object.fromEntries((tersimpan ?? []).map((v) => [v.fieldKey, v.value]))),
    /**
     * Bagian `customFields` untuk badan permintaan. Dikirim hanya bila ada
     * definisinya — supaya tenant tanpa field kustom tidak pernah mengirim
     * kunci kosong yang akan ditolak server.
     */
    payload: () => (defs.length > 0 ? { customFields: values } : {}),
  };
}
