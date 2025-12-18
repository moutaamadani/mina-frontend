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

export default function Profile() {
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

  const apiBase =
    (import.meta as any).env?.VITE_MINA_API_BASE_URL ||
    (import.meta as any).env?.VITE_API_BASE_URL ||
    "";

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const em = data.session?.user?.email || "";
      setEmail(em ? String(em) : "");
    });
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
      const token = data.session?.access_token || null;

      const passId = String(localStorage.getItem("minaPassId") || "").trim();

      const headers: Record<string, string> = { Accept: "application/json" };
      if (token) headers.Authorization = `Bearer ${token}`;
      if (passId) headers["X-Mina-Pass-Id"] = passId;

      // ✅ FIX: your backend is GET /history (not /history/pass/:id)
      const resp = await fetch(`${apiBase}/history`, { method: "GET", headers });
      const text = await resp.text();

      let json: any = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        json = null;
      }

      if (!resp.ok || !json?.ok) {
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

      const bal = json?.credits?.balance;
      setCredits(Number.isFinite(Number(bal)) ? Number(bal) : null);

      const exp = json?.credits?.expiresAt ?? null;
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
  }, [apiBase]);

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

  const logout = async () => {
    try {
      await supabase.auth.signOut();
    } catch {}
    window.location.reload();
  };

  return (
    <>
      <TopLoadingBar active={loadingHistory} />
      <div className="profile-shell">
        {/* ✅ Top bar (row 1) — NO LOGO LEFT */}
        <div className="profile-topbar">
          <div /> {/* keep spacing exactly (space-between) */}
        <div className="profile-topbar-right">
          <a className="profile-toplink" href="/studio">
            Back to studio
          </a>
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
                <a
                  className="profile-card-show"
                  href={it.url || "#"}
                  target="_blank"
                  rel="noreferrer"
                  onClick={(e) => {
                    if (!it.url) e.preventDefault();
                  }}
                >
                  Show
                </a>

                <span className={`profile-card-liked ${it.liked ? "" : "ghost"}`}>Liked</span>
              </div>

              <div
                className="profile-card-media"
                onClick={() => {
                  if (it.url) window.open(it.url, "_blank", "noreferrer");
                }}
                role="button"
                tabIndex={0}
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
