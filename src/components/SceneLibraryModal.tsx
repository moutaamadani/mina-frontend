// src/components/SceneLibraryModal.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import "./SceneLibraryModal.css";

export type SceneLibItem = {
  id: string;
  title: string;
  url: string;
  keywords: string[];
};

function safeString(v: any, fallback = ""): string {
  if (v === null || v === undefined) return fallback;
  const s = String(v).trim();
  if (!s || s === "null" || s === "undefined") return fallback;
  return s;
}

// Cloudflare thumb (same style as Profile)
function cfThumb(url: string, width = 900, quality = 70) {
  if (!url) return url;
  if (!url.includes("assets.faltastudio.com/")) return url;
  if (url.includes("/cdn-cgi/image/")) return url;
  const path = url.replace("https://assets.faltastudio.com/", "");
  return `https://assets.faltastudio.com/cdn-cgi/image/width=${width},quality=${quality},format=auto/${path}`;
}

// For input safety (downloads faster)
function cfInput1080(url: string) {
  const u = safeString(url, "");
  if (!u) return "";
  if (!u.includes("assets.faltastudio.com/")) return u;
  if (u.includes("/cdn-cgi/image/")) return u;

  const path = u.replace("https://assets.faltastudio.com/", "");
  const opts = "width=1080,fit=scale-down,quality=85,format=jpeg,onerror=redirect";
  return `https://assets.faltastudio.com/cdn-cgi/image/${opts}/${path}`;
}

function parseSceneLibrary(raw: string): SceneLibItem[] {
  const s = safeString(raw, "");
  if (!s) return [];

  // Option A: proper JSON array
  if (s.trim().startsWith("[")) {
    try {
      const arr = JSON.parse(s);
      if (!Array.isArray(arr)) return [];
      return arr
        .map((x: any) => {
          const id = safeString(x?.id, "");
          const title = safeString(x?.title, "");
          const url = safeString(x?.url, "");
          const kw = x?.keywords;
          const keywords =
            Array.isArray(kw)
              ? kw
                  .map(String)
                  .map((k) => k.trim())
                  .filter(Boolean)
              : typeof kw === "string"
                ? kw
                    .split(/[,|]/)
                    .map((k) => k.trim())
                    .filter(Boolean)
                : [];
          if (!id || !url) return null;
          return { id, title: title || id, url, keywords };
        })
        .filter(Boolean) as SceneLibItem[];
    } catch {
      return [];
    }
  }

  // Option B: your pipe format:
  // "ID,title,url,keywords|ID,title,url,keywords|..."
  const items = s
    .split("|")
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((chunk) => {
      const parts = chunk.split(",").map((p) => p.trim());
      const id = safeString(parts[0], "");
      const title = safeString(parts[1], "");
      const url = safeString(parts[2], "");
      const kwRaw = parts.slice(3).join(",").trim();
      const keywords = kwRaw
        ? kwRaw
            .split(/[,;]/)
            .map((k) => k.trim())
            .filter(Boolean)
        : [];
      if (!id || !url) return null;
      return { id, title: title || id, url, keywords };
    })
    .filter(Boolean) as SceneLibItem[];

  // Dedup by url
  const seen = new Set<string>();
  const out: SceneLibItem[] = [];
  for (const it of items) {
    const key = it.url;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(it);
  }
  return out;
}

function getScrollParent(node: HTMLElement | null): HTMLElement | null {
  let el: HTMLElement | null = node?.parentElement || null;
  while (el) {
    const style = window.getComputedStyle(el);
    const oy = style.overflowY;
    const isScrollable = oy === "auto" || oy === "scroll" || oy === "overlay";
    if (isScrollable && el.scrollHeight > el.clientHeight + 10) return el;
    el = el.parentElement;
  }
  return null;
}

type Props = {
  open: boolean;
  onClose: () => void;

  // When user selects a scene => call your "set scene" function
  onPickScene: (sceneUrl: string, item: SceneLibItem) => void;

  // env var name (vite requires VITE_)
  envKey?: string;

  // optional: start preview selected url
  initialPreviewUrl?: string | null;
};

