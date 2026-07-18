import { aiChatSchema, aiJurnalSchema, aiReportSchema, PLAN_LIMITS, type ApiAiJournalDraft, type Plan } from "@erpindo/shared";
import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv, Env } from "../env";
import { pickRelevant } from "../lib/guideKnowledge";
import { monthStart, profitLoss } from "../lib/reports";
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

/** Kuota AI harian per paket (Fase 13a) — Starter 25, Business 100, Enterprise 250, Trial 100. */
function aiDailyLimit(plan: Plan): number {
  return PLAN_LIMITS[plan].aiDailyLimit;
}

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

async function quotaExceeded(env: Env, tenantId: string, limit: number): Promise<boolean> {
  return (await quotaUsed(env, tenantId)) >= limit;
}

/** Dipanggil HANYA setelah model sukses — panggilan gagal tidak memakan kuota.
 * Mengembalikan sisa kuota hari ini agar UI bisa menampilkannya. */
async function countQuota(env: Env, tenantId: string, limit: number): Promise<number> {
  const key = quotaKey(tenantId);
  const used = (await quotaUsed(env, tenantId)) + 1;
  await env.RATE_KV.put(key, String(used), { expirationTtl: 172_800 });
  return Math.max(limit - used, 0);
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
    if (await quotaExceeded(c.env, tenant.id, aiDailyLimit(tenant.plan))) {
      return c.json({ error: `Kuota asisten AI hari ini habis (${aiDailyLimit(tenant.plan)} pertanyaan/hari). Coba lagi besok.` }, 429);
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
    const quotaRemaining = await countQuota(c.env, tenant.id, aiDailyLimit(tenant.plan));
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
    if (await quotaExceeded(c.env, tenant.id, aiDailyLimit(tenant.plan))) {
      return c.json({ error: `Kuota asisten AI hari ini habis (${aiDailyLimit(tenant.plan)} permintaan/hari). Coba lagi besok.` }, 429);
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
    const quotaRemaining = await countQuota(c.env, tenant.id, aiDailyLimit(tenant.plan));
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
  })

  // -------------------------------------------------------------------------
  // Tanya laporan (Fase 11c): jawab pertanyaan keuangan dalam bahasa natural,
  // di-grounding pada RINGKASAN BUKU NYATA. Read-only & aman — model hanya
  // meringkas angka yang kita hitung sendiri, tidak boleh mengarang.
  // -------------------------------------------------------------------------
  .post("/:tenantId/ai/laporan", requireAuth, requireTenantRole("viewer"), async (c) => {
    if (!c.env.AI) return c.json(unavailable("binding-absent"), 503);
    const parsed = aiReportSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) {
      return c.json({ error: "Data tidak valid", issues: parsed.error.flatten().fieldErrors }, 400);
    }
    const tenant = c.get("tenant");
    if (await quotaExceeded(c.env, tenant.id, aiDailyLimit(tenant.plan))) {
      return c.json({ error: `Kuota asisten AI hari ini habis (${aiDailyLimit(tenant.plan)} pertanyaan/hari). Coba lagi besok.` }, 429);
    }

    const db = getTenantDb(c.env, tenant.dbRef);
    const snapshot = await buildReportSnapshot(db);

    const system = [
      "Kamu asisten keuangan ERPindo untuk UMKM Indonesia.",
      "Jawab pertanyaan pengguna HANYA berdasarkan DATA RINGKAS di bawah — JANGAN mengarang angka.",
      "Bila data tidak memuat jawabannya, katakan terus terang bahwa datanya belum tersedia dan sarankan buka menu Laporan terkait.",
      "Jawab SINGKAT (maks ±120 kata) dalam bahasa Indonesia, sebutkan angka rupiah yang relevan.",
      `DATA RINGKAS BUKU (per ${new Date().toISOString().slice(0, 10)}):\n${snapshot}`,
    ].join("\n\n");

    const result = await runModel(
      c.env,
      [
        { role: "system", content: system },
        { role: "user", content: parsed.data.question },
      ],
      500,
    );
    if (!result.ok) return c.json(unavailable(result.detail), 503);
    const quotaRemaining = await countQuota(c.env, tenant.id, aiDailyLimit(tenant.plan));
    return c.json({ reply: result.text.trim(), quotaRemaining });
  })

  // -------------------------------------------------------------------------
  // Ringkasan bisnis mingguan (Fase 12f): narasi bahasa alami di dashboard,
  // di-grounding pada angka minggu ini vs minggu lalu. Cache KV per minggu —
  // on-demand (bukan cron) sehingga tenant pasif tidak membakar neuron, dan
  // hit cache tidak memakan kuota harian (≈1 panggilan model/tenant/minggu).
  // -------------------------------------------------------------------------
  .get("/:tenantId/ai/ringkasan-mingguan", requireAuth, requireTenantRole("viewer"), async (c) => {
    const tenant = c.get("tenant");
    const week = currentWeekStart();
    const cacheKey = `ai:weekly:${tenant.id}:${week}`;

    // Cache dulu — ringkasan minggu berjalan tetap tersaji walau AI sedang absen.
    const cached = await c.env.RATE_KV.get(cacheKey);
    if (cached) {
      const parsedCache = JSON.parse(cached) as { summary: string; generatedAt: string };
      return c.json({ ...parsedCache, cached: true });
    }

    if (!c.env.AI) return c.json(unavailable("binding-absent"), 503);
    if (await quotaExceeded(c.env, tenant.id, aiDailyLimit(tenant.plan))) {
      return c.json({ error: `Kuota asisten AI hari ini habis (${aiDailyLimit(tenant.plan)} pertanyaan/hari). Coba lagi besok.` }, 429);
    }

    const db = getTenantDb(c.env, tenant.dbRef);
    const snapshot = await buildWeeklySnapshot(db, week);

    const system = [
      "Kamu asisten keuangan ERPindo untuk UMKM Indonesia.",
      "Tulis RINGKASAN BISNIS MINGGUAN dalam bahasa Indonesia yang hangat dan mudah dipahami pemilik usaha, ±100 kata, satu paragraf.",
      "Gunakan HANYA angka pada DATA di bawah — JANGAN mengarang angka. Sebutkan perubahan penting dalam persen (naik/turun) dan satu saran singkat yang relevan.",
      `DATA (per ${new Date().toISOString().slice(0, 10)}):\n${snapshot}`,
    ].join("\n\n");

    const result = await runModel(
      c.env,
      [
        { role: "system", content: system },
        { role: "user", content: "Buat ringkasan mingguan untuk dashboard saya." },
      ],
      400,
    );
    if (!result.ok) return c.json(unavailable(result.detail), 503);

    const body = { summary: result.text.trim(), generatedAt: new Date().toISOString() };
    // TTL 8 hari — kunci berganti tiap Senin, sisa cache lama kedaluwarsa sendiri.
    await c.env.RATE_KV.put(cacheKey, JSON.stringify(body), { expirationTtl: 8 * 86_400 });
    const quotaRemaining = await countQuota(c.env, tenant.id, aiDailyLimit(tenant.plan));
    return c.json({ ...body, cached: false, quotaRemaining });
  });

