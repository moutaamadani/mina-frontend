// =============================================================
// FILE: src/Profile.tsx
// Mina — Profile (Archive)
// - Mina-style header (logo left, Back to Studio right, Logout far right)
// - Meta row (pass + email + stats)
// - Archive grid, "infinite" reveal (10/page, client-side)
// - Click item => download (no new tab)
// - Prompt line + tiny "view more"
// - Date + Delete with confirm
// - Filters (motion/type / creation/platform / liked / recent / session) => non-matching dim to 10%
// =============================================================

import React, { useEffect, useMemo, useState } from "react";
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
  // Always use our branded filename so downloads are consistent.
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

  // Default to the deployed API base (including /api) so history endpoints
  // resolve correctly even when env vars are missing.
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
  //DEBUGGer const [rawHistoryPayload, setRawHistoryPayload] = useState<any>(null);

  // Filters (ONLY these)
  const [motion, setMotion] = useState<"all" | "still" | "motion">("all");
  const cycleMotion = () => {
    setMotion((prev) => (prev === "all" ? "motion" : prev === "motion" ? "still" : "all"));
  };

  const motionLabel = motion === "all" ? "Show all" : motion === "motion" ? "Motion" : "Still";

  const [likedOnly, setLikedOnly] = useState(false);
  const [recentOnly, setRecentOnly] = useState(false);

  const [expandedPromptIds, setExpandedPromptIds] = useState<Record<string, boolean>>({});

  const openLightbox = (url: string | null, isMotion: boolean) => {
    if (!url) return;
    setLightbox({ url, isMotion });
  };

  const closeLightbox = () => setLightbox(null);

  // Pull session + passId from the shared auth context so we reuse the same
  // token/AuthGate pass id instead of re-checking Supabase on this screen.
  const authCtx = useAuthContext();
  const ctxPassId = usePassId();

  const apiBase = useMemo(() => resolveApiBase(apiBaseUrl), [apiBaseUrl]);

  useEffect(() => {
    // Prefer the email already known by AuthGate; fall back to a direct
    // Supabase session check if the context is still warming up.
    if (authCtx?.session?.user?.email) {
      setEmail(String(authCtx.session.user.email));
      return;
    }

    supabase.auth.getSession().then(({ data }) => {
      const em = data.session?.user?.email || "";
      setEmail(em ? String(em) : "");
    });
  }, [authCtx?.session]);

  async function fetchHistory() {
    setHistoryErr("");
    setLoadingHistory(true);
    try {
      if (!apiBase) {
        setHistoryErr("Missing VITE_MINA_API_BASE_URL (or VITE_API_BASE_URL).");
        return;
      }

      // Reuse the token/pass id provided by AuthGate whenever possible so we
      // don't wait on another Supabase round trip.
      const { data } = await supabase.auth.getSession();
      const token = authCtx?.accessToken || data.session?.access_token || null;

      const passId = (propPassId || ctxPassId || localStorage.getItem("minaPassId") || "").trim();

      const headers: Record<string, string> = { Accept: "application/json" };
      if (token) headers.Authorization = `Bearer ${token}`;
      if (passId) headers["X-Mina-Pass-Id"] = passId;

      // Try /history/trimmed first (for credits), then /history/pass/:passId,
      // then the generic /history endpoint. This ensures we actually fetch
      // the user’s history.
      const hitHistory = async (url: string) => {
        const res = await fetch(url, { method: "GET", headers });
        const text = await res.text();
        return { res, text } as const;
      };

      // Try /history/pass/:passId first (main MEGA source).
      // If that fails, fall back to the generic /history endpoint.
      const attempts: string[] = [];
      if (passId) attempts.push(`${apiBase}/history/pass/${encodeURIComponent(passId)}`);
      attempts.push(`${apiBase}/history`);


      let resp: Response | null = null;
      let text = "";
      let json: any = null;
      let success = false;
      // Hold the credits from earlier attempts (e.g. /history/trimmed) in case
      // later calls with real history data don’t include them.
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

        // Record credits if present.
        if (json?.credits) creditsFromAny = json.credits;
        const hasGenerations = Array.isArray(json?.generations);
        const hasFeedbacks = Array.isArray(json?.feedbacks);
        // Only succeed if we actually received history arrays.
        if (resp.ok && (hasGenerations || hasFeedbacks)) {
          success = true;
          break;
        }
      }

      if (!resp) {
        setHistoryErr("History failed: empty response");
        return;
      }

      const hasGenerations = Array.isArray(json?.generations);

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
// DEBUG: keep the raw backend response for inspection
//setRawHistoryPayload(json);

      setGenerations(Array.isArray(json.generations) ? json.generations : []);
      setFeedbacks(Array.isArray(json.feedbacks) ? json.feedbacks : []);

      // Prefer credits from the current response, but fall back to any we saved
      // earlier (e.g. from /history/trimmed).
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

  // -----------------------------------------
  // Likes: only count as "liked" when we have
  // an EXPLICIT empty comment field.
  // (If comment field is missing, it is NOT a like.)
  // -----------------------------------------
  const likedUrlSet = useMemo(() => {
    const s = new Set<string>();

    const hasKey = (obj: any, key: string) =>
      obj && Object.prototype.hasOwnProperty.call(obj, key);

    for (const f of feedbacks) {
      // Only treat as feedback when record type is present and is "feedback"
      const recTypeRaw = String(pick(f, ["mg_record_type", "recordType"], "") || "").toLowerCase();
      if (recTypeRaw && recTypeRaw !== "feedback") continue;

      const payload = (f as any)?.mg_payload ?? (f as any)?.payload ?? null;
      const payloadComment =
        typeof payload?.comment === "string" ? payload.comment.trim() : null;

      const commentFieldPresent = hasKey(f, "mg_comment") || hasKey(f, "comment");
      const commentValue = commentFieldPresent ? pick(f, ["mg_comment", "comment"], "") : null;
      const commentTrim = typeof commentValue === "string" ? commentValue.trim() : null;

      // ✅ Like only if we explicitly received an empty comment
      const isLike =
        (payloadComment !== null && payloadComment === "") ||
        (commentTrim !== null && commentTrim === "");

      if (!isLike) continue;

      const out = pick(f, ["mg_output_url", "outputUrl"], "").trim();
      const img = pick(f, ["mg_image_url", "imageUrl"], "").trim();
      const vid = pick(f, ["mg_video_url", "videoUrl"], "").trim();

      const url = vid || (isVideoUrl(out) ? out : "") || img || out;
      const key = normalizeMediaUrl(url);
      if (key) s.add(key);
    }

    return s;
  }, [feedbacks]);

  const { items, activeCount } = useMemo(() => {
    // ✅ Merge both: generations + feedbacks
    const allRows = [...(generations || []), ...(feedbacks || [])];

    // 1) Map rows into UI items (only keep rows that have a URL)
    let base = allRows
      .map((g, idx) => {
        const id = pick(g, ["mg_id", "id"], `row_${idx}`);
        const createdAt = pick(g, ["mg_event_at", "mg_created_at", "createdAt"], "") || "";

        const payload = (g as any)?.mg_payload ?? (g as any)?.payload ?? null;
        const gptMeta = (g as any)?.gpt ?? null;

        const prompt =
          pick(g, ["mg_user_prompt", "userPrompt", "promptUser", "prompt_raw", "promptOriginal"], "") ||
          pick(payload, ["userPrompt", "user_prompt", "userMessage", "prompt"], "") ||
          pick(gptMeta, ["userMessage", "input"], "") ||
          pick(g, ["mg_prompt", "prompt"], "") ||
          "";

        const out = pick(g, ["mg_output_url", "outputUrl"], "").trim();
        const img = pick(g, ["mg_image_url", "imageUrl"], "").trim();
        const vid = pick(g, ["mg_video_url", "videoUrl"], "").trim();

        const contentType = pick(g, ["mg_content_type", "contentType"], "").toLowerCase();
        const kindHint = String(pick(g, ["mg_result_type", "resultType", "mg_type", "type"], "")).toLowerCase();

        // ✅ Only render as video when we have an actual video URL.
        const looksVideoMeta =
          contentType.includes("video") ||
          kindHint.includes("motion") ||
          kindHint.includes("video");

        const looksImage = isImageUrl(out) || isImageUrl(img);

        // Prefer explicit video fields, then outputUrl if it clearly looks like video or metadata says motion/video
        // and the URL is not obviously an image.
        const videoUrl = vid || (isVideoUrl(out) ? out : looksVideoMeta && !looksImage ? out : "");
        const imageUrl = img || (!videoUrl ? out : "");

        // Prefer video first
        const url = (videoUrl || imageUrl || out).trim();
        const isMotion = Boolean(videoUrl);

        const liked = url ? likedUrlSet.has(normalizeMediaUrl(url)) : false;

        return { id, createdAt, prompt, url, liked, isMotion };
      })
      .filter((x) => x.url);

    // 2) Newest first
    base.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));

    // 3) ✅ Deduplicate by URL so you don’t see the same media twice
    const seen = new Set<string>();
    base = base.filter((it) => {
      const key = normalizeMediaUrl(it.url);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // 4) Add size classes and dimming flags
    const out = base.map((it, idx) => {
      const matchesMotion = motion === "all" ? true : motion === "motion" ? it.isMotion : !it.isMotion;
      const matchesLiked = !likedOnly || it.liked;
      const matchesRecent = !recentOnly || idx < 60;

      const dimmed = !(matchesMotion && matchesLiked && matchesRecent);

      let sizeClass = "profile-card--tall";
      if (idx % 13 === 0) sizeClass = "profile-card--hero";
      else if (idx % 9 === 0) sizeClass = "profile-card--wide";
      else if (idx % 7 === 0) sizeClass = "profile-card--mini";
      return { ...it, sizeClass, dimmed };
    });

    const activeCount = out.filter((it) => !it.dimmed).length;

    return { items: out, activeCount };
  }, [generations, feedbacks, likedUrlSet, motion, likedOnly, recentOnly]);


  const onTogglePrompt = (id: string) => {
    setExpandedPromptIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const logout = () => {
    supabase.auth.signOut().catch(() => {
      /* ignore sign-out errors so the page can reset instantly */
    });
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
        {/* ✅ Top bar (row 1) — NO LOGO LEFT */}
        <div className="profile-topbar">
          <div /> {/* keep spacing exactly (space-between) */}
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

      {/* ✅ Meta strip (row 2) — Email + Credits + Expiration + Logout (not underlined) */}
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

      {/* Archive head */}
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

        {/* ✅ Filters (NO Session, NO Creation) */}
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
            className={`profile-filter-pill ${recentOnly ? "active" : ""}`}
            onClick={() => setRecentOnly((v) => !v)}
          >
            Recent
          </button>
        </div>
      </div>

      {/* Grid */}
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
                      src={it.url}
                      muted
                      loop
                      playsInline
                      preload="metadata"
                      onMouseEnter={(e) => {
                        e.currentTarget.play().catch(() => {});
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.pause();
                        e.currentTarget.currentTime = 0;
                      }}
                    />
                  ) : (
                    <img src={it.url} alt="" loading="lazy" />
                  )
                ) : (
                  <div style={{ padding: 10, fontSize: 12, opacity: 0.6 }}>No media</div>
                )}
              </div>

              <div className="profile-card-promptline">
                <div className={`profile-card-prompt ${expanded ? "expanded" : ""}`}>
                  {it.prompt || ""}
                </div>

                {showViewMore ? (
                  <button
                    className="profile-card-viewmore"
                    type="button"
                    onClick={() => onTogglePrompt(it.id)}
                  >
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
