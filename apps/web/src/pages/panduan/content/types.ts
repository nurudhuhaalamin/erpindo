/** Struktur konten panduan — satu sumber kebenaran untuk halaman /panduan
 *  dan ekspor Markdown ke docs/panduan/ (scripts/export-panduan-md.mjs). */

export type GuideSection = {
  heading: string;
  /** Paragraf penjelasan. */
  body?: string[];
  /** Langkah bernomor. */
  steps?: string[];
  /** Tips / hal yang perlu diperhatikan. */
  tips?: string[];
  /** Gambar tangkapan layar, path publik mis. /panduan/pos-1.webp. */
  image?: string;
  imageAlt?: string;
};

export type GuideModule = {
  slug: string;
  title: string;
  /** Rute halaman terkait di aplikasi (untuk tombol "Buka di aplikasi"). */
  appPath?: string;
  intro: string;
  sections: GuideSection[];
};
