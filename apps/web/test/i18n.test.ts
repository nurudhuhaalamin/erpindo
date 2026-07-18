import { describe, expect, it } from "vitest";
import { DICT, getLang, LANGS, pick, setLang } from "../src/i18n";

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

  it("setiap entri kamus punya kedua bahasa terisi", () => {
    for (const key of Object.keys(DICT) as (keyof typeof DICT)[]) {
      expect(DICT[key].id.length).toBeGreaterThan(0);
      expect(DICT[key].en.length).toBeGreaterThan(0);
    }
  });
});
