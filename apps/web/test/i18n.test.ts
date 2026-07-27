import { describe, expect, it } from "vitest";
import { getLang, LANGS, pick, setLang } from "../src/i18n";
import { UI } from "../src/i18n/ui";

describe("i18n core (Fase 13d)", () => {
  it("default bahasa Indonesia di lingkungan tanpa window", () => {
    expect(getLang()).toBe("id");
    expect(LANGS).toEqual(["id", "en"]);
  });

  it("setLang mengubah bahasa aktif", () => {
    setLang("en");
    expect(getLang()).toBe("en");
    setLang("id");
    expect(getLang()).toBe("id");
  });

  it("pick memilih string sesuai bahasa", () => {
    const dual = { id: "Harga", en: "Pricing" };
    expect(pick(dual, "id")).toBe("Harga");
    expect(pick(dual, "en")).toBe("Pricing");
  });

  /**
   * Fase 19q — penjaga ini dulu mengawasi `DICT`, kamus 17 entri yang
   * `useT()`-nya tidak pernah dipanggil siapa pun. Jadi ia menjaga kode mati
   * sementara kamus yang benar-benar dipakai (`UI`, 1.100+ entri) tidak
   * dijaga sama sekali. `DICT` sudah dihapus; penjaganya dipindahkan ke `UI`.
   *
   * `satisfies Record<string, Dual>` sudah memastikan kedua kolom ADA saat
   * kompilasi; yang belum dijamin adalah keduanya TERISI — kolom `en: ""`
   * lolos tsc tapi membuat layar kosong saat bahasa Inggris dipilih.
   */
  it("setiap entri kamus UI punya kedua bahasa terisi", () => {
    const kosong: string[] = [];
    for (const key of Object.keys(UI) as (keyof typeof UI)[]) {
      if (!UI[key].id.trim()) kosong.push(`${key}.id`);
      if (!UI[key].en.trim()) kosong.push(`${key}.en`);
    }
    expect(kosong).toEqual([]);
    expect(Object.keys(UI).length).toBeGreaterThan(1000);
  });
});
