export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Inline markdown pada teks yang SUDAH di-escape: kode, tebal, miring, tautan http(s). */
function inlineMd(escaped: string): string {
  return escaped
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" rel="noopener">$1</a>');
}

/**
 * Renderer Markdown subset homegrown untuk blog (Fase 10e) — ESCAPE-FIRST
 * sehingga aman XSS by construction: seluruh input di-escape sebelum pola
 * markdown diterjemahkan; tautan dibatasi http(s). Dipakai Worker (SSR /blog)
 * dan pratinjau editor di web (fungsi yang sama, tanpa duplikasi).
 */
export function renderMarkdown(md: string): string {
  const out: string[] = [];
  let list: string[] | null = null;
  let para: string[] = [];
  const flushPara = () => {
    if (para.length > 0) {
      out.push(`<p>${inlineMd(escapeHtml(para.join(" ")))}</p>`);
      para = [];
    }
  };
  const flushList = () => {
    if (list) {
      out.push(`<ul>${list.map((li) => `<li>${inlineMd(escapeHtml(li))}</li>`).join("")}</ul>`);
      list = null;
    }
  };
  for (const rawLine of md.split(/\r?\n/)) {
    const line = rawLine.trimEnd();
    const heading = /^(#{1,3})\s+(.+)$/.exec(line);
    const item = /^[-*]\s+(.+)$/.exec(line);
    if (heading) {
      flushPara();
      flushList();
      const level = heading[1]!.length + 1; // # → h2 (h1 dipakai judul halaman)
      out.push(`<h${level}>${inlineMd(escapeHtml(heading[2]!))}</h${level}>`);
    } else if (item) {
      flushPara();
      (list ??= []).push(item[1]!);
    } else if (line.trim() === "") {
      flushPara();
      flushList();
    } else {
      flushList();
      para.push(line.trim());
    }
  }
  flushPara();
  flushList();
  return out.join("\n");
}

/** Ubah nama perusahaan menjadi slug subdomain yang aman. */
export function toSlug(name: string): string {
  return (
    name
      .toLowerCase()
      .normalize("NFKD")
      // Buang tanda diakritik hasil dekomposisi NFKD (é → e + ́) agar tidak menjadi "-".
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40)
      .replace(/-+$/g, "") || "perusahaan"
  );
}