export default function SceneLibraryModal({
  open,
  onClose,
  onPickScene,
  envKey = "VITE_SCENE_LIBRARY_JSON",
  initialPreviewUrl = null,
}: Props) {
  const raw = (import.meta as any)?.env?.[envKey] || "";
  const allScenes = useMemo(() => parseSceneLibrary(String(raw || "")), [raw]);

  const [visibleCount, setVisibleCount] = useState(36);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const gridScrollRef = useRef<HTMLDivElement | null>(null);

  // reset when opening
  useEffect(() => {
    if (!open) return;
    setVisibleCount(36);
    setHoveredId(null);
  }, [open]);

  // close on ESC
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const visibleScenes = useMemo(() => allScenes.slice(0, visibleCount), [allScenes, visibleCount]);

  // hover preview item
  const previewItem = useMemo(() => {
    if (!open) return null;
    const byHover = hoveredId ? allScenes.find((x) => x.id === hoveredId) : null;
    if (byHover) return byHover;

    const byInitial = initialPreviewUrl
      ? allScenes.find((x) => safeString(x.url) === safeString(initialPreviewUrl))
      : null;
    if (byInitial) return byInitial;

    return allScenes[0] || null;
  }, [open, hoveredId, allScenes, initialPreviewUrl]);

  // infinite scroll inside grid column
  useEffect(() => {
    if (!open) return;

    const el = sentinelRef.current;
    if (!el) return;

    const root = gridScrollRef.current || getScrollParent(el);

    const obs = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry || !entry.isIntersecting) return;
        setVisibleCount((c) => Math.min(allScenes.length, c + 24));
      },
      {
        root,
        rootMargin: "900px 0px 900px 0px",
        threshold: 0.01,
      }
    );

    obs.observe(el);
    return () => obs.disconnect();
  }, [open, allScenes.length]);

  const pick = (item: SceneLibItem) => {
    // IMPORTANT: pass optimized 1080 for speed / timeouts
    const fastUrl = cfInput1080(item.url) || item.url;
    onPickScene(fastUrl, item);
    onClose();
  };

  if (!open) return null;

  return (
    <div className="scene-lib-overlay" role="dialog" aria-modal="true" onMouseDown={onClose}>
      <div className="scene-lib-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="scene-lib-header">
          <div className="scene-lib-title">Library</div>
          <button type="button" className="scene-lib-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <div className="scene-lib-body">
          {/* LEFT 70% */}
          <div className="scene-lib-left">
            <div ref={gridScrollRef} className="scene-lib-gridScroll">
              <div className="scene-lib-grid">
                {visibleScenes.map((it) => (
                  <div
                    key={it.id}
                    className="scene-lib-card"
                    onMouseEnter={() => setHoveredId(it.id)}
                  >
                    <button
                      type="button"
                      className="scene-lib-thumbBtn"
                      onClick={() => pick(it)}
                      title={it.title}
                    >
                      <img
                        className="scene-lib-thumb"
                        src={cfThumb(it.url, 700, 70)}
                        alt=""
                        loading="lazy"
                        decoding="async"
                        onError={(e) => {
                          (e.currentTarget as HTMLImageElement).src = it.url;
                        }}
                      />
                    </button>

                    <div className="scene-lib-cardMeta">
                      <div className="scene-lib-cardTitle">{it.title}</div>

                      <button type="button" className="scene-lib-setBtn" onClick={() => pick(it)}>
                        Set scene
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div ref={sentinelRef} className="scene-lib-sentinel" />

              {!allScenes.length ? (
                <div className="scene-lib-empty">
                  No scenes yet. Add items in <code>{envKey}</code>.
                </div>
              ) : null}
            </div>
          </div>

          {/* RIGHT 30% */}
          <div className="scene-lib-right">
            {previewItem ? (
              <>
                <div className="scene-lib-previewTitle">{previewItem.title}</div>
                <div className="scene-lib-previewFrame">
                  <img
                    className="scene-lib-previewImg"
                    src={cfThumb(previewItem.url, 1400, 80)}
                    alt=""
                    decoding="async"
                    loading="eager"
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).src = previewItem.url;
                    }}
                  />
                </div>

                <button type="button" className="scene-lib-previewSet" onClick={() => pick(previewItem)}>
                  Set scene
                </button>
              </>
            ) : (
              <div className="scene-lib-empty">No preview</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
