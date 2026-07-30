/**
 * Pemindai barcode lewat kamera (Fase 20i).
 *
 * Memakai `BarcodeDetector` bawaan peramban. Tidak ada pustaka pengurai
 * cadangan — alasannya ditulis di `docs/log/2026-07-30-fase-20i-*.md`, tetapi
 * intinya: cadangan berbasis wasm tidak bisa dijalankan oleh gerbang mana pun
 * yang kita punya (Chromium ui-sim tak punya kamera), sehingga akan masuk repo
 * sebagai kode yang tak pernah terbukti bekerja.
 *
 * Yang WAJIB benar karena itu adalah degradasinya: peramban tanpa detektor,
 * tanpa kamera, atau yang izinnya ditolak harus mendapat penjelasan yang jelas
 * dan tetap bisa berjualan lewat kotak pencarian biasa.
 */

/** Kenapa pemindaian tidak bisa dijalankan; `siap` berarti bisa. */
export type DukunganPindai = "siap" | "tanpa-detektor" | "tanpa-kamera" | "tanpa-izin";

type BarcodeHasil = { rawValue: string };
type BarcodeDetectorLike = { detect(source: CanvasImageSource): Promise<BarcodeHasil[]> };
type BarcodeDetectorCtor = new (opts?: { formats?: string[] }) => BarcodeDetectorLike;

function ctorDetektor(): BarcodeDetectorCtor | null {
  const w = window as unknown as { BarcodeDetector?: BarcodeDetectorCtor };
  return typeof w.BarcodeDetector === "function" ? w.BarcodeDetector : null;
}

/**
 * Apa yang bisa dilakukan peramban ini — diperiksa SEBELUM tombol pindai
 * ditawarkan, supaya kasir tidak menekan tombol yang memang tak akan bekerja.
 *
 * Tidak meminta izin kamera; itu baru terjadi saat pemindaian dimulai.
 */
export function dukunganPindai(): DukunganPindai {
  if (!ctorDetektor()) return "tanpa-detektor";
  if (!navigator.mediaDevices?.getUserMedia) return "tanpa-kamera";
  return "siap";
}

/** Format yang dipakai ritel Indonesia; QR ikut karena banyak dipakai UKM. */
const FORMAT = ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "qr_code"];

export type PemindaiAktif = {
  /** Hentikan pemindaian dan matikan kamera. */
  hentikan: () => void;
};

/**
 * Mulai memindai dari kamera belakang ke `video`, memanggil `onKode` sekali
 * untuk tiap kode yang terbaca.
 *
 * Melempar `DukunganPindai` (bukan `Error`) bila gagal dimulai, supaya
 * pemanggil bisa memilih pesan yang tepat tanpa mengurai teks galat peramban —
 * teks itu berbeda-beda antarperamban dan berubah antarversi.
 */
export async function mulaiPindai(
  video: HTMLVideoElement,
  onKode: (kode: string) => void,
): Promise<PemindaiAktif> {
  const Ctor = ctorDetektor();
  if (!Ctor) throw "tanpa-detektor" satisfies DukunganPindai;
  if (!navigator.mediaDevices?.getUserMedia) throw "tanpa-kamera" satisfies DukunganPindai;

  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "environment" },
      audio: false,
    });
  } catch {
    // Ditolak, dipakai aplikasi lain, atau tidak ada perangkatnya — dari sudut
    // pandang kasir ketiganya sama: kamera tidak bisa dipakai sekarang.
    throw "tanpa-izin" satisfies DukunganPindai;
  }

  video.srcObject = stream;
  await video.play().catch(() => undefined);

  const detektor = new Ctor({ formats: FORMAT });
  let berjalan = true;
  // Kode yang sudah dilaporkan tidak dilaporkan lagi: satu barcode terbaca
  // puluhan kali per detik selama masih di depan lensa, dan tanpa penyaring ini
  // satu kali pindai akan memasukkan barang yang sama berulang ke keranjang.
  const sudah = new Set<string>();

  const putar = async () => {
    while (berjalan) {
      try {
        const hasil = await detektor.detect(video);
        for (const h of hasil) {
          if (h.rawValue && !sudah.has(h.rawValue)) {
            sudah.add(h.rawValue);
            onKode(h.rawValue);
          }
        }
      } catch {
        /* bingkai gagal diurai — lanjut ke bingkai berikutnya */
      }
      await new Promise((r) => setTimeout(r, 250));
    }
  };
  void putar();

  return {
    hentikan: () => {
      berjalan = false;
      for (const t of stream.getTracks()) t.stop();
      video.srcObject = null;
    },
  };
}
