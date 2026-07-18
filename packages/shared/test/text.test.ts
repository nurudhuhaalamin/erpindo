import { describe, expect, it } from "vitest";
import { escapeHtml, renderMarkdown, toSlug } from "../src/index";

describe("escapeHtml", () => {
  it("meng-escape kelima karakter berbahaya", () => {
    expect(escapeHtml(`<a href="x" data-b='y'>Tom & Jerry</a>`)).toBe(
      "&lt;a href=&quot;x&quot; data-b=&#39;y&#39;&gt;Tom &amp; Jerry&lt;/a&gt;",
    );
  });

  it("membiarkan teks biasa apa adanya", () => {
    expect(escapeHtml("halo dunia 123")).toBe("halo dunia 123");
  });
});

describe("renderMarkdown (subset escape-first, Fase 10e)", () => {
  it("merender heading bergeser satu level (# → h2)", () => {
    expect(renderMarkdown("# Judul")).toBe("<h2>Judul</h2>");
    expect(renderMarkdown("## Sub")).toBe("<h3>Sub</h3>");
    expect(renderMarkdown("### Kecil")).toBe("<h4>Kecil</h4>");
  });

  it("merender daftar, paragraf, tebal, miring, dan kode", () => {
    const html = renderMarkdown("Teks **tebal** dan *miring* serta `kode`.\n\n- satu\n- dua");
    expect(html).toContain("<p>Teks <strong>tebal</strong> dan <em>miring</em> serta <code>kode</code>.</p>");
    expect(html).toContain("<ul><li>satu</li><li>dua</li></ul>");
  });

  it("hanya membuat tautan http(s)", () => {
    expect(renderMarkdown("[situs](https://contoh.id)")).toContain('<a href="https://contoh.id" rel="noopener">situs</a>');
    expect(renderMarkdown("[jahat](javascript:alert(1))")).not.toContain("<a ");
  });

  it("aman XSS: tag script dan injeksi atribut selalu ter-escape", () => {
    const html = renderMarkdown('<script>alert(1)</script>\n\n[x](https://a.id/" onmouseover="p())');
    expect(html).not.toContain("<script");
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toMatch(/onmouseover="p/);
  });

  it("menggabungkan baris berurutan menjadi satu paragraf", () => {
    expect(renderMarkdown("baris satu\nbaris dua")).toBe("<p>baris satu baris dua</p>");
  });
});

describe("toSlug", () => {
  it("menormalkan aksen (NFKD) dan memotong ke 40 karakter", () => {
    expect(toSlug("Café Déjà Vu")).toBe("cafe-deja-vu");
    expect(toSlug("a".repeat(60)).length).toBeLessThanOrEqual(40);
  });

  it("tidak pernah menghasilkan hubung di tepi", () => {
    expect(toSlug("  PT. Maju!  ")).toBe("pt-maju");
  });
});
