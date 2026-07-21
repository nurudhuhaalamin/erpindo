import {
  API_KEY_PREFIX,
  WEBHOOK_EVENTS,
  WEBHOOK_EVENT_LABELS,
  WEBHOOK_SIGNATURE_HEADER,
  type WebhookEvent,
} from "@erpindo/shared";
import { Hono } from "hono";
import type { AppEnv, Env } from "../env";

/**
 * Halaman dokumentasi API publik (Fase 13h) — server-side rendered oleh Worker
 * (masuk `run_worker_first` di wrangler.jsonc) sehingga terindeks mesin pencari,
 * seperti blog. Statis: menjelaskan autentikasi Bearer, endpoint terkurasi,
 * dan verifikasi tanda tangan webhook. Tanpa aset eksternal.
 */

function origin(env: Env, reqUrl: string): string {
  return (env.APP_URL ?? new URL(reqUrl).origin).replace(/\/$/, "");
}

const CSS = `
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: system-ui, -apple-system, "Segoe UI", sans-serif; color: #0f172a; background: #f8fafc; line-height: 1.7; }
  header { border-bottom: 1px solid #e2e8f0; background: #fff; }
  .wrap { max-width: 52rem; margin: 0 auto; padding: 0 1.25rem; }
  header .wrap { display: flex; align-items: center; justify-content: space-between; padding: .8rem 1.25rem; }
  header img { height: 2.2rem; display: block; }
  header nav a { color: #334155; text-decoration: none; font-size: .9rem; margin-left: 1rem; }
  header nav a.cta { background: #2563eb; color: #fff; padding: .45rem .9rem; border-radius: .5rem; font-weight: 600; }
  main { padding: 2rem 0 4rem; }
  h1 { font-size: 2rem; margin: 0 0 .3rem; }
  h2 { font-size: 1.3rem; margin: 2.2rem 0 .6rem; border-top: 1px solid #e2e8f0; padding-top: 1.6rem; }
  h3 { font-size: 1.02rem; margin: 1.4rem 0 .4rem; }
  p.lead { color: #475569; font-size: 1.05rem; }
  code { background: #eef2ff; color: #3730a3; padding: .1rem .35rem; border-radius: .3rem; font-size: .87em; }
  pre { background: #0f172a; color: #e2e8f0; padding: 1rem 1.1rem; border-radius: .6rem; overflow-x: auto; font-size: .85rem; line-height: 1.6; }
  pre code { background: none; color: inherit; padding: 0; }
  table { width: 100%; border-collapse: collapse; margin: .6rem 0; font-size: .92rem; }
  th, td { text-align: left; padding: .5rem .6rem; border-bottom: 1px solid #e2e8f0; vertical-align: top; }
  th { color: #64748b; font-weight: 600; }
  .method { font-weight: 700; color: #16a34a; }
  .method.post { color: #2563eb; }
  .badge { display: inline-block; background: #fef3c7; color: #92400e; font-size: .72rem; font-weight: 700; padding: .1rem .45rem; border-radius: .3rem; margin-left: .4rem; }
  footer { border-top: 1px solid #e2e8f0; color: #64748b; font-size: .85rem; padding: 1.5rem 0; }
  a { color: #2563eb; }
`;

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch] ?? ch);
}

