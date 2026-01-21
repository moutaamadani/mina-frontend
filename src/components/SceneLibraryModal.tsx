import React, { useMemo, useState } from "react";
import "./SceneLibraryModal.css";
import { parseSceneLibraryEnv, SceneLibraryItem } from "../lib/sceneLibrary";

function cfThumb(url: string, width = 700, quality = 75) {
  if (!url) return url;
  if (!url.includes("assets.faltastudio.com/")) return url;
  if (url.includes("/cdn-cgi/image/")) return url;

  // ✅ Force jpeg so we never get AVIF from format=auto
  const opts = `width=${width},fit=cover,quality=${quality},format=jpeg,onerror=redirect`;

  return `https://assets.faltastudio.com/cdn-cgi/image/${opts}/${url.replace(
    "https://assets.faltastudio.com/",
    ""
  )}`;
}

function cfInput1080(url: string) {
  if (!url) return url;
  if (!url.includes("assets.faltastudio.com/")) return url;
  if (url.includes("/cdn-cgi/image/")) return url;

  const opts = `width=1080,fit=scale-down,quality=85,format=jpeg,onerror=redirect`;

  return `https://assets.faltastudio.com/cdn-cgi/image/${opts}/${url.replace(
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
  const envRaw = (import.meta as any)?.env?.VITE_SCENE_LIBRARY_JSON;

  // ✅ Hard fallback (used only if env is missing/empty)
  const FALLBACK_SCENE_LIBRARY_RAW =
    "1,Frosted glass vessel with amber liquid,https://assets.faltastudio.com/mma/still/12656216-f4ae-44a2-8416-e9b98875f024.png,editorial;frosted glass;glass sculpture;amber liquid;macro;still life;luxury;soft light;minimal;industry perfumery;industry luxury;background black;gradient|" +
    "2,Amouage perfume with red anthurium,https://assets.faltastudio.com/mma/still/88a1569d-0e9f-486e-b664-ac4d3cc8dce0.png,editorial;perfume;amouage;jubilation 40;anthurium;red flower;still life;luxury;warm light;muted tone;industry perfumery;industry beauty;background beige|" +
    "3,Ceramic bow cuff bracelet still life,https://assets.faltastudio.com/mma/still/53005a7d-7e05-41e5-9bab-bae2498a3af7.png,editorial;ceramic;bow;bracelet;cuff;jewelry;sculpture;still life;minimal;handmade;industry fashion;industry accessories;background blue|" +
    "4,Hermes leather mushroom pouch,https://assets.faltastudio.com/mma/still/6ba951cb-457f-4276-832f-b3f9e58e39ef.png,editorial;hermes;leather;pouch;zipper;accessories;luxury;product shot;industry fashion;industry luxury;background blue;dark gradient|" +
    "5,Influencer lifestyle bedroom iPhone photo,https://assets.faltastudio.com/mma/still/268f50ef-5633-4a08-b325-9d1c80d07d91.png,lifestyle;influencer;iphone photo;bedroom;woman;dog;home interior;natural light;ugc;social media;industry lifestyle;industry fashion;background beige|" +
    "6,Perfume bottle wrapped by green snake,https://assets.faltastudio.com/mma/still/22f2c4b7-60dd-4e9b-a622-6f3530d16af1.png,editorial;perfume;fragrance;snake;green snake;still life;glass bottle;dark luxury;surreal;industry perfumery;industry beauty;background red|" +
    "7,Red loafers with eggplants and glazed donut,https://assets.faltastudio.com/mma/still/da8e364c-950c-47fb-87ea-9ffe191c8699.png,fashion;still life;shoes;loafers;red shoes;eggplant;aubergine;donut;food styling;editorial;industry fashion;industry luxury;background beige|" +
    "8,Bather soothing body cleanser tube,https://assets.faltastudio.com/mma/still/dedf0568-e47b-4beb-a2b9-53b76667db98.png,editorial;body cleanser;skincare;cosmetics;tube;black packaging;minimal;product shot;still life;luxury;soft light;studio lighting;industry beauty;industry skincare;background navy blue;blue;gradient;background beige;cream";
    "9,Editorial portrait with gold jewelry,https://assets.faltastudio.com/mma/still/22d25022-90b5-4584-8b20-76d1af650691.png,editorial;portrait;beauty;fashion;model;woman;slick hair;blonde;gold jewelry;earrings;necklace;chain;charms;luxury;soft light;muted tones;close-up;studio portrait;industry fashion;industry jewelry;industry beauty;background olive green;background green;gradient";

  const raw = String(envRaw || "").trim() || FALLBACK_SCENE_LIBRARY_RAW;
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
          <div className="scene-lib-title">Commercial-friendly Library</div>
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
                        onSetScene(cfInput1080(it.url));
                        onClose();
                      }}
                    >
                      <img src={cfThumb(it.url, 800, 75)} alt="" draggable={false} />
                    </div>

                    <div className="scene-lib-meta">
                      <button
                        className="scene-lib-set"
                        type="button"
                        title={it.title}
                        onClick={() => {
                          onSetScene(cfInput1080(it.url));
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
              <img
                className="scene-lib-preview-img"
                src={cfThumb(active.url, 2600, 85)}
                alt=""
                draggable={false}
                onClick={() => {
                  onSetScene(cfInput1080(active.url));
                  onClose();
                }}
              />
            ) : (
              <div className="scene-lib-empty">No preview</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
