/**
 * Pembuat arsip ZIP minimal untuk Worker (Fase 8b — ekspor data).
 * Metode "store" (tanpa kompresi) + CRC32 — porting dari penulis .xlsx sisi
 * klien yang sudah teruji (apps/web `downloadXlsx`). Cukup untuk data UMKM
 * berukuran megabita; seluruh arsip dibangun di memori.
 */

const CRC_TABLE: number[] = (() => {
  const t: number[] = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export type ZipEntry = { path: string; data: Uint8Array };

/** Susun berkas ZIP (store) dari daftar entri. */
export function buildZip(entries: ZipEntry[]): Uint8Array {
  const enc = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;

  const u16 = (n: number) => new Uint8Array([n & 0xff, (n >>> 8) & 0xff]);
  const u32 = (n: number) =>
    new Uint8Array([n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff]);
  const concat = (arrs: Uint8Array[]) => {
    const total = arrs.reduce((s, a) => s + a.length, 0);
    const out = new Uint8Array(total);
    let p = 0;
    for (const a of arrs) {
      out.set(a, p);
      p += a.length;
    }
    return out;
  };

  for (const entry of entries) {
    const nameBytes = enc.encode(entry.path);
    const crc = crc32(entry.data);
    const size = entry.data.length;
    const local = concat([
      u32(0x04034b50),
      u16(20),
      u16(0),
      u16(0), // metode: store
      u16(0),
      u16(0x21),
      u32(crc),
      u32(size),
      u32(size),
      u16(nameBytes.length),
      u16(0),
      nameBytes,
      entry.data,
    ]);
    chunks.push(local);

    central.push(
      concat([
        u32(0x02014b50),
        u16(20),
        u16(20),
        u16(0),
        u16(0),
        u16(0),
        u16(0x21),
        u32(crc),
        u32(size),
        u32(size),
        u16(nameBytes.length),
        u16(0),
        u16(0),
        u16(0),
        u16(0),
        u32(0),
        u32(offset),
        nameBytes,
      ]),
    );
    offset += local.length;
  }

  const centralBytes = concat(central);
  const eocd = concat([
    u32(0x06054b50),
    u16(0),
    u16(0),
    u16(entries.length),
    u16(entries.length),
    u32(centralBytes.length),
    u32(offset),
    u16(0),
  ]);
  return concat([concat(chunks), centralBytes, eocd]);
}
