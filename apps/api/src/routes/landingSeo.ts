import { PLAN_LIMITS } from "@erpindo/shared";
import { Hono } from "hono";
import type { AppEnv, Env } from "../env";

/**
 * SEO landing (Fase 14d). Halaman utama `/` adalah SPA (CSR). Worker menyisipkan
 * data terstruktur JSON-LD (Organization, SoftwareApplication+Offers, FAQPage) +
 * blok <noscript> ke shell SPA saat penyajian server, tanpa mengubah aplikasi —
 * shell tetap memuat root & skrip SPA, jadi aplikasi berjalan normal, sementara
 * crawler menerima rich data + konten teks meski JavaScript mati.
 *
 * PENTING: `/` masuk `run_worker_first` di wrangler.jsonc.
 */

function origin(env: Env, reqUrl: string): string {
  return (env.APP_URL ?? new URL(reqUrl).origin).replace(/\/$/, "");
}

/** FAQ ringkas untuk rich result — selaras dengan FAQ di landing. */
const FAQ: [q: string, a: string][] = [
  ["Apakah ERPindo cocok untuk usaha kecil sampai perusahaan menengah?", "Ya. ERPindo dipakai dari toko pertama hingga grup perusahaan, dengan paket bertingkat namun akuntansi inti lengkap di semua paket dan pengguna tak terbatas."],
  ["Apakah pengguna dibatasi?", "Tidak. Seluruh paket memberi pengguna tak terbatas — biaya berdasarkan kedalaman fitur & skala, bukan jumlah orang."],
  ["Apakah ada masa coba gratis?", "Ya, 30 hari gratis dengan akses penuh, tanpa kartu kredit."],
  ["Apakah mendukung pajak Indonesia?", "Ya: PPN, PPh 21 (metode TER), dan ekspor e-Faktur/Coretax."],
  ["Apakah data saya aman dan bisa diekspor?", "Data tiap perusahaan terpisah (satu database per perusahaan) dan bisa diekspor kapan saja sebagai CSV/ZIP, termasuk setelah langganan berakhir."],
];

function jsonLd(base: string): string {
  const priceOffer = (["starter", "business", "enterprise"] as const).map((p) => ({
    "@type": "Offer",
    name: PLAN_LIMITS[p].label,
    price: PLAN_LIMITS[p].pricePerMonth,
    priceCurrency: "IDR",
    category: "monthly subscription",
  }));
  const blocks = [
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: "ERPindo",
      url: base,
      logo: `${base}/pwa-512.png`,
      description: "ERP multi-tenant untuk usaha Indonesia — akuntansi, POS, stok, HR/payroll, dan pajak dalam satu aplikasi.",
    },
    {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: "ERPindo",
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web, Android, iOS (PWA)",
      url: base,
      offers: priceOffer,
      description: "Akuntansi double-entry, kasir POS, stok, penggajian PPh 21 TER, hingga e-Faktur. Gratis 30 hari.",
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: FAQ.map(([q, a]) => ({
        "@type": "Question",
        name: q,
        acceptedAnswer: { "@type": "Answer", text: a },
      })),
    },
  ];
  return blocks
    .map((b) => `<script type="application/ld+json">${JSON.stringify(b).replace(/</g, "\\u003c")}</script>`)
    .join("\n");
}

/** Konten teks minimal untuk crawler tanpa JS (SPA butuh JS untuk render penuh). */
function noscriptBlock(base: string): string {
  const faqHtml = FAQ.map(([q, a]) => `<h3>${q}</h3><p>${a}</p>`).join("");
  return `<noscript><div>
<h1>ERPindo — ERP untuk usaha Indonesia</h1>
<p>Akuntansi double-entry, kasir POS, stok, penggajian (PPh 21 TER), dan pajak (PPN, e-Faktur/Coretax) dalam satu aplikasi. Pengguna tak terbatas di semua paket. Coba gratis 30 hari.</p>
<p>Paket per bulan per perusahaan: Starter Rp${PLAN_LIMITS.starter.pricePerMonth.toLocaleString("id-ID")}, Business Rp${PLAN_LIMITS.business.pricePerMonth.toLocaleString("id-ID")}, Enterprise Rp${PLAN_LIMITS.enterprise.pricePerMonth.toLocaleString("id-ID")}.</p>
<p><a href="${base}/daftar">Coba gratis</a> · <a href="${base}/masuk">Masuk</a> · <a href="${base}/panduan">Panduan</a> · <a href="${base}/blog">Blog</a></p>
${faqHtml}
</div></noscript>`;
}

export const landingSeoRoutes = new Hono<AppEnv>().get("/", async (c) => {
  const base = origin(c.env, c.req.url);
  // Ambil shell SPA yang sudah dibangun dari ASSETS lalu sisipkan SEO.
  const res = await c.env.ASSETS.fetch(new Request(`${base}/index.html`));
  if (!res.ok) return c.env.ASSETS.fetch(c.req.raw); // fallback: layani apa adanya
  let html = await res.text();
  const canonical = `<link rel="canonical" href="${base}/" />`;
  html = html.replace("</head>", `${canonical}\n${jsonLd(base)}\n</head>`);
  html = html.replace("</body>", `${noscriptBlock(base)}\n</body>`);
  return c.html(html);
});
