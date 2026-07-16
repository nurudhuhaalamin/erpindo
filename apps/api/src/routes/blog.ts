import { escapeHtml, renderMarkdown } from "@erpindo/shared";
import { Hono } from "hono";
import type { AppEnv, Env } from "../env";

/**
 * Blog publik server-side rendered (Fase 10e) — artikel ditulis dari
 * dashboard admin, dilayani sebagai HTML penuh oleh Worker sehingga terindeks
 * mesin pencari (SEO), lengkap dengan meta OG + JSON-LD + sitemap.
 *
 * PENTING: jalur /blog, /sitemap.xml, /robots.txt masuk `run_worker_first`
 * di wrangler.jsonc — tanpa itu permintaan jatuh ke aset statis SPA.
 */

type BlogRow = {
  slug: string;
  title: string;
  excerpt: string | null;
  body_md: string;
  cover_url: string | null;
  published_at: string;
  updated_at: string;
};

function origin(env: Env, reqUrl: string): string {
  return (env.APP_URL ?? new URL(reqUrl).origin).replace(/\/$/, "");
}

function formatTanggal(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
  } catch {
    return iso.slice(0, 10);
  }
}

/** Kerangka HTML blog — ringan, tanpa aset eksternal selain logo situs sendiri. */
function page(opts: { title: string; description: string; canonical: string; head?: string; body: string }): string {
  return `<!doctype html>
<html lang="id">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(opts.title)}</title>
<meta name="description" content="${escapeHtml(opts.description)}" />
<link rel="canonical" href="${escapeHtml(opts.canonical)}" />
<link rel="icon" type="image/png" href="/favicon.png" />
<meta property="og:title" content="${escapeHtml(opts.title)}" />
<meta property="og:description" content="${escapeHtml(opts.description)}" />
<meta property="og:image" content="/og-image.png" />
${opts.head ?? ""}
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: system-ui, -apple-system, "Segoe UI", sans-serif; color: #0f172a; background: #f8fafc; line-height: 1.7; }
  header { border-bottom: 1px solid #e2e8f0; background: #fff; }
  .wrap { max-width: 46rem; margin: 0 auto; padding: 0 1.25rem; }
  header .wrap { display: flex; align-items: center; justify-content: space-between; padding-top: .8rem; padding-bottom: .8rem; }
  header img { height: 2.2rem; display: block; }
  header nav a { color: #334155; text-decoration: none; font-size: .9rem; margin-left: 1rem; }
  header nav a.cta { background: #2563eb; color: #fff; padding: .45rem .9rem; border-radius: .5rem; font-weight: 600; }
  main { padding: 2.5rem 0 4rem; }
  h1 { font-size: 2rem; line-height: 1.25; margin: 0 0 .5rem; }
  h2 { font-size: 1.4rem; margin-top: 2rem; }
  h3 { font-size: 1.15rem; margin-top: 1.5rem; }
  .meta { color: #64748b; font-size: .9rem; margin-bottom: 2rem; }
  article a { color: #2563eb; }
  code { background: #e2e8f0; border-radius: .3rem; padding: .1rem .35rem; font-size: .9em; }
  .card { display: block; background: #fff; border: 1px solid #e2e8f0; border-radius: .9rem; padding: 1.25rem 1.5rem; margin-bottom: 1rem; text-decoration: none; color: inherit; }
  .card h2 { margin: 0 0 .3rem; font-size: 1.2rem; color: #1d4ed8; }
  .card p { margin: .25rem 0 0; color: #475569; font-size: .95rem; }
  .cover { width: 100%; border-radius: .9rem; margin-bottom: 1.5rem; }
  footer { border-top: 1px solid #e2e8f0; background: #fff; padding: 2rem 0; text-align: center; color: #64748b; font-size: .9rem; }
  footer a { color: #2563eb; text-decoration: none; font-weight: 600; }
</style>
</head>
<body>
<header><div class="wrap">
  <a href="/"><img src="/brand/logo-erpindo.png" alt="ERPindo" /></a>
  <nav><a href="/blog">Blog</a><a href="/panduan">Panduan</a><a class="cta" href="/daftar">Coba Gratis</a></nav>
</div></header>
<main><div class="wrap">${opts.body}</div></main>
<footer><div class="wrap">ERPindo — ERP untuk UMKM Indonesia. <a href="/daftar">Coba gratis 30 hari</a>.</div></footer>
</body>
</html>`;
}

