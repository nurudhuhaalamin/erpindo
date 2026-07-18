import { z } from "zod";

// ---------------------------------------------------------------------------
// Dukungan/masukan + blog SEO (Fase 10e)
// ---------------------------------------------------------------------------

export const FEEDBACK_CATEGORIES = ["saran", "bug", "pertanyaan"] as const;
export type FeedbackCategory = (typeof FEEDBACK_CATEGORIES)[number];
export const FEEDBACK_CATEGORY_LABELS: Record<FeedbackCategory, string> = {
  saran: "Saran fitur",
  bug: "Laporan bug",
  pertanyaan: "Pertanyaan",
};
export const FEEDBACK_STATUSES = ["baru", "dibaca", "selesai"] as const;
export type FeedbackStatus = (typeof FEEDBACK_STATUSES)[number];
export const FEEDBACK_STATUS_LABELS: Record<FeedbackStatus, string> = {
  baru: "Baru",
  dibaca: "Dibaca",
  selesai: "Selesai",
};

export const feedbackSchema = z.object({
  category: z.enum(FEEDBACK_CATEGORIES),
  message: z.string().trim().min(5, "Ceritakan minimal 5 karakter").max(2000, "Maksimal 2000 karakter"),
  pagePath: z.string().trim().max(200).optional(),
  tenantId: z.string().max(64).optional(),
});
export type FeedbackInput = z.infer<typeof feedbackSchema>;

export type ApiFeedback = {
  id: string;
  category: FeedbackCategory;
  message: string;
  pagePath: string | null;
  status: FeedbackStatus;
  adminNote: string | null;
  createdAt: string;
  /** Terisi hanya pada daftar admin. */
  userName?: string | null;
  userEmail?: string | null;
  tenantName?: string | null;
};

export const blogPostSchema = z.object({
  slug: z.string().regex(/^[a-z0-9-]{3,80}$/, "Slug: huruf kecil, angka, tanda hubung (3–80 karakter)"),
  title: z.string().trim().min(3, "Judul minimal 3 karakter").max(160),
  excerpt: z.string().trim().max(300).optional(),
  bodyMd: z.string().min(10, "Isi artikel minimal 10 karakter").max(60_000),
  coverUrl: z.string().trim().url("URL sampul tidak valid").max(500).optional().or(z.literal("")),
});
export type BlogPostInput = z.infer<typeof blogPostSchema>;

export type ApiBlogPost = {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  bodyMd: string;
  coverUrl: string | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

/** Escape HTML — dipakai renderer markdown & SSR blog. */
