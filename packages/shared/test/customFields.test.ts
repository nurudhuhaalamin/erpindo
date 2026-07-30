import { describe, expect, it } from "vitest";
import { customFieldDefSchema, validasiNilaiKustom } from "../src/index";

/**
 * Field kustom (Fase 20j). Yang diuji: aturan yang membuat data tetap bisa
 * dipercaya setelah pemilik boleh menambah kolomnya sendiri.
 */

const defs = [
  { fieldKey: "nomor_po", label: "Nomor PO", type: "teks" as const, options: null, required: true },
  { fieldKey: "bobot", label: "Bobot (kg)", type: "angka" as const, options: null, required: false },
  { fieldKey: "kirim", label: "Tanggal kirim", type: "tanggal" as const, options: null, required: false },
  { fieldKey: "wilayah", label: "Wilayah", type: "pilihan" as const, options: ["Jawa", "Sumatra"], required: false },
];

describe("customFieldDefSchema (Fase 20j)", () => {
  const base = { module: "contact", fieldKey: "nomor_po", label: "Nomor PO", type: "teks" };

  it("menerima definisi yang sah", () => {
    expect(customFieldDefSchema.safeParse(base).success).toBe(true);
  });

  it("menolak kunci yang tidak aman jadi judul kolom ekspor", () => {
    for (const fieldKey of ["Nomor PO", "1nomor", "nomor-po", "a", ""]) {
      expect(customFieldDefSchema.safeParse({ ...base, fieldKey }).success).toBe(false);
    }
  });

  // Dropdown kosong yang WAJIB diisi mengunci seluruh form — tidak ada nilai
  // yang bisa dipilih, jadi dokumennya tak akan pernah bisa disimpan.
  it("menolak tipe 'pilihan' tanpa daftar pilihan", () => {
    expect(customFieldDefSchema.safeParse({ ...base, type: "pilihan" }).success).toBe(false);
    expect(
      customFieldDefSchema.safeParse({ ...base, type: "pilihan", options: ["Jawa"] }).success,
    ).toBe(true);
  });

  it("menolak modul & tipe di luar daftar", () => {
    expect(customFieldDefSchema.safeParse({ ...base, module: "gudang" }).success).toBe(false);
    expect(customFieldDefSchema.safeParse({ ...base, type: "berkas" }).success).toBe(false);
  });
});

describe("validasiNilaiKustom (Fase 20j)", () => {
  it("menerima nilai yang sesuai tiap tipe", () => {
    const r = validasiNilaiKustom(defs, {
      nomor_po: "PO-001",
      bobot: "12.5",
      kirim: "2026-08-01",
      wilayah: "Jawa",
    });
    expect(r.ok).toBe(true);
  });

  it("field wajib yang kosong ditolak dengan menyebut LABEL-nya", () => {
    const r = validasiNilaiKustom(defs, { bobot: "1" });
    expect(r.ok).toBe(false);
    // Pesan menyebut label, bukan kunci — pengguna tak pernah melihat kuncinya.
    if (!r.ok) expect(r.pesan).toContain("Nomor PO");
  });

  it("field opsional yang kosong tidak diperiksa tipenya", () => {
    expect(validasiNilaiKustom(defs, { nomor_po: "PO-1", bobot: "" }).ok).toBe(true);
  });

  it("menolak angka, tanggal, dan pilihan yang tidak sah", () => {
    expect(validasiNilaiKustom(defs, { nomor_po: "x", bobot: "berat" }).ok).toBe(false);
    expect(validasiNilaiKustom(defs, { nomor_po: "x", kirim: "01/08/2026" }).ok).toBe(false);
    expect(validasiNilaiKustom(defs, { nomor_po: "x", wilayah: "Papua" }).ok).toBe(false);
  });

  // Mengabaikan kunci tak dikenal berarti salah ketik menghasilkan data yang
  // tampak tersimpan di layar tetapi tidak pernah ada di mana pun.
  it("menolak kunci yang tidak dikenal, bukan mengabaikannya", () => {
    const r = validasiNilaiKustom(defs, { nomor_po: "x", nomer_po: "y" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.pesan).toContain("nomer_po");
  });

  it("tanpa definisi & tanpa nilai: sah", () => {
    expect(validasiNilaiKustom([], undefined).ok).toBe(true);
    expect(validasiNilaiKustom(defs.filter((d) => !d.required), undefined).ok).toBe(true);
  });
});