function docsHtml(base: string): string {
  const eventsRows = WEBHOOK_EVENTS.map(
    (e: WebhookEvent) => `<tr><td><code>${esc(e)}</code></td><td>${esc(WEBHOOK_EVENT_LABELS[e])}</td></tr>`,
  ).join("\n");

  return `<!doctype html>
<html lang="id">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Dokumentasi API — ERPindo</title>
<meta name="description" content="API publik ERPindo: autentikasi Bearer API key, endpoint kontak/produk/faktur/pembayaran/ringkasan, dan webhook peristiwa dengan tanda tangan HMAC. Tersedia pada paket Enterprise." />
<link rel="canonical" href="${esc(base)}/api-docs" />
<link rel="icon" type="image/png" href="/favicon.png" />
<meta property="og:title" content="Dokumentasi API — ERPindo" />
<meta property="og:description" content="Integrasikan sistem Anda dengan ERPindo lewat API publik & webhook." />
<style>${CSS}</style>
</head>
<body>
<header><div class="wrap">
  <a href="/"><img src="/logo.svg" alt="ERPindo" onerror="this.style.display='none'" /></a>
  <nav><a href="/">Beranda</a><a href="/blog">Blog</a><a class="cta" href="/app">Masuk</a></nav>
</div></header>
<main><div class="wrap">
  <h1>Dokumentasi API ERPindo</h1>
  <p class="lead">Integrasikan toko online, aplikasi kasir, atau sistem internal Anda dengan ERPindo.
  API publik &amp; webhook tersedia pada paket <strong>Enterprise</strong>.</p>

  <h2>1. Autentikasi</h2>
  <p>Buat <strong>API key</strong> di <em>Pengaturan → API &amp; Integrasi</em> (khusus Pemilik).
  Sertakan pada setiap permintaan lewat header <code>Authorization</code>:</p>
  <pre><code>Authorization: Bearer ${esc(API_KEY_PREFIX)}xxxxxxxxxxxxxxxx</code></pre>
  <p>Kunci punya skop <code>read</code> (baca-saja) atau <code>write</code> (baca &amp; tulis).
  Simpan kunci dengan aman — nilai penuh hanya ditampilkan sekali saat dibuat, dan bisa dicabut kapan saja.</p>
  <p>Semua endpoint bekerja pada data <strong>perusahaan pemilik kunci</strong> — tidak perlu ID perusahaan di URL.
  Basis URL: <code>${esc(base)}/api/v1</code></p>

  <h2>2. Endpoint</h2>
  <table>
    <tr><th>Metode</th><th>Jalur</th><th>Skop</th><th>Keterangan</th></tr>
    <tr><td><span class="method">GET</span></td><td><code>/contacts</code></td><td>read</td><td>Daftar kontak (pelanggan/pemasok)</td></tr>
    <tr><td><span class="method post">POST</span></td><td><code>/contacts</code></td><td>write</td><td>Buat kontak baru</td></tr>
    <tr><td><span class="method">GET</span></td><td><code>/products</code></td><td>read</td><td>Daftar produk</td></tr>
    <tr><td><span class="method post">POST</span></td><td><code>/products</code></td><td>write</td><td>Buat produk baru</td></tr>
    <tr><td><span class="method">GET</span></td><td><code>/invoices</code></td><td>read</td><td>Daftar faktur penjualan</td></tr>
    <tr><td><span class="method">GET</span></td><td><code>/payments</code></td><td>read</td><td>Daftar pembayaran</td></tr>
    <tr><td><span class="method">GET</span></td><td><code>/reports/summary</code></td><td>read</td><td>Ringkasan penjualan &amp; piutang bulan berjalan</td></tr>
  </table>
  <p>Parameter <code>?limit=</code> (maks 200) dan <code>?offset=</code> tersedia pada endpoint daftar.</p>

  <h3>Contoh: ambil daftar produk</h3>
  <pre><code>curl ${esc(base)}/api/v1/products \\
  -H "Authorization: Bearer ${esc(API_KEY_PREFIX)}xxxxxxxx"</code></pre>
  <pre><code>{
  "data": [
    { "id": "…", "sku": "BRG-001", "name": "Kopi 250g",
      "unit": "pcs", "sellPrice": 45000, "buyPrice": 30000, "minStock": 10 }
  ]
}</code></pre>

  <h3>Contoh: buat kontak (butuh skop write)</h3>
  <pre><code>curl -X POST ${esc(base)}/api/v1/contacts \\
  -H "Authorization: Bearer ${esc(API_KEY_PREFIX)}xxxxxxxx" \\
  -H "Content-Type: application/json" \\
  -d '{ "type": "customer", "name": "PT Pelanggan Baru", "email": "po@pelanggan.co.id" }'</code></pre>

  <h2>3. Webhook</h2>
  <p>Daftarkan URL penerima di <em>Pengaturan → API &amp; Integrasi</em>. ERPindo mengirim
  <code>POST</code> JSON setiap kali peristiwa terjadi. Peristiwa yang tersedia:</p>
  <table>
    <tr><th>Peristiwa</th><th>Keterangan</th></tr>
    ${eventsRows}
  </table>
  <p>Contoh muatan (body):</p>
  <pre><code>{
  "event": "invoice.created",
  "tenantId": "…",
  "occurredAt": "2026-07-21T10:00:00.000Z",
  "data": { "id": "…", "invoiceNo": "INV-2026-07-0001", "total": 550000 }
}</code></pre>

  <h3>Verifikasi tanda tangan</h3>
  <p>Setiap pengiriman menyertakan header <code>${esc(WEBHOOK_SIGNATURE_HEADER)}</code> berisi
  <code>sha256=&lt;hex&gt;</code> — HMAC-SHA256 dari <strong>body mentah</strong> memakai
  <em>secret</em> webhook Anda. Hitung ulang dan bandingkan untuk memastikan keaslian:</p>
  <pre><code>// Node.js
import { createHmac } from "node:crypto";
const expected = "sha256=" + createHmac("sha256", secret).update(rawBody).digest("hex");
if (expected !== req.headers["${esc(WEBHOOK_SIGNATURE_HEADER.toLowerCase())}"]) {
  throw new Error("Tanda tangan webhook tidak valid");
}</code></pre>
  <p>Pengiriman yang gagal dicoba ulang otomatis dengan jeda bertambah (hingga 5 kali).
  Balas <code>2xx</code> secepatnya untuk menandai sukses.</p>

  <footer><div class="wrap">ERPindo — ERP untuk usaha Indonesia. <a href="/">Kembali ke beranda</a>.</div></footer>
</div></main>
</body>
</html>`;
}

export const apiDocsRoutes = new Hono<AppEnv>().get("/api-docs", (c) => {
  const base = origin(c.env, c.req.url);
  return c.html(docsHtml(base));
});
