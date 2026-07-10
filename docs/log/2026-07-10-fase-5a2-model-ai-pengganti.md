# Log Kerja — Fase 5a-2: Akar Masalah AI Ditemukan — Model Dipensiunkan Cloudflare

**Tanggal:** 10 Juli 2026 · Lanjutan diagnosa Fase 5a.

## Akar masalah (dari probe produksi)

Probe `ai-probe.yml` (runner GitHub → produksi) membaca alasan 503 yang kini terekspos:

```
AiError: 5028: This model was deprecated on 2026-05-30. Please use an alternative model.
```

Model `@cf/meta/llama-3.1-8b-instruct` termasuk 18 model yang **dipensiunkan Cloudflare pada
30 Mei 2026** (changelog Workers AI 2026-05-08). Bukan masalah binding, bukan masalah akun —
murni model yang hilang. Tanpa perbaikan jalur error di Fase 5a, penyebab ini tidak akan
pernah terlihat.

## Perbaikan

`routes/ai.ts`: konstanta model tunggal → **daftar kandidat berurutan dengan fallback
otomatis**: `@cf/zai-org/glm-4.7-flash` (pengganti resmi yang direkomendasikan Cloudflare;
multibahasa — cocok untuk Indonesia) → `@cf/meta/llama-3.1-8b-instruct-fast` (varian -fast
dinyatakan tetap aktif). Bila model utama error (mis. dipensiunkan lagi), permintaan otomatis
dicoba ke kandidat berikutnya — deprecation berikutnya tidak mematikan fitur. Parser respons
dibuat toleran (`response` maupun format gaya OpenAI `choices[0].message.content`).

## Validasi

Typecheck · build · smoke 397 lulus (kontrak lokal tak berubah: 503 `binding-absent`).
Setelah merge & deploy: probe produksi diulang — target **HTTP 200 dengan jawaban nyata**.
