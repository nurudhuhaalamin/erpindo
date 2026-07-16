import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Gerbang struktural RBAC (Fase 9a): middleware auth dipasang per-handler
 * (bukan .use() level router), sehingga SATU registrasi yang lupa memasang
 * requireAuth otomatis menjadi endpoint publik tanpa terlihat. Test ini
 * mem-parse semua file rute dan memastikan tiap registrasi punya penjaga —
 * kecuali daftar putih endpoint yang MEMANG publik / ber-scope user.
 */

const ROUTES_DIR = join(dirname(fileURLToPath(import.meta.url)), "../src/routes");

/** Endpoint yang memang tanpa requireAuth: alur auth publik. */
const PUBLIC_ALLOWLIST = new Set([
  'auth.ts POST "/register"',
  'auth.ts POST "/login"',
  // Sesi demo publik baca-saja (Fase 10b) — rate-limited, hanya membuat sesi
  // viewer di perusahaan demo.
  'auth.ts POST "/demo"',
  // Masuk via Google (Fase 10d) — alur OAuth memang pra-login: /available
  // hanya membaca konfigurasi, "/" me-redirect ke consent Google, /callback
  // memvalidasi state bertanda tangan sebelum membuat sesi.
  'authGoogle.ts GET "/available"',
  'authGoogle.ts GET "/"',
  'authGoogle.ts GET "/callback"',
  'auth.ts POST "/verify"',
  'auth.ts POST "/forgot-password"',
  'auth.ts POST "/reset-password"',
]);

/** Endpoint ber-requireAuth yang memang tanpa role gate: ber-scope user
 *  (profil/2FA/buat perusahaan), lintas-tenant terbatas owner via query
 *  (konsolidasi memfilter ownedTenants), callback OAuth, dan terima undangan. */
const USER_SCOPED_ALLOWLIST = new Set([
  'auth.ts POST "/companies"',
  'auth.ts POST "/logout"',
  'auth.ts GET "/me"',
  'auth.ts PATCH "/profile"',
  'auth.ts POST "/change-password"',
  'auth.ts POST "/2fa/setup"',
  'auth.ts POST "/2fa/enable"',
  'auth.ts POST "/2fa/disable"',
  'consolidation.ts GET "/companies"',
  'consolidation.ts GET "/income-statement"',
  'consolidation.ts GET "/balance-sheet"',
  'drive.ts GET "/callback"',
  'tenants.ts POST "/accept"',
]);

type Registration = { key: string; middleware: string };

function collectRegistrations(): Registration[] {
  const regs: Registration[] = [];
  const re = /\.(get|post|put|patch|delete)\(\s*(`[^`]*`|"[^"]*")\s*,([\s\S]*?)(?:async\s*\(|\(c\)\s*=>)/g;
  for (const file of readdirSync(ROUTES_DIR).filter((f) => f.endsWith(".ts"))) {
    const source = readFileSync(join(ROUTES_DIR, file), "utf8");
    let m: RegExpExecArray | null;
    while ((m = re.exec(source)) !== null) {
      const path = m[2]!.startsWith("`") ? `"${m[2]!.slice(1, -1)}"` : m[2]!;
      regs.push({ key: `${file} ${m[1]!.toUpperCase()} ${path}`, middleware: m[3]! });
    }
  }
  return regs;
}

describe("penjaga RBAC per-registrasi rute", () => {
  const regs = collectRegistrations();

  it("parser menemukan registrasi dalam jumlah wajar (regresi parser)", () => {
    // Saat ini 220 registrasi; bila parser rusak (mis. gaya penulisan berubah)
    // angka anjlok dan test ini gagal lebih dulu daripada diam-diam melewatkan.
    expect(regs.length).toBeGreaterThanOrEqual(200);
  });

  it("semua endpoint non-publik memakai requireAuth", () => {
    const missing = regs
      .filter((r) => !r.middleware.includes("requireAuth"))
      .map((r) => r.key)
      .filter((k) => !PUBLIC_ALLOWLIST.has(k));
    expect(missing).toEqual([]);
  });

  it("semua endpoint ber-auth non-user-scoped memakai role gate", () => {
    const missing = regs
      .filter(
        (r) =>
          r.middleware.includes("requireAuth") &&
          !r.middleware.includes("requireTenantRole") &&
          !r.middleware.includes("requirePermission"),
      )
      .map((r) => r.key)
      .filter((k) => !USER_SCOPED_ALLOWLIST.has(k));
    expect(missing).toEqual([]);
  });

  it("daftar putih tidak mengandung entri basi", () => {
    const keys = new Set(regs.map((r) => r.key));
    const stale = [...PUBLIC_ALLOWLIST, ...USER_SCOPED_ALLOWLIST].filter((k) => !keys.has(k));
    expect(stale).toEqual([]);
  });
});
