// =============================================================
// FILE: src/Profile.tsx
// Mina — Profile (Archive)
// - Mina-style header (logo left, Back to Studio right, Logout far right)
// - Meta row (pass + email + stats)
// - Archive grid
// - Click item => open lightbox (no new tab)
// - Prompt line + tiny "view more"
// - Filters (motion / liked / aspect) => non-matching dim
// - Video autoplay via IntersectionObserver (plays only most-visible)
// =============================================================

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "./lib/supabaseClient";
import { useAuthContext, usePassId } from "./components/AuthGate";
import "./Profile.css";
import TopLoadingBar from "./components/TopLoadingBar";

type Row = Record<string, any>;

function pick(row: Row, keys: string[], fallback = ""): string {
  for (const k of keys) {
    const v = row?.[k];
    if (v !== undefined && v !== null && String(v).trim() !== "") return String(v);
  }
  return fallback;
}

function isVideoUrl(url: string) {
  const u = (url || "").split("?")[0].split("#")[0].toLowerCase();
  return u.endsWith(".mp4") || u.endsWith(".webm") || u.endsWith(".mov") || u.endsWith(".m4v");
}

function isImageUrl(url: string) {
  const u = (url || "").split("?")[0].split("#")[0].toLowerCase();
  return (
    u.endsWith(".jpg") ||
    u.endsWith(".jpeg") ||
    u.endsWith(".png") ||
    u.endsWith(".gif") ||
    u.endsWith(".webp")
  );
}

function normalizeMediaUrl(url: string) {
  if (!url) return "";
  const base = url.split(/[?#]/)[0];
  return base || url;
}

type AspectKey = "9-16" | "3-4" | "2-3" | "1-1";

const ASPECT_OPTIONS: { key: AspectKey; ratio: string; label: string }[] = [
  { key: "2-3", ratio: "2:3", label: "2:3" },
  { key: "1-1", ratio: "1:1", label: "1:1" },
  { key: "9-16", ratio: "9:16", label: "9:16" },
  { key: "3-4", ratio: "3:4", label: "3:4" },
];

function normalizeAspectRatio(raw: string | null | undefined) {
  if (!raw) return "";
  const trimmed = raw.trim();
  if (!trimmed) return "";

  const direct = trimmed.replace("/", ":");
  if (direct.includes(":")) {
    const [a, b] = direct.split(":").map((p) => p.trim());
    if (a && b) {
      const candidate = `${a}:${b}`;
      const match = ASPECT_OPTIONS.find((opt) => opt.ratio === candidate);
      if (match) return match.ratio;
    }
  }

  const re = /([0-9.]+)\s*[xX:\/ ]\s*([0-9.]+)/;
  const m = trimmed.match(re);
  if (m) {
    const w = parseFloat(m[1]);
    const h = parseFloat(m[2]);
    if (Number.isFinite(w) && Number.isFinite(h) && h > 0) {
      const val = w / h;
      let best: { opt: (typeof ASPECT_OPTIONS)[number] | null; diff: number } = { opt: null, diff: Infinity };
      for (const opt of ASPECT_OPTIONS) {
        const [aw, ah] = opt.ratio.split(":").map((p) => parseFloat(p));
        if (!Number.isFinite(aw) || !Number.isFinite(ah) || ah === 0) continue;
        const ratio = aw / ah;
        const diff = Math.abs(ratio - val);
        if (diff < best.diff) best = { opt, diff };
      }
      if (best.opt) return best.opt.ratio;
    }
  }

  return "";
}

function findLikeUrl(row: Row) {
  const hasKey = (obj: any, key: string) => obj && Object.prototype.hasOwnProperty.call(obj, key);

  const payload = (row as any)?.mg_payload ?? (row as any)?.payload ?? null;
  const payloadComment = typeof payload?.comment === "string" ? payload.comment.trim() : null;

  const commentFieldPresent = hasKey(row, "mg_comment") || hasKey(row, "comment");
  const commentValue = commentFieldPresent ? pick(row, ["mg_comment", "comment"], "") : null;
  const commentTrim = typeof commentValue === "string" ? commentValue.trim() : null;

  const recTypeRaw = String(pick(row, ["mg_record_type", "recordType"], "") || "").toLowerCase();
  if (recTypeRaw && recTypeRaw !== "feedback") return "";

  const isLike = (payloadComment !== null && payloadComment === "") || (commentTrim !== null && commentTrim === "");
  if (!isLike) return "";

  const out = pick(row, ["mg_output_url", "outputUrl"], "").trim();
  const img = pick(row, ["mg_image_url", "imageUrl"], "").trim();
  const vid = pick(row, ["mg_video_url", "videoUrl"], "").trim();

  return vid || (isVideoUrl(out) ? out : "") || img || out;
}

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "2-digit" });
}

