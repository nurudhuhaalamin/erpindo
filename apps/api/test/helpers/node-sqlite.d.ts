/**
 * Deklarasi ambient minimal untuk `node:sqlite` (Node built-in, Fase 14a) —
 * @types/node terpasang belum memuatnya, dan tsconfig hanya memakai
 * @cloudflare/workers-types. Hanya bagian yang dipakai harness uji.
 */
declare module "node:sqlite" {
  interface StatementSync {
    all(...params: unknown[]): unknown[];
    get(...params: unknown[]): unknown;
    run(...params: unknown[]): { changes: number | bigint; lastInsertRowid: number | bigint };
  }
  export class DatabaseSync {
    constructor(location: string, options?: { enableForeignKeyConstraints?: boolean });
    prepare(sql: string): StatementSync;
    exec(sql: string): void;
    close(): void;
  }
}