/** Tanggal Senin minggu berjalan (UTC), YYYY-MM-DD — kunci cache mingguan. */
function currentWeekStart(): string {
  const now = new Date();
  const dow = (now.getUTCDay() + 6) % 7; // 0 = Senin
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - dow)).toISOString().slice(0, 10);
}

/**
 * Ringkasan angka minggu ini vs minggu lalu untuk grounding ringkasan mingguan:
 * omzet & jumlah faktur, laba dari jurnal terposting, kas/piutang/hutang,
 * plus 3 produk terlaris minggu ini.
 */
async function buildWeeklySnapshot(db: ReturnType<typeof getTenantDb>, weekStart: string): Promise<string> {
  const shift = (date: string, days: number) => {
    const d = new Date(`${date}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  };
  const nextWeek = shift(weekStart, 7);
  const prevWeek = shift(weekStart, -7);

  const sales = async (from: string, to: string) => {
    const { results } = await db
      .prepare(
        `SELECT COALESCE(SUM(total), 0) AS total, COUNT(*) AS n FROM invoices
         WHERE voided_at IS NULL AND invoice_date >= ? AND invoice_date < ?`,
      )
      .bind(from, to)
      .all<{ total: number; n: number }>();
    return { total: results[0]?.total ?? 0, count: results[0]?.n ?? 0 };
  };

  const [curSales, prevSales, curPl, prevPl, balRows, topRows] = await Promise.all([
    sales(weekStart, nextWeek),
    sales(prevWeek, weekStart),
    profitLoss(db, weekStart, nextWeek),
    profitLoss(db, prevWeek, weekStart),
    db
      .prepare(
        `SELECT a.code AS code, SUM(jl.debit - jl.credit) AS bal
         FROM journal_lines jl JOIN accounts a ON a.id = jl.account_id
         JOIN journal_entries e ON e.id = jl.entry_id
         WHERE e.status = 'posted' AND a.code IN ('1-1000','1-1100','1-1200','2-1000')
         GROUP BY a.code`,
      )
      .all<{ code: string; bal: number }>(),
    db
      .prepare(
        `SELECT p.name AS name, SUM(il.qty) AS qty, SUM(il.amount) AS revenue
         FROM invoice_lines il
         JOIN invoices i ON i.id = il.invoice_id
         JOIN products p ON p.id = il.product_id
         WHERE i.voided_at IS NULL AND i.invoice_date >= ? AND i.invoice_date < ?
         GROUP BY p.id ORDER BY revenue DESC LIMIT 3`,
      )
      .bind(weekStart, nextWeek)
      .all<{ name: string; qty: number; revenue: number }>(),
  ]);

  const balByCode = new Map(balRows.results.map((b) => [b.code, b.bal ?? 0]));
  const rp = (n: number) => `Rp ${Math.round(n).toLocaleString("id-ID")}`;
  const cash = (balByCode.get("1-1000") ?? 0) + (balByCode.get("1-1100") ?? 0);
  const ar = balByCode.get("1-1200") ?? 0;
  const ap = -(balByCode.get("2-1000") ?? 0);
  const top =
    topRows.results.length > 0
      ? topRows.results.map((t) => `${t.name} (${t.qty} unit, ${rp(t.revenue)})`).join("; ")
      : "belum ada";

  return [
    `Minggu ini (mulai ${weekStart}): omzet ${rp(curSales.total)} dari ${curSales.count} faktur; pendapatan ${rp(curPl.income)}, beban ${rp(curPl.expense)}, laba ${rp(curPl.profit)}.`,
    `Minggu lalu (mulai ${prevWeek}): omzet ${rp(prevSales.total)} dari ${prevSales.count} faktur; laba ${rp(prevPl.profit)}.`,
    `Saldo kas & bank: ${rp(cash)}. Piutang: ${rp(ar)}. Hutang: ${rp(ap)}.`,
    `Produk terlaris minggu ini: ${top}.`,
  ].join("\n");
}

/**
 * Ringkasan angka buku untuk grounding AI laporan (Fase 11c). Semua dari jurnal
 * TERPOSTING. Bulan ini vs bulan lalu (pendapatan/beban/laba) + saldo kas/bank,
 * piutang, hutang. Dikembalikan sebagai teks ringkas berbahasa Indonesia.
 */
async function buildReportSnapshot(db: ReturnType<typeof getTenantDb>): Promise<string> {
  const curStart = monthStart(0);
  const nextStart = monthStart(1);
  const prevStart = monthStart(-1);

  const { results: bal } = await db
    .prepare(
      `SELECT a.code AS code, a.name AS name, SUM(jl.debit - jl.credit) AS bal
       FROM journal_lines jl JOIN accounts a ON a.id = jl.account_id
       JOIN journal_entries e ON e.id = jl.entry_id
       WHERE e.status = 'posted' AND a.code IN ('1-1000','1-1100','1-1200','2-1000')
       GROUP BY a.code, a.name`,
    )
    .all<{ code: string; name: string; bal: number }>();
  const balByCode = new Map(bal.map((b) => [b.code, b.bal ?? 0]));

  const [cur, prev] = await Promise.all([profitLoss(db, curStart, nextStart), profitLoss(db, prevStart, curStart)]);
  const rp = (n: number) => `Rp ${Math.round(n).toLocaleString("id-ID")}`;
  const cash = (balByCode.get("1-1000") ?? 0) + (balByCode.get("1-1100") ?? 0);
  const ar = balByCode.get("1-1200") ?? 0;
  const ap = -(balByCode.get("2-1000") ?? 0); // hutang: saldo normal kredit

  return [
    `Bulan ini (${curStart.slice(0, 7)}): pendapatan ${rp(cur.income)}, beban ${rp(cur.expense)}, laba bersih ${rp(cur.profit)}.`,
    `Bulan lalu (${prevStart.slice(0, 7)}): pendapatan ${rp(prev.income)}, beban ${rp(prev.expense)}, laba bersih ${rp(prev.profit)}.`,
    `Saldo kas & bank saat ini: ${rp(cash)}.`,
    `Piutang usaha (belum tertagih): ${rp(ar)}. Hutang usaha (belum dibayar): ${rp(ap)}.`,
  ].join("\n");
}
