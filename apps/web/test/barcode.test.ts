import { afterEach, describe, expect, it, vi } from "vitest";
import { dukunganPindai, mulaiPindai } from "../src/lib/barcode";

/**
 * Pemindai barcode (Fase 20i). Yang diuji di sini BUKAN penguraian gambar —
 * itu milik peramban — melainkan **degradasinya**: peramban tanpa detektor,
 * tanpa kamera, atau yang izinnya ditolak harus menghasilkan sebab yang
 * berbeda-beda, karena tiap sebab menuntut kalimat yang berbeda ke kasir.
 *
 * Ini bagian yang paling mudah salah dan paling tidak terlihat: di Chromium
 * ui-sim (tanpa kamera) jalur suksesnya tidak pernah berjalan sama sekali.
 */

class DetektorPalsu {
  static hasil: { rawValue: string }[] = [];
  detect() {
    return Promise.resolve(DetektorPalsu.hasil);
  }
}

function pasangLingkungan(opts: { detektor?: boolean; kamera?: boolean | "tolak" }) {
  const w = globalThis as unknown as Record<string, unknown>;
  if (opts.detektor) w.BarcodeDetector = DetektorPalsu;
  else delete w.BarcodeDetector;

  const nav = { mediaDevices: undefined as unknown } as { mediaDevices: unknown };
  if (opts.kamera === true) {
    nav.mediaDevices = {
      getUserMedia: () => Promise.resolve({ getTracks: () => [{ stop: () => {} }] } as unknown),
    };
  } else if (opts.kamera === "tolak") {
    nav.mediaDevices = { getUserMedia: () => Promise.reject(new Error("NotAllowedError")) };
  }
  vi.stubGlobal("navigator", nav);
  vi.stubGlobal("window", w);
}

afterEach(() => {
  vi.unstubAllGlobals();
  delete (globalThis as unknown as Record<string, unknown>).BarcodeDetector;
});

describe("dukunganPindai (Fase 20i)", () => {
  it("peramban tanpa BarcodeDetector dilaporkan 'tanpa-detektor'", () => {
    pasangLingkungan({ detektor: false, kamera: true });
    expect(dukunganPindai()).toBe("tanpa-detektor");
  });

  it("ada detektor tetapi tanpa akses kamera dilaporkan 'tanpa-kamera'", () => {
    pasangLingkungan({ detektor: true, kamera: false });
    expect(dukunganPindai()).toBe("tanpa-kamera");
  });

  it("keduanya ada dilaporkan 'siap'", () => {
    pasangLingkungan({ detektor: true, kamera: true });
    expect(dukunganPindai()).toBe("siap");
  });

  it("pemeriksaan dukungan TIDAK meminta izin kamera", async () => {
    const getUserMedia = vi.fn();
    (globalThis as unknown as Record<string, unknown>).BarcodeDetector = DetektorPalsu;
    vi.stubGlobal("navigator", { mediaDevices: { getUserMedia } });
    vi.stubGlobal("window", globalThis);
    expect(dukunganPindai()).toBe("siap");
    expect(getUserMedia).not.toHaveBeenCalled();
  });
});

describe("mulaiPindai (Fase 20i)", () => {
  const videoPalsu = () =>
    ({ srcObject: null, play: () => Promise.resolve() }) as unknown as HTMLVideoElement;

  it("izin kamera ditolak dilempar sebagai 'tanpa-izin', bukan galat peramban", async () => {
    pasangLingkungan({ detektor: true, kamera: "tolak" });
    // Sengaja BUKAN Error: pesan galat peramban berbeda antarperamban dan
    // berubah antarversi, jadi tidak boleh jadi dasar pemilihan kalimat.
    await expect(mulaiPindai(videoPalsu(), () => {})).rejects.toBe("tanpa-izin");
  });

  it("tanpa detektor dilempar 'tanpa-detektor' sebelum kamera disentuh", async () => {
    const getUserMedia = vi.fn();
    delete (globalThis as unknown as Record<string, unknown>).BarcodeDetector;
    vi.stubGlobal("navigator", { mediaDevices: { getUserMedia } });
    vi.stubGlobal("window", globalThis);
    await expect(mulaiPindai(videoPalsu(), () => {})).rejects.toBe("tanpa-detektor");
    expect(getUserMedia).not.toHaveBeenCalled();
  });
});
