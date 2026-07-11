import { aiChatSchema, aiJurnalSchema, type ApiAiJournalDraft } from "@erpindo/shared";
import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv, Env } from "../env";
import { pickRelevant } from "../lib/guideKnowledge";
import { getTenantDb } from "../lib/tenantDb";
import { requireAuth, requireTenantRole } from "../middleware/auth";

/**
 * Asisten erpindo — Workers AI (kuota gratis 10.000 neuron/hari).
 *
 * Prinsip keamanan: AI TIDAK PERNAH menulis data. Chat hanya menjawab cara
 * pakai (grounded pada ringkasan panduan); draf jurnal hanya USULAN yang
 * divalidasi ketat dan tetap diposting manusia lewat form Jurnal Umum.
 *
 * Degradasi anggun: binding AI opsional (absen di dev/CI, atau panggilan
 * gagal) → 503 dengan pesan jelas, fitur lain tidak terganggu.
 */

// Kandidat model berurutan — bila yang utama dipensiunkan Cloudflare (spt.
// llama-3.1-8b-instruct pada 2026-05-30, AiError 5028), otomatis jatuh ke
// kandidat berikutnya alih-alih mematikan fitur. glm-4.7-flash = pengganti
// resmi yang direkomendasikan (multibahasa, cepat); varian -fast llama
// dinyatakan tetap aktif oleh Cloudflare.
const AI_MODELS = ["@cf/zai-org/glm-4.7-flash", "@cf/meta/llama-3.1-8b-instruct-fast"];
const DAILY_LIMIT = 100;

const AI_UNAVAILABLE_MSG = "Fitur AI belum tersedia di lingkungan ini. Coba lagi nanti.";

/** 503 dengan alasan singkat — memudahkan diagnosa produksi tanpa membuka log. */
function unavailable(detail: string) {
  return { error: AI_UNAVAILABLE_MSG, detail } as const;
}

function quotaKey(tenantId: string): string {
  return `ai:${tenantId}:${new Date().toISOString().slice(0, 10)}`;
}

async function quotaUsed(env: Env, tenantId: string): Promise<number> {
  return Number((await env.RATE_KV.get(quotaKey(tenantId))) ?? 0);
}

async function quotaExceeded(env: Env, tenantId: string): Promise<boolean> {
  return (await quotaUsed(env, tenantId)) >= DAILY_LIMIT;
}

/** Dipanggil HANYA setelah model sukses — panggilan gagal tidak memakan kuota.
 * Mengembalikan sisa kuota hari ini agar UI bisa menampilkannya. */
async function countQuota(env: Env, tenantId: string): Promise<number> {
  const key = quotaKey(tenantId);
  const used = (await quotaUsed(env, tenantId)) + 1;
  await env.RATE_KV.put(key, String(used), { expirationTtl: 172_800 });
  return Math.max(DAILY_LIMIT - used, 0);
}

type ChatMessage = { role: string; content: string };

type ModelResult = { ok: true; text: string } | { ok: false; detail: string };

/** Ambil teks jawaban dari berbagai bentuk respons model (response / gaya OpenAI). */
function extractText(res: unknown): string | null {
  const r = res as { response?: unknown; choices?: { message?: { content?: unknown } }[] } | null;
  if (typeof r?.response === "string" && r.response.length > 0) return r.response;
  const openai = r?.choices?.[0]?.message?.content;
  return typeof openai === "string" && openai.length > 0 ? openai : null;
}

async function runModel(env: Env, messages: ChatMessage[], maxTokens: number): Promise<ModelResult> {
  if (!env.AI) return { ok: false, detail: "binding-absent" };
  let detail = "empty-response";
  for (const model of AI_MODELS) {
    try {
      const res = await env.AI.run(model, { messages, max_tokens: maxTokens });
      const text = extractText(res);
      if (text !== null) return { ok: true, text };
    } catch (err) {
      // Termasuk dev lokal tanpa kredensial remote. Alasan asli dicatat agar
      // kegagalan produksi (mis. model dipensiunkan) bisa didiagnosa; coba
      // kandidat berikutnya.
      console.error(`[ai] model ${model} failed:`, err);
      const msg = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
      detail = msg.slice(0, 160);
    }
  }
  return { ok: false, detail };
}

/** Bentuk JSON yang kita minta dari model untuk draf jurnal. */
const modelDraftSchema = z.object({
  memo: z.string().trim().min(3).max(200),
  lines: z
    .array(
      z.object({
        accountCode: z.string().trim().min(1),
        debit: z.number().int().min(0).max(1_000_000_000_000),
        credit: z.number().int().min(0).max(1_000_000_000_000),
      }),
    )
    .min(2)
    .max(10),
});

