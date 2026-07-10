# Log Kerja — Fase 4e: Asisten AI Gratis (Workers AI)

**Tanggal:** 9 Juli 2026 · **Permintaan pemilik #6:** aplikasi ditenagai AI secara gratis.

## Keputusan platform & scope

- **Cloudflare Workers AI** — kuota gratis 10.000 neuron/hari, tanpa API key (cukup binding
  `ai` di wrangler.jsonc), model `@cf/meta/llama-3.1-8b-instruct`.
- Scope v1: (1) **chat "Asisten erpindo"** — tanya-jawab cara pakai berbahasa Indonesia,
  grounded pada ringkasan panduan per modul; (2) **draf jurnal dari bahasa alami** ("bayar
  listrik 500 ribu dari kas") — usulan tervalidasi ketat, dimuat ke form Jurnal Umum, dan
  **manusia yang memposting**. Prinsip: AI tidak pernah menulis data.

## Yang dikerjakan

1. API `routes/ai.ts`: `POST /ai/chat` (viewer) & `POST /ai/jurnal` (admin). Guard
   `!env.AI → 503` + try/catch panggilan model → 503 (degradasi anggun). Kuota **50
   permintaan/hari/tenant** via KV → 429 (melindungi jatah neuron gratis). Grounding chat dari
   `lib/guideKnowledge.ts` (ringkasan 23 modul + pencocokan kata kunci). Draf jurnal: COA tenant
   di-inject ke prompt, jawaban model diparse JSON → divalidasi Zod → kode akun dicek ada →
   **wajib seimbang** (422 bila tidak).
2. UI `components/asisten.tsx`: tombol mengambang (Sparkles) + panel chat dengan mode
   Tanya / Draf Jurnal, contoh prompt, state ramah untuk 503 & 429; draf → sessionStorage →
   **prefill otomatis form Jurnal Umum** (finance.tsx) dengan toast peninjauan.
3. **Penemuan & mitigasi**: binding `ai` membuat `wrangler dev` menolak start tanpa kredensial
   Cloudflare → `scripts/make-dev-config.mjs` men-generate `wrangler.dev.jsonc` (tanpa `ai`,
   gitignored) yang dipakai smoke, screenshots, dan `pnpm dev:api`; deploy produksi tetap memakai
   wrangler.jsonc lengkap.
4. Skema shared `aiChatSchema`/`aiJurnalSchema` + tipe `ApiAiJournalDraft`; klien `aiChat`/`aiJurnal`.

## Validasi (semua hijau)

- Typecheck · unit test · build · **smoke 391 → 395** (kontrak degradasi: chat 200-atau-503,
  401 tanpa sesi, RBAC viewer ditolak di draf jurnal, jurnal 200/422-atau-503).
- Playwright: panel chat, mode draf jurnal, state degradasi (gelap) — dikirim ke pemilik.
- **Catatan produksi**: kualitas jawaban & akurasi draf diuji nyata setelah deploy (binding AI
  aktif otomatis di produksi); pemakaian neuron terpantau di dashboard Cloudflare → AI.

## Berikutnya

Fase 4f: dokumen roadmap pengembangan lanjutan per modul + laporan akhir Fase 4 ke pemilik.