function fmtDateTime(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString();
}

function guessDownloadExt(url: string, fallbackExt: string) {
  const lower = url.toLowerCase();
  if (lower.endsWith(".mp4")) return ".mp4";
  if (lower.endsWith(".webm")) return ".webm";
  if (lower.endsWith(".mov")) return ".mov";
  if (lower.endsWith(".m4v")) return ".m4v";
  if (lower.match(/\.jpe?g$/)) return ".jpg";
  if (lower.endsWith(".png")) return ".png";
  if (lower.endsWith(".gif")) return ".gif";
  if (lower.endsWith(".webp")) return ".webp";
  return fallbackExt;
}

function buildDownloadName(url: string) {
  const base = "Mina_v3_prompt";
  const ext = guessDownloadExt(url, ".png");
  return base.endsWith(ext) ? base : `${base}${ext}`;
}

function triggerDownload(url: string, id?: string | null) {
  if (!url) return;
  const a = document.createElement("a");
  a.href = url;
  a.download = buildDownloadName(url);
  if (id) a.setAttribute("data-id", id);
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

const normalizeBase = (raw?: string | null) => {
  if (!raw) return "";
  return raw.endsWith("/") ? raw.slice(0, -1) : raw;
};

const resolveApiBase = (override?: string | null) => {
  const envBase = normalizeBase(
    override ||
      (import.meta as any).env?.VITE_MINA_API_BASE_URL ||
      (import.meta as any).env?.VITE_API_BASE_URL ||
      (import.meta as any).env?.VITE_BACKEND_URL
  );
  if (envBase) return envBase;

  if (typeof window !== "undefined") {
    if (window.location.origin.includes("localhost")) return "http://localhost:3000";
    return `${window.location.origin}/api`;
  }

  return "https://mina-editorial-ai-api.onrender.com/api";
};

type ProfileProps = {
  passId?: string | null;
  apiBaseUrl?: string;
  onBackToStudio?: () => void;
};

export default function Profile({ passId: propPassId, apiBaseUrl, onBackToStudio }: ProfileProps) {
  const [email, setEmail] = useState("");
  const [historyErr, setHistoryErr] = useState("");
  const [loadingHistory, setLoadingHistory] = useState(true);

  const [generations, setGenerations] = useState<Row[]>([]);
  const [feedbacks, setFeedbacks] = useState<Row[]>([]);

  const [credits, setCredits] = useState<number | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<{ url: string; isMotion: boolean } | null>(null);

  // Filters (ONLY these)
  const [motion, setMotion] = useState<"all" | "still" | "motion">("all");
  const cycleMotion = () => {
    setMotion((prev) => (prev === "all" ? "motion" : prev === "motion" ? "still" : "all"));
  };
  const motionLabel = motion === "all" ? "Show all" : motion === "motion" ? "Motion" : "Still";

  const [likedOnly, setLikedOnly] = useState(false);
  const [aspectFilterStep, setAspectFilterStep] = useState(0);
  const activeAspectFilter = aspectFilterStep === 0 ? null : ASPECT_OPTIONS[aspectFilterStep - 1];
  const cycleAspectFilter = () => setAspectFilterStep((prev) => (prev + 1) % (ASPECT_OPTIONS.length + 1));
  const aspectFilterLabel = activeAspectFilter ? activeAspectFilter.label : "Ratio";

  const [expandedPromptIds, setExpandedPromptIds] = useState<Record<string, boolean>>({});

  const openLightbox = (url: string | null, isMotion: boolean) => {
    if (!url) return;
    setLightbox({ url, isMotion });
  };
  const closeLightbox = () => setLightbox(null);

  const authCtx = useAuthContext();
  const ctxPassId = usePassId();

  const apiBase = useMemo(() => resolveApiBase(apiBaseUrl), [apiBaseUrl]);

  useEffect(() => {
    if (authCtx?.session?.user?.email) {
      setEmail(String(authCtx.session.user.email));
      return;
    }

    supabase.auth.getSession().then(({ data }) => {
      const em = data.session?.user?.email || "";
      setEmail(em ? String(em) : "");
    });
  }, [authCtx?.session]);

  // =========================================
  // Video refs (used by IntersectionObserver)
  // =========================================
  const videoElsRef = useRef<Map<string, HTMLVideoElement>>(new Map());

  const registerVideoEl = useCallback((id: string, el: HTMLVideoElement | null) => {
    const m = videoElsRef.current;
    if (el) m.set(id, el);
    else m.delete(id);
  }, []);

  async function fetchHistory() {
    setHistoryErr("");
    setLoadingHistory(true);
    try {
      if (!apiBase) {
        setHistoryErr("Missing VITE_MINA_API_BASE_URL (or VITE_API_BASE_URL).");
        return;
      }

      const { data } = await supabase.auth.getSession();
      const token = authCtx?.accessToken || data.session?.access_token || null;

      const passId = (propPassId || ctxPassId || localStorage.getItem("minaPassId") || "").trim();

      const headers: Record<string, string> = { Accept: "application/json" };
      if (token) headers.Authorization = `Bearer ${token}`;
      if (passId) headers["X-Mina-Pass-Id"] = passId;

      const hitHistory = async (url: string) => {
        const res = await fetch(url, { method: "GET", headers });
        const text = await res.text();
        return { res, text } as const;
      };

      const attempts: string[] = [];
      if (passId) attempts.push(`${apiBase}/history/pass/${encodeURIComponent(passId)}`);
      attempts.push(`${apiBase}/history`);

      let resp: Response | null = null;
      let text = "";
      let json: any = null;
      let success = false;
      let creditsFromAny: any = null;

      for (const url of attempts) {
        const attempt = await hitHistory(url);
        resp = attempt.res;
        text = attempt.text;

        try {
          json = text ? JSON.parse(text) : null;
        } catch {
          json = null;
        }

        if (json?.credits) creditsFromAny = json.credits;
        const hasGenerations = Array.isArray(json?.generations);
        const hasFeedbacks = Array.isArray(json?.feedbacks);
        if (resp.ok && (hasGenerations || hasFeedbacks)) {
          success = true;
          break;
        }
      }

      if (!resp) {
        setHistoryErr("History failed: empty response");
        return;
      }

      if (!success) {
        setHistoryErr(
          json?.message ||
            json?.error ||
            `History failed (${resp.status}): ${text?.slice(0, 220) || "Unknown error"}`
        );
        setGenerations([]);
        setFeedbacks([]);
        setCredits(null);
        setExpiresAt(null);
        return;
      }

      setGenerations(Array.isArray(json.generations) ? json.generations : []);
      setFeedbacks(Array.isArray(json.feedbacks) ? json.feedbacks : []);

      const creditsObj = json?.credits ?? creditsFromAny;
      const bal = creditsObj?.balance;
      setCredits(Number.isFinite(Number(bal)) ? Number(bal) : null);

      const exp = creditsObj?.expiresAt ?? null;
      setExpiresAt(exp ? String(exp) : null);
    } catch (e: any) {
      setHistoryErr(e?.message || String(e));
      setGenerations([]);
      setFeedbacks([]);
      setCredits(null);
      setExpiresAt(null);
    } finally {
      setLoadingHistory(false);
    }
  }

  useEffect(() => {
    void fetchHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiBase, propPassId, ctxPassId, authCtx?.accessToken]);

  useEffect(() => {
    if (!lightbox) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeLightbox();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [lightbox]);

  // Likes set
  const likedUrlSet = useMemo(() => {
    const s = new Set<string>();
    for (const f of feedbacks) {
      const likeUrl = normalizeMediaUrl(findLikeUrl(f));
      if (likeUrl) s.add(likeUrl);
    }
    return s;
  }, [feedbacks]);

  const { items, activeCount } = useMemo(() => {
    const baseRows: Array<{ row: Row; source: "generation" | "feedback" }> = [
      ...(generations || []).map((g) => ({ row: g, source: "generation" as const })),
      ...(feedbacks || []).map((f) => ({ row: f, source: "feedback" as const })),
    ];

    let base = baseRows
      .map(({ row: g, source }, idx) => {
        const id = pick(g, ["mg_id", "id"], `row_${idx}`);
        const createdAt = pick(g, ["mg_event_at", "mg_created_at", "createdAt"], "") || "";

        const payload = (g as any)?.mg_payload ?? (g as any)?.payload ?? null;
        const meta = (g as any)?.mg_meta ?? (g as any)?.meta ?? null;
        const gptMeta = (g as any)?.gpt ?? null;

        const prompt =
          pick(g, ["mg_user_prompt", "userPrompt", "promptUser", "prompt_raw", "promptOriginal"], "") ||
          pick(payload, ["userPrompt", "user_prompt", "userMessage", "prompt"], "") ||
          pick(gptMeta, ["userMessage", "input"], "") ||
          pick(g, ["mg_prompt", "prompt"], "") ||
          "";

        const likeUrl = source === "feedback" ? findLikeUrl(g) : "";
        const isLikeOnly = source === "feedback" && !!likeUrl;
        if (isLikeOnly) return null;

        const out = pick(g, ["mg_output_url", "outputUrl"], "").trim();
        const img = pick(g, ["mg_image_url", "imageUrl"], "").trim();
        const vid = pick(g, ["mg_video_url", "videoUrl"], "").trim();
        const aspectRaw =
          pick(g, ["mg_aspect_ratio", "aspect_ratio", "aspectRatio"], "") ||
          pick(meta, ["aspectRatio", "aspect_ratio"], "");

        const contentType = pick(g, ["mg_content_type", "contentType"], "").toLowerCase();
        const kindHint = String(pick(g, ["mg_result_type", "resultType", "mg_type", "type"], "")).toLowerCase();

        const looksVideoMeta =
          contentType.includes("video") || kindHint.includes("motion") || kindHint.includes("video");

        const looksImage = isImageUrl(out) || isImageUrl(img);

        const videoUrl = vid || (isVideoUrl(out) ? out : looksVideoMeta && !looksImage ? out : "");
        const imageUrl = img || (!videoUrl ? out : "");

        const url = (videoUrl || imageUrl || out).trim();
        const isMotion = Boolean(videoUrl);

        const aspectRatio =
          normalizeAspectRatio(aspectRaw) ||
          normalizeAspectRatio(
            typeof payload?.aspect_ratio === "string"
              ? payload.aspect_ratio
              : typeof payload?.aspectRatio === "string"
                ? payload.aspectRatio
                : ""
          );

        const liked = url ? likedUrlSet.has(normalizeMediaUrl(url)) || !!likeUrl : false;

        return {
          id,
          createdAt,
          prompt,
          url,
          liked,
          isMotion,
          aspectRatio,
          source,
          sourceRank: source === "generation" ? 2 : 1,
        };
      })
      .filter((x): x is NonNullable<typeof x> => Boolean(x && x.url));

    base.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));

    const merged = new Map<string, typeof base[number]>();
    for (const it of base) {
      const key = normalizeMediaUrl(it.url);
      const existing = merged.get(key);
      if (!existing) {
        merged.set(key, it);
        continue;
      }

      const preferred = existing.sourceRank >= it.sourceRank ? existing : it;
      const other = preferred === existing ? it : existing;
      const next = { ...preferred };
      if (other.liked && !next.liked) next.liked = true;
      if (!next.aspectRatio && other.aspectRatio) next.aspectRatio = other.aspectRatio;

      merged.set(key, next);
    }

    base = Array.from(merged.values());

    const out = base.map((it, idx) => {
      const matchesMotion = motion === "all" ? true : motion === "motion" ? it.isMotion : !it.isMotion;
      const matchesLiked = !likedOnly || it.liked;
      const matchesAspect = !activeAspectFilter || it.aspectRatio === activeAspectFilter.ratio;

      const dimmed = !(matchesMotion && matchesLiked && matchesAspect);

      let sizeClass = "profile-card--tall";
      if (idx % 13 === 0) sizeClass = "profile-card--hero";
      else if (idx % 9 === 0) sizeClass = "profile-card--wide";
      else if (idx % 7 === 0) sizeClass = "profile-card--mini";

      return { ...it, sizeClass, dimmed };
    });

    const activeCount = out.filter((it) => !it.dimmed).length;
    return { items: out, activeCount };
  }, [generations, feedbacks, likedUrlSet, motion, likedOnly, activeAspectFilter]);

  // =============================================================
  // Grid video autoplay (IntersectionObserver)
  // - Plays ONLY when visible
  // - To avoid heavy CPU, plays only the MOST visible video
  // =============================================================
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("IntersectionObserver" in window)) return;

    const els = videoElsRef.current;
    const visible = new Map<HTMLVideoElement, number>();

    const pauseAll = () => {
      els.forEach((v) => {
        try {
          v.pause();
        } catch {}
      });
    };

    const playMostVisible = () => {
      let best: HTMLVideoElement | null = null;
      let bestRatio = 0;

      visible.forEach((ratio, v) => {
        if (ratio > bestRatio) {
          bestRatio = ratio;
          best = v;
        }
      });

      els.forEach((v) => {
        const shouldPlay = best === v;
        try {
          // Autoplay-safe for mobile/Safari
          v.muted = true;

          if (shouldPlay) {
            if (v.paused) v.play().catch(() => {});
          } else {
            if (!v.paused) v.pause();
          }
        } catch {}
      });
    };

    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const v = e.target as HTMLVideoElement;
          const ratio = e.intersectionRatio || 0;

          if (e.isIntersecting && ratio >= 0.35) visible.set(v, ratio);
          else visible.delete(v);
        }
        playMostVisible();
      },
      {
        root: null,
        rootMargin: "200px 0px 200px 0px",
        threshold: [0, 0.35, 0.7, 1],
      }
    );

    els.forEach((v) => observer.observe(v));

    const onVis = () => {
      if (document.hidden) pauseAll();
      else playMostVisible();
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      document.removeEventListener("visibilitychange", onVis);
      observer.disconnect();
      pauseAll();
    };
  }, [items]);

  const onTogglePrompt = (id: string) => {
    setExpandedPromptIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const logout = () => {
    supabase.auth.signOut().catch(() => {});
    window.location.reload();
  };

  return (
    <>
      <TopLoadingBar active={loadingHistory} />
      {lightbox ? (
        <div className="profile-lightbox" role="dialog" aria-modal="true" onClick={closeLightbox}>
          <div className="profile-lightbox-media">
            {lightbox.isMotion ? (
              <video src={lightbox.url} autoPlay loop muted playsInline />
            ) : (
              <img src={lightbox.url} alt="" loading="lazy" />
            )}
          </div>
        </div>
      ) : null}

      <div className="profile-shell">
        <div className="profile-header-fixed">
          <div className="profile-topbar">
            <div />
            <div className="profile-topbar-right">
              {onBackToStudio ? (
                <button className="profile-toplink" type="button" onClick={onBackToStudio}>
                  Back to studio
                </button>
              ) : (
                <a className="profile-toplink" href="/studio">
                  Back to studio
                </a>
              )}
              <span className="profile-topsep">|</span>
              <a
                className="profile-toplink"
                href="https://www.faltastudio.com/checkouts/cn/hWN6ZMJyJf9Xoe5NY4oPf4OQ/en-ae?_r=AQABkH10Ox_45MzEaFr8pfWPV5uVKtznFCRMT06qdZv_KKw"
                target="_blank"
                rel="noreferrer"
              >
                Get more Matchas
              </a>
            </div>
          </div>

          <div className="profile-meta-strip">
            <div className="profile-kv">
              <span className="profile-k">Email</span>
              <span className="profile-v">{email || "—"}</span>
            </div>

            <div className="profile-kv">
              <span className="profile-k">Credits</span>
              <span className="profile-v">{credits === null ? "—" : credits}</span>
            </div>

            <div className="profile-kv">
              <span className="profile-k">Expiration</span>
              <span className="profile-v">{expiresAt ? fmtDate(expiresAt) : "—"}</span>
            </div>

            <div className="profile-kv">
              <button className="profile-logout-meta" onClick={logout} type="button">
                Logout
              </button>
            </div>
          </div>

          <div className="profile-archive-head">
            <div>
              <div className="profile-archive-title">Archive</div>
              <div className="profile-archive-sub">
                {historyErr ? (
                  <span className="profile-error">{historyErr}</span>
                ) : loadingHistory ? (
                  "Loading stills and shots…"
                ) : items.length ? (
                  `${activeCount} creation${activeCount === 1 ? "" : "s"}`
                ) : (
                  "No creations yet."
                )}
              </div>
            </div>

            <div className="profile-filters">
              <button
                type="button"
                className={`profile-filter-pill ${motion !== "all" ? "active" : ""}`}
                onClick={cycleMotion}
              >
                {motionLabel}
              </button>

              <button
                type="button"
                className={`profile-filter-pill ${likedOnly ? "active" : ""}`}
                onClick={() => setLikedOnly((v) => !v)}
              >
                Liked
              </button>

              <button
                type="button"
                className={`profile-filter-pill ${activeAspectFilter ? "active" : ""}`}
                onClick={cycleAspectFilter}
              >
                {aspectFilterLabel}
              </button>
            </div>
          </div>
        </div>

        <div className="profile-grid">
          {items.map((it) => {
            const expanded = Boolean(expandedPromptIds[it.id]);
            const showViewMore = (it.prompt || "").length > 90;

            return (
              <div key={it.id} className={`profile-card ${it.sizeClass} ${it.dimmed ? "is-dim" : ""}`}>
                <div className="profile-card-top">
                  <button
                    className="profile-card-show"
                    type="button"
                    onClick={() => triggerDownload(it.url, it.id)}
                    disabled={!it.url}
                  >
                    Download
                  </button>
                  {it.liked ? <span className="profile-card-liked">Liked</span> : null}
                </div>

                <div
                  className="profile-card-media"
                  role="button"
                  tabIndex={0}
                  onClick={() => openLightbox(it.url, it.isMotion)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") openLightbox(it.url, it.isMotion);
                  }}
                >
                  {it.url ? (
                    it.isMotion ? (
                      <video
                        ref={(el) => registerVideoEl(it.id, el)}
                        src={it.url}
                        muted
                        loop
                        playsInline
                        preload="metadata"
                      />
                    ) : (
                      <img src={it.url} alt="" loading="lazy" />
                    )
                  ) : (
                    <div style={{ padding: 10, fontSize: 12, opacity: 0.6 }}>No media</div>
                  )}
                </div>

                <div className="profile-card-promptline">
                  <div className={`profile-card-prompt ${expanded ? "expanded" : ""}`}>{it.prompt || ""}</div>

                  {showViewMore ? (
                    <button className="profile-card-viewmore" type="button" onClick={() => onTogglePrompt(it.id)}>
                      {expanded ? "less" : "more"}
                    </button>
                  ) : null}
                </div>

                <div className="profile-card-bottom">
                  <div className="profile-card-date">{fmtDateTime(it.createdAt || null)}</div>
                  <div />
                </div>
              </div>
            );
          })}
          <div className="profile-grid-sentinel" />
        </div>
      </div>
    </>
  );
}
