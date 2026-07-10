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

const AI_MODEL = "@cf/meta/llama-3.1-8b-instruct";
const DAILY_LIMIT = 50;

const AI_UNAVAILABLE = { error: "Fitur AI belum tersedia di lingkungan ini. Coba lagi nanti." } as const;

/** Kuota harian per tenant di KV — melindungi jatah neuron gratis. */
async function underQuota(env: Env, tenantId: string): Promise<boolean> {
  const key = `ai:${tenantId}:${new Date().toISOString().slice(0, 10)}`;
  const used = Number((await env.RATE_KV.get(key)) ?? 0);
  if (used >= DAILY_LIMIT) return false;
  await env.RATE_KV.put(key, String(used + 1), { expirationTtl: 172_800 });
  return true;
}

type ChatMessage = { role: string; content: string };

async function runModel(env: Env, messages: ChatMessage[], maxTokens: number): Promise<string | null> {
  if (!env.AI) return null;
  try {
    const res = (await env.AI.run(AI_MODEL, { messages, max_tokens: maxTokens })) as { response?: string } | null;
    return typeof res?.response === "string" ? res.response : null;
  } catch {
    // Termasuk dev lokal tanpa kredensial remote — perlakukan sama: layanan absen.
    return null;
  }
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
    if (!c.env.AI) return c.json(AI_UNAVAILABLE, 503);
    const parsed = aiChatSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) {
      return c.json({ error: "Data tidak valid", issues: parsed.error.flatten().fieldErrors }, 400);
    }
    const tenant = c.get("tenant");
    if (!(await underQuota(c.env, tenant.id))) {
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

    const reply = await runModel(c.env, [{ role: "system", content: system }, ...parsed.data.messages], 600);
    if (reply === null) return c.json(AI_UNAVAILABLE, 503);
    return c.json({ reply: reply.trim() });
  })

  // -------------------------------------------------------------------------
  // Draf jurnal dari bahasa alami — usulan tervalidasi, TIDAK diposting.
  // -------------------------------------------------------------------------
  .post("/:tenantId/ai/jurnal", requireAuth, requireTenantRole("admin"), async (c) => {
    if (!c.env.AI) return c.json(AI_UNAVAILABLE, 503);
    const parsed = aiJurnalSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) {
      return c.json({ error: "Data tidak valid", issues: parsed.error.flatten().fieldErrors }, 400);
    }
    const tenant = c.get("tenant");
    if (!(await underQuota(c.env, tenant.id))) {
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

    const raw = await runModel(
      c.env,
      [
        { role: "system", content: system },
        { role: "user", content: parsed.data.prompt },
      ],
      500,
    );
    if (raw === null) return c.json(AI_UNAVAILABLE, 503);

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
    return c.json({ draft });
  });
