// src/lib/minaDownload.ts
// Robust “force download” for BOTH images + videos (no window.open fallback).
// - Uses fetch -> blob -> <a download>
// - If direct fetch fails (CORS), optionally tries backend proxy: GET {API_BASE_URL}/public/download?url=...

export type MinaDownloadKind = "still" | "motion";

type DownloadOpts = {
  url: string;
  kind: MinaDownloadKind;
  prompt?: string;
  baseNameOverride?: string;
};

const normalizeBase = (raw?: string | null) => {
  if (!raw) return "";
  return raw.endsWith("/") ? raw.slice(0, -1) : raw;
};

const API_BASE_URL = (() => {
  const envBase = normalizeBase(
    (import.meta as any).env?.VITE_MINA_API_BASE_URL ||
      (import.meta as any).env?.VITE_API_BASE_URL ||
      (import.meta as any).env?.VITE_BACKEND_URL
  );
  return envBase || "";
})();

function safeString(v: any, fallback = ""): string {
  if (v === null || v === undefined) return fallback;
  const s = String(v);
  return s === "undefined" || s === "null" ? fallback : s;
}

function sanitizeFilename(name: string) {
  return name
    .replace(/[\/\\?%*:|"<>]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

function slugFromPrompt(prompt: string) {
  const p = (prompt || "").trim();
  if (!p) return "";
  return p
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48);
}

function extFromUrl(url: string) {
  try {
    const u = new URL(url);
    const p = u.pathname.toLowerCase();
    const m = p.match(/\.([a-z0-9]{2,5})$/i);
    return m ? `.${m[1]}` : "";
  } catch {
    const p = String(url || "").split("?")[0].split("#")[0].toLowerCase();
    const m = p.match(/\.([a-z0-9]{2,5})$/i);
    return m ? `.${m[1]}` : "";
  }
}

function extFromContentType(ct: string, fallback: string) {
  const c = (ct || "").toLowerCase();
  if (c.includes("video/mp4")) return ".mp4";
  if (c.includes("video/webm")) return ".webm";
  if (c.includes("video/quicktime")) return ".mov";
  if (c.includes("image/jpeg")) return ".jpg";
  if (c.includes("image/png")) return ".png";
  if (c.includes("image/webp")) return ".webp";
  if (c.includes("image/gif")) return ".gif";
  return fallback;
}

function forceDownloadBlob(blob: Blob, filename: string) {
  const name = sanitizeFilename(filename || "Mina_export");

  // IE legacy
  // @ts-ignore
  if (typeof (window as any).navigator?.msSaveOrOpenBlob === "function") {
    // @ts-ignore
    (window as any).navigator.msSaveOrOpenBlob(blob, name);
    return;
  }

  const blobUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = blobUrl;
  a.download = name;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();

  window.setTimeout(() => {
    try {
      URL.revokeObjectURL(blobUrl);
    } catch {
      // ignore
    }
  }, 1500);
}

async function fetchAsBlob(url: string): Promise<{ blob: Blob; contentType: string }> {
  const res = await fetch(url, {
    method: "GET",
    mode: "cors",
    credentials: "omit",
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`Download fetch failed (${res.status})`);
  }

  const contentType = res.headers.get("content-type") || "";
  const blob = await res.blob();
  return { blob, contentType };
}

function buildName(opts: DownloadOpts, extGuess: string) {
  const base =
    safeString(opts.baseNameOverride, "") ||
    (opts.kind === "motion" ? "Mina_video" : "Mina_image");

  const slug = slugFromPrompt(safeString(opts.prompt, ""));
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);

  const core = slug ? `${base}_${slug}_${stamp}` : `${base}_${stamp}`;
  const ext = extGuess || (opts.kind === "motion" ? ".mp4" : ".jpg");

  return core.endsWith(ext) ? core : `${core}${ext}`;
}

export async function downloadMinaAsset(opts: DownloadOpts): Promise<void> {
  const url = String(opts?.url || "").trim();
  if (!url) throw new Error("Missing url");

  // 1) Try direct fetch -> blob
  try {
    const urlExt = extFromUrl(url) || (opts.kind === "motion" ? ".mp4" : ".jpg");
    const { blob, contentType } = await fetchAsBlob(url);
    const ext = extFromContentType(contentType, urlExt);
    forceDownloadBlob(blob, buildName(opts, ext));
    return;
  } catch (e1) {
    // 2) Optional: try backend proxy (if you add it)
    // This avoids CORS issues on third-party image hosts.
    if (API_BASE_URL) {
      try {
        const proxy = `${API_BASE_URL}/public/download?url=${encodeURIComponent(url)}`;
        const urlExt = extFromUrl(url) || (opts.kind === "motion" ? ".mp4" : ".jpg");
        const { blob, contentType } = await fetchAsBlob(proxy);
        const ext = extFromContentType(contentType, urlExt);
        forceDownloadBlob(blob, buildName(opts, ext));
        return;
      } catch (e2) {
        throw e1 instanceof Error ? e1 : new Error("Download failed");
      }
    }

    throw e1 instanceof Error ? e1 : new Error("Download failed");
  }
}
