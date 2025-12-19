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

  // Filters (ONLY these)
  const [motion, setMotion] = useState<"all" | "still" | "motion">("all");
  const cycleMotion = () => {
    setMotion((prev) => (prev === "all" ? "motion" : prev === "motion" ? "still" : "all"));
  };

  const motionLabel = motion === "all" ? "Show all" : motion === "motion" ? "Motion" : "Still";

  const [likedOnly, setLikedOnly] = useState(false);
  const [recentOnly, setRecentOnly] = useState(false);

  const [expandedPromptIds, setExpandedPromptIds] = useState<Record<string, boolean>>({});

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

      const attempts: string[] = [`${apiBase}/history/trimmed`];
      if (passId) {
        attempts.push(`${apiBase}/history/pass/${encodeURIComponent(passId)}`);
      }
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

  const likedUrlSet = useMemo(() => {
    const s = new Set<string>();
    for (const f of feedbacks) {
      const comment = pick(f, ["mg_comment", "comment"], "").trim();
      // your “like” convention was: comment == ""
      if (comment !== "") continue;

      const img = pick(f, ["mg_image_url", "imageUrl"], "").trim();
      const vid = pick(f, ["mg_video_url", "videoUrl"], "").trim();
      const url = img || vid;
      if (url) s.add(url);
    }
    return s;
  }, [feedbacks]);

  const items = useMemo(() => {
    const mapped = (generations || []).map((g, idx) => {
      const id = pick(g, ["mg_id", "id"], `row_${idx}`);
      const createdAt = pick(g, ["mg_created_at", "createdAt", "mg_event_at"], "") || "";
      const prompt = pick(g, ["mg_prompt", "prompt"], "") || "";

      const img = pick(g, ["mg_image_url", "imageUrl", "mg_output_url", "outputUrl"], "").trim();
      const vid = pick(g, ["mg_video_url", "videoUrl"], "").trim();

      const url = vid || img; // prefer video when present
      const motionLike =
        String(pick(g, ["mg_result_type", "resultType", "type"], "")).toLowerCase().includes("motion") ||
        String(pick(g, ["mg_result_type", "resultType", "type"], "")).toLowerCase().includes("video") ||
        Boolean(vid) ||
        isVideoUrl(url);

      const liked = url ? likedUrlSet.has(url) : false;

      // keep your “sizes” vibe (minimal deterministic pattern)
      let sizeClass = "profile-card--tall";
      if (idx % 13 === 0) sizeClass = "profile-card--hero";
      else if (idx % 9 === 0) sizeClass = "profile-card--wide";
      else if (idx % 7 === 0) sizeClass = "profile-card--mini";

      return { id, createdAt, prompt, url, liked, isMotion: motionLike, sizeClass };
    });

    // newest first
    mapped.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));

    let out = mapped;

    if (motion === "still") out = out.filter((x) => !x.isMotion);
    if (motion === "motion") out = out.filter((x) => x.isMotion);

    if (likedOnly) out = out.filter((x) => x.liked);

    if (recentOnly) out = out.slice(0, 60);

    return out;
  }, [generations, likedUrlSet, motion, likedOnly, recentOnly]);

  const onTogglePrompt = (id: string) => {
    setExpandedPromptIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const logout = () => {
    supabase.auth.signOut().catch(() => {
      /* ignore sign-out errors so the page can reset instantly */
    });
    window.location.reload();
  };

  const triggerDownload = (url: string, id: string) => {
    if (!url) return;
    const filename = buildDownloadName(url);
    fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error(`Download failed with ${res.status}`);
        return res.blob();
      })
      .then((blob) => {
        const blobUrl = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = blobUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(blobUrl);
      })
      .catch(() => {
        /* ignore download failure so UI stays responsive */
      });
  };

  return (
    <>
      <TopLoadingBar active={loadingHistory} />
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
            ) : items.length ? (
              `${items.length} item${items.length === 1 ? "" : "s"}`
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
            <div key={it.id} className={`profile-card ${it.sizeClass}`}>
              <div className="profile-card-top">
                <button
                  className="profile-card-show"
                  type="button"
                  onClick={() => triggerDownload(it.url, it.id)}
                  disabled={!it.url}
                >
                  Download
                </button>

                <span className={`profile-card-liked ${it.liked ? "" : "ghost"}`}>Liked</span>
              </div>

              <div
                className="profile-card-media"
                role="button"
                tabIndex={0}
                onClick={() => triggerDownload(it.url, it.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") triggerDownload(it.url, it.id);
                }}
              >
                {it.url ? (
                  it.isMotion ? (
                    <video src={it.url} controls playsInline />
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
