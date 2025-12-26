// src/lib/minaDownload.ts
// ============================================================================
// Mina download helper (shared by Studio + Profile)
// - Tries fetch -> blob -> <a download>
// - Falls back to direct <a download> if fetch fails (CORS / network)
// ============================================================================

export type MinaDownloadKind = "still" | "motion";

function isHttpUrl(url: string) {
  return /^https?:\/\//i.test(url || "");
}

function isSameOrigin(url: string) {
  try {
    return new URL(url, window.location.href).origin === window.location.origin;
  } catch {
    return false;
  }
}

function getCorsDownloadHosts(): Set<string> {
  const raw = String(import.meta.env.VITE_CORS_DOWNLOAD_HOSTS || "");
  const hosts = raw
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
  return new Set(hosts);
}

function shouldAttemptCorsFetch(url: string) {
  if (isSameOrigin(url)) return true;

  try {
    const u = new URL(url, window.location.href);
    const allowed = getCorsDownloadHosts();
    return allowed.has(u.hostname.toLowerCase());
  } catch {
    return false;
  }
}

function sanitizeForFilename(text: string, maxLen = 80) {
  const base = String(text || "")
    .trim()
    .replace(/[\r\n\t]+/g, " ")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();

  return (base || "mina").slice(0, maxLen);
}

function guessDownloadExt(url: string, fallbackExt: string) {
  const lower = String(url || "").toLowerCase().split("?")[0].split("#")[0];

  if (lower.endsWith(".mp4")) return ".mp4";
  if (lower.endsWith(".webm")) return ".webm";
  if (lower.endsWith(".mov")) return ".mov";
  if (lower.endsWith(".m4v")) return ".m4v";

  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return ".jpg";
  if (lower.endsWith(".png")) return ".png";
  if (lower.endsWith(".gif")) return ".gif";
  if (lower.endsWith(".webp")) return ".webp";
  if (lower.endsWith(".avif")) return ".avif";

  return fallbackExt;
}

function ensureExt(name: string, ext: string) {
  const n = String(name || "").trim();
  if (!n) return `mina${ext}`;
  return n.toLowerCase().endsWith(ext.toLowerCase()) ? n : `${n}${ext}`;
}

/**
 * Force save a URL by downloading it as a blob and triggering an <a download>.
 * If fetch fails (CORS), it falls back to a direct <a download>.
 */
export async function forceSaveUrl(url: string, filename: string) {
  if (!isHttpUrl(url)) throw new Error("Invalid download URL.");

  // Attempt 1: fetch -> blob (best UX)
  try {
    if (!shouldAttemptCorsFetch(url)) {
      throw new Error("SKIP_CORS_FETCH");
    }
    const res = await fetch(url, { mode: "cors" });
    if (!res.ok) throw new Error(`Download failed with ${res.status}`);

    const blob = await res.blob();
    const blobUrl = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    URL.revokeObjectURL(blobUrl);
    return;
  } catch {
    // Attempt 2: direct <a download> (may open in new tab if cross-origin blocks download)
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.rel = "noopener";
    a.target = "_blank";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }
}

/**
 * One-call helper for Mina assets (image/video).
 * Builds a nice filename from kind + prompt, guesses extension from URL.
 */
export async function downloadMinaAsset(params: {
  url: string;
  kind: MinaDownloadKind;
  prompt?: string;
  /** Optional override (without extension is ok) */
  baseNameOverride?: string;
}) {
  const url = String(params.url || "").trim();
  if (!url) throw new Error("Missing download URL.");

  const kind = params.kind;
  const promptSlug = sanitizeForFilename(params.prompt || "", 80);

  const fallbackBase =
    params.baseNameOverride?.trim() ||
    (kind === "motion" ? `mina-motion-${promptSlug}` : `mina-image-${promptSlug}`);

  const fallbackExt = kind === "motion" ? ".mp4" : ".png";
  const ext = guessDownloadExt(url, fallbackExt);
  const filename = ensureExt(fallbackBase, ext);

  await forceSaveUrl(url, filename);
}