export const aiRoutes = new Hono<AppEnv>()

  // -------------------------------------------------------------------------
  // Chat bantuan: tanya-jawab cara pakai, grounded pada ringkasan panduan.
  // -------------------------------------------------------------------------
  .post("/:tenantId/ai/chat", requireAuth, requireTenantRole("viewer"), async (c) => {
    if (!c.env.AI) return c.json(unavailable("binding-absent"), 503);
    const parsed = aiChatSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) {
      return c.json({ error: "Data tidak valid", issues: parsed.error.flatten().fieldErrors }, 400);
    }
    const tenant = c.get("tenant");
    if (await quotaExceeded(c.env, tenant.id)) {
      return c.json({ error: `Kuota asisten AI hari ini habis (${DAILY_LIMIT} pertanyaan/hari). Coba lagi besok.` }, 429);
    }

    const lastUser = [...parsed.data.messages].reverse().find((m) => m.role === "user")?.content ?? "";
    const context = pickRelevant(lastUser, 2)
      .map((g) => `## ${g.title}\n${g.summary}`)
      .join("\n\n");

    const system = [
      "Kamu adalah Asisten erpindo — pemandu aplikasi ERP untuk UMKM Indonesia.",
      "Jawab SINGKAT (maks ±120 kata), ramah, dalam bahasa Indonesia, dengan langkah bernomor bila cocok.",
      "Jawab HANYA seputar cara memakai erpindo (fitur, alur, menu). Jika pertanyaan di luar itu (topik umum, opini, kode), tolak sopan dan arahkan kembali ke erpindo.",
      "Jangan mengarang fitur. Bila tidak yakin, arahkan pengguna ke halaman /panduan.",
      "Kamu TIDAK bisa mengubah data pengguna — hanya memandu.",
      context ? `Konteks panduan terkait:\n\n${context}` : "",
    ]
      .filter(Boolean)
      .join("\n\n");

    const result = await runModel(c.env, [{ role: "system", content: system }, ...parsed.data.messages], 600);
    if (!result.ok) return c.json(unavailable(result.detail), 503);
    const quotaRemaining = await countQuota(c.env, tenant.id);
    return c.json({ reply: result.text.trim(), quotaRemaining });
  })

  // -------------------------------------------------------------------------
  // Draf jurnal dari bahasa alami — usulan tervalidasi, TIDAK diposting.
  // -------------------------------------------------------------------------
  .post("/:tenantId/ai/jurnal", requireAuth, requireTenantRole("admin"), async (c) => {
    if (!c.env.AI) return c.json(unavailable("binding-absent"), 503);
    const parsed = aiJurnalSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) {
      return c.json({ error: "Data tidak valid", issues: parsed.error.flatten().fieldErrors }, 400);
    }
    const tenant = c.get("tenant");
    if (await quotaExceeded(c.env, tenant.id)) {
      return c.json({ error: `Kuota asisten AI hari ini habis (${DAILY_LIMIT} permintaan/hari). Coba lagi besok.` }, 429);
    }

    const db = getTenantDb(c.env, tenant.dbRef);
    const { results: accounts } = await db
      .prepare(`SELECT id, code, name, type FROM accounts WHERE is_archived = 0 ORDER BY code`)
      .all<{ id: string; code: string; name: string; type: string }>();
    const coa = accounts.map((a) => `${a.code} = ${a.name} (${a.type})`).join("\n");

    const system = [
      "Kamu akuntan double-entry untuk UMKM Indonesia. Ubah deskripsi transaksi menjadi draf jurnal.",
      "Balas HANYA JSON valid tanpa teks lain, format:",
      '{"memo":"...","lines":[{"accountCode":"1-1000","debit":500000,"credit":0},{"accountCode":"6-1000","debit":0,"credit":500000}]}',
      "Aturan: total debit HARUS sama dengan total kredit; nominal rupiah bulat (500 ribu = 500000, 1,2 juta = 1200000); gunakan HANYA kode akun dari daftar berikut; 2-4 baris.",
      `Daftar akun:\n${coa}`,
    ].join("\n\n");

    const result = await runModel(
      c.env,
      [
        { role: "system", content: system },
        { role: "user", content: parsed.data.prompt },
      ],
      500,
    );
    if (!result.ok) return c.json(unavailable(result.detail), 503);
    const quotaRemaining = await countQuota(c.env, tenant.id);
    const raw = result.text;

    // Model kadang membungkus JSON dengan pagar kode/teks — ambil objek pertama.
    const match = raw.match(/\{[\s\S]*\}/);
    let modelJson: unknown = null;
    try {
      modelJson = match ? JSON.parse(match[0].replace(/,\s*([}\]])/g, "$1")) : null;
    } catch {
      modelJson = null;
    }
    const draftParsed = modelDraftSchema.safeParse(modelJson);
    if (!draftParsed.success) {
      return c.json({ error: "AI tidak menghasilkan draf yang valid — coba tulis ulang deskripsinya lebih spesifik." }, 422);
    }
    const byCode = new Map(accounts.map((a) => [a.code, a]));
    const lines = [];
    for (const l of draftParsed.data.lines) {
      const acc = byCode.get(l.accountCode);
      if (!acc) {
        return c.json({ error: `AI memakai kode akun tak dikenal (${l.accountCode}) — coba lagi.` }, 422);
      }
      lines.push({ accountId: acc.id, accountCode: acc.code, accountName: acc.name, debit: l.debit, credit: l.credit });
    }
    const totalDebit = lines.reduce((s, l) => s + l.debit, 0);
    const totalCredit = lines.reduce((s, l) => s + l.credit, 0);
    if (totalDebit !== totalCredit || totalDebit === 0) {
      return c.json({ error: "Draf AI tidak seimbang — coba tulis ulang deskripsinya." }, 422);
    }

    const draft: ApiAiJournalDraft = {
      entryDate: new Date().toISOString().slice(0, 10),
      memo: draftParsed.data.memo,
      lines,
    };
    return c.json({ draft, quotaRemaining });
  });
