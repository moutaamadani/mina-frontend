import React, { useMemo, useState } from "react";
import "./SceneLibraryModal.css";
import { parseSceneLibraryEnv, SceneLibraryItem } from "../lib/sceneLibrary";

function cfThumb(url: string, width = 700, quality = 75) {
  if (!url) return url;
  if (!url.includes("assets.faltastudio.com/")) return url;
  if (url.includes("/cdn-cgi/image/")) return url;
  return `https://assets.faltastudio.com/cdn-cgi/image/width=${width},quality=${quality},format=auto/${url.replace(
    "https://assets.faltastudio.com/",
    ""
  )}`;
}

export default function SceneLibraryModal({
  open,
  onClose,
  onSetScene,
}: {
  open: boolean;
  onClose: () => void;
  onSetScene: (url: string) => void;
}) {
  const [q, setQ] = useState("");
  const [hoverId, setHoverId] = useState<string>("");

  const items: SceneLibraryItem[] = useMemo(() => {
    // Vite env
    const raw = (import.meta as any)?.env?.VITE_SCENE_LIBRARY_JSON;
    return parseSceneLibraryEnv(raw);
  }, []);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return items;
    return items.filter((it) => {
      const hay = `${it.title} ${it.keywords.join(" ")}`.toLowerCase();
      return hay.includes(s);
    });
  }, [items, q]);

  const active = useMemo(() => {
    const byHover = hoverId ? filtered.find((x) => x.id === hoverId) : null;
    if (byHover) return byHover;
    return filtered[0] ?? null;
  }, [filtered, hoverId]);

  if (!open) return null;

  return (
    <div className="scene-lib-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="scene-lib-modal" onClick={(e) => e.stopPropagation()}>
        <div className="scene-lib-head">
          <div className="scene-lib-title">Library</div>
          <button className="scene-lib-close" type="button" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="scene-lib-toolbar">
          <input
            className="scene-lib-search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search…"
          />
          <div className="scene-lib-count">{filtered.length} scenes</div>
        </div>

        <div className="scene-lib-body">
          {/* 70% */}
          <div className="scene-lib-left">
            {filtered.length ? (
              <div className="scene-lib-grid">
                {filtered.map((it) => (
                  <div
                    key={it.id}
                    className="scene-lib-card"
                    onMouseEnter={() => setHoverId(it.id)}
                    onFocus={() => setHoverId(it.id)}
                    tabIndex={0}
                  >
                    <div
                      className="scene-lib-thumb"
                      onClick={() => {
                        onSetScene(it.url);
                        onClose();
                      }}
                    >
                      <img src={cfThumb(it.url, 800, 75)} alt="" draggable={false} />
                    </div>

                    <div className="scene-lib-meta">
                      <div className="scene-lib-name" title={it.title}>
                        {it.title}
                      </div>
                      <button
                        className="scene-lib-set"
                        type="button"
                        onClick={() => {
                          onSetScene(it.url);
                          onClose();
                        }}
                      >
                        Set scene
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="scene-lib-empty">
                No scenes yet.
              </div>
            )}
          </div>

          {/* 30% */}
          <div className="scene-lib-right">
            {active ? (
              <div className="scene-lib-preview">
                <img src={cfThumb(active.url, 1400, 85)} alt="" draggable={false} />
                <div className="scene-lib-preview-title">{active.title}</div>
              </div>
            ) : (
              <div className="scene-lib-empty">No preview</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