const CACHE = "public, max-age=300";

export const blogRoutes = new Hono<AppEnv>()

  .get("/blog", async (c) => {
    const { results } = await c.env.DB.prepare(
      `SELECT slug, title, excerpt, body_md, cover_url, published_at, updated_at
       FROM blog_posts WHERE published_at IS NOT NULL ORDER BY published_at DESC LIMIT 100`,
    ).all<BlogRow>();
    const base = origin(c.env, c.req.url);
    const cards = results
      .map(
        (p) => `<a class="card" href="/blog/${escapeHtml(p.slug)}">
  <h2>${escapeHtml(p.title)}</h2>
  <p>${escapeHtml(p.excerpt ?? "")}</p>
  <p class="meta">${formatTanggal(p.published_at)}</p>
</a>`,
      )
      .join("\n");
    const html = page({
      title: "Blog ERPindo — Tips pembukuan, pajak & operasional UMKM",
      description: "Artikel praktis seputar pembukuan, pajak, stok, gaji, dan operasional UMKM Indonesia dari tim ERPindo.",
      canonical: `${base}/blog`,
      body: `<h1>Blog ERPindo</h1>
<p class="meta">Tips praktis pembukuan, pajak, dan operasional untuk UMKM Indonesia.</p>
${results.length === 0 ? "<p>Belum ada artikel — nantikan segera.</p>" : cards}`,
    });
    return c.html(html, 200, { "Cache-Control": CACHE });
  })

  .get("/blog/:slug", async (c) => {
    const slug = c.req.param("slug");
    const post = await c.env.DB.prepare(
      `SELECT slug, title, excerpt, body_md, cover_url, published_at, updated_at
       FROM blog_posts WHERE slug = ? AND published_at IS NOT NULL`,
    )
      .bind(slug)
      .first<BlogRow>();
    const base = origin(c.env, c.req.url);
    if (!post) {
      return c.html(
        page({
          title: "Artikel tidak ditemukan — Blog ERPindo",
          description: "Artikel yang Anda cari tidak ditemukan.",
          canonical: `${base}/blog`,
          body: `<h1>Artikel tidak ditemukan</h1><p>Artikel yang Anda cari tidak ada atau belum diterbitkan. <a href="/blog">Kembali ke blog</a>.</p>`,
        }),
        404,
      );
    }
    const jsonLd = {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: post.title,
      description: post.excerpt ?? undefined,
      datePublished: post.published_at,
      dateModified: post.updated_at,
      author: { "@type": "Organization", name: "ERPindo" },
      mainEntityOfPage: `${base}/blog/${post.slug}`,
    };
    const html = page({
      title: `${post.title} — Blog ERPindo`,
      description: post.excerpt ?? post.title,
      canonical: `${base}/blog/${post.slug}`,
      head: `<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>`,
      body: `<article>
<h1>${escapeHtml(post.title)}</h1>
<p class="meta">Diterbitkan ${formatTanggal(post.published_at)}</p>
${post.cover_url ? `<img class="cover" src="${escapeHtml(post.cover_url)}" alt="" />` : ""}
${renderMarkdown(post.body_md)}
</article>`,
    });
    return c.html(html, 200, { "Cache-Control": CACHE });
  })

  .get("/sitemap.xml", async (c) => {
    const base = origin(c.env, c.req.url);
    const { results } = await c.env.DB.prepare(
      `SELECT slug, updated_at FROM blog_posts WHERE published_at IS NOT NULL ORDER BY published_at DESC LIMIT 500`,
    ).all<{ slug: string; updated_at: string }>();
    const urls = [
      `<url><loc>${base}/</loc></url>`,
      `<url><loc>${base}/panduan</loc></url>`,
      `<url><loc>${base}/blog</loc></url>`,
      ...results.map(
        (p) => `<url><loc>${base}/blog/${escapeHtml(p.slug)}</loc><lastmod>${p.updated_at.slice(0, 10)}</lastmod></url>`,
      ),
    ].join("\n");
    return c.body(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>`, 200, {
      "Content-Type": "application/xml",
      "Cache-Control": CACHE,
    });
  })

  .get("/robots.txt", (c) => {
    const base = origin(c.env, c.req.url);
    return c.text(`User-agent: *\nAllow: /\nDisallow: /app\nDisallow: /api\n\nSitemap: ${base}/sitemap.xml\n`, 200, {
      "Cache-Control": CACHE,
    });
  });
