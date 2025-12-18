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

type MegaRow = Record<string, any>;

function pick<T = any>(row: MegaRow, keys: string[], fallback: any = null): T {
  for (const k of keys) {
    if (row && row[k] !== undefined && row[k] !== null) return row[k] as T;
  }
  return fallback as T;
}

function toIso(v: any): string {
  const s = String(v || "").trim();
  if (!s) return "";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString();
}

function isVideoUrl(url: string) {
  const clean = (url || "").split("?")[0].split("#")[0].toLowerCase();
  return clean.endsWith(".mp4") || clean.endsWith(".webm") || clean.endsWith(".mov") || clean.endsWith(".m4v");
}

function looksLikeMotion(row: MegaRow, url: string) {
  const t = String(pick(row, ["mg_result_type", "mg_type", "type"], "")).toLowerCase();
  if (t.includes("motion") || t.includes("video")) return true;
  if (isVideoUrl(url)) return true;
  return false;
}

export default function Profile() {
  const [passId, setPassId] = useState<string>("");
  const [email, setEmail] = useState<string>("");
  const [generations, setGenerations] = useState<MegaRow[]>([]);
  const [feedbacks, setFeedbacks] = useState<MegaRow[]>([]);
  const [err, setErr] = useState<string>("");

  // Filters you want (ONLY these)
  const [motionFilter, setMotionFilter] = useState<"all" | "still" | "motion">("all"); // 3-state
  const [likedOnly, setLikedOnly] = useState(false);
  const [recentOnly, setRecentOnly] = useState(false);

  const apiBaseUrl =
    (import.meta as any).env?.VITE_MINA_API_BASE_URL ||
    (import.meta as any).env?.VITE_API_BASE_URL ||
    "";

  useEffect(() => {
    // passId usually stored from /me
    const stored = String(localStorage.getItem("minaPassId") || "").trim();
    if (stored) setPassId(stored);

    // email from Supabase session
    supabase.auth.getSession().then(({ data }) => {
      const em = data.session?.user?.email || "";
      setEmail(em ? String(em) : "");
    });
  }, []);

  async function apiFetch(path: string) {
    const headers: Record<string, string> = { Accept: "application/json" };

    // auth bearer (if logged in)
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (token) headers.Authorization = `Bearer ${token}`;

    // pass header (your backend reads this)
    const pid = String(localStorage.getItem("minaPassId") || passId || "").trim();
    if (pid) headers["X-Mina-Pass-Id"] = pid;

    return fetch(`${apiBaseUrl}${path}`, { method: "GET", headers });
  }

  useEffect(() => {
    if (!apiBaseUrl) return;

    (async () => {
      setErr("");
      try {
        // ✅ FIX: your backend route is GET /history (NOT /history/pass/:id)
        // also supports /history/pass/:passId if you added the backend alias above
        const resp = await apiFetch(`/history`);
        const text = await resp.text();

        let json: any = null;
        try {
          json = text ? JSON.parse(text) : null;
        } catch {
          json = null;
        }

        if (!resp.ok || !json?.ok) {
          const msg =
            json?.message ||
            json?.error ||
            `History failed (${resp.status}): ${text?.slice(0, 250) || "Unknown error"}`;
          setErr(msg);
          setGenerations([]);
          setFeedbacks([]);
          return;
        }

        setGenerations(Array.isArray(json.generations) ? json.generations : []);
        setFeedbacks(Array.isArray(json.feedbacks) ? json.feedbacks : []);
      } catch (e: any) {
        setErr(e?.message || String(e));
        setGenerations([]);
        setFeedbacks([]);
      }
    })();
  }, [apiBaseUrl, passId]);

  const likedUrlSet = useMemo(() => {
    // your backend stores likes as feedback rows; comment=="" is your “liked” convention
    const set = new Set<string>();
    for (const f of feedbacks) {
      const comment = String(pick(f, ["mg_comment", "comment"], "")).trim();
      if (comment !== "") continue;

      const img = String(pick(f, ["mg_image_url", "imageUrl"], "")).trim();
      const vid = String(pick(f, ["mg_video_url", "videoUrl"], "")).trim();
      const url = img || vid;
      if (url) set.add(url);
    }
    return set;
  }, [feedbacks]);

  const items = useMemo(() => {
    const mapped = (generations || []).map((g) => {
      const img = String(pick(g, ["mg_image_url"], "")).trim();
      const vid = String(pick(g, ["mg_video_url"], "")).trim();
      const out = String(pick(g, ["outputUrl", "url"], "")).trim();

      const url = out || vid || img || "";
      const createdAt = toIso(pick(g, ["mg_created_at", "createdAt"], "")) || "";
      const prompt = String(pick(g, ["mg_prompt", "prompt"], "")).trim();
      const platform = String(pick(g, ["mg_platform", "platform"], "")).trim();
      const id = String(pick(g, ["mg_id", "id"], "")).trim();

      const motion = looksLikeMotion(g, url);
      const liked = url ? likedUrlSet.has(url) : false;

      return { raw: g, id, url, createdAt, prompt, platform, motion, liked };
    });

    // default sort newest first (and “Recent” just filters to newest chunk)
    mapped.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));

    let out = mapped;

    // Motion 3-state
    if (motionFilter === "still") out = out.filter((x) => !x.motion);
    if (motionFilter === "motion") out = out.filter((x) => x.motion);

    if (likedOnly) out = out.filter((x) => x.liked);

    if (recentOnly) out = out.slice(0, 50); // “recent view” (no session filter anymore)

    return out;
  }, [generations, likedUrlSet, motionFilter, likedOnly, recentOnly]);

  const creationsCount = generations.length;
  const likedCount = likedUrlSet.size;

  const cycleMotion = () => {
    setMotionFilter((p) => (p === "all" ? "still" : p === "still" ? "motion" : "all"));
  };

  const motionLabel = motionFilter === "all" ? "All" : motionFilter === "still" ? "Still" : "Motion";

  const logout = async () => {
    try {
      await supabase.auth.signOut();
    } catch {}
    window.location.reload();
  };

  const backToStudio = () => {
    // adjust if your studio route is different
    window.location.href = "/studio";
  };

  return (
    <div className="profilePage">
      {/* TOP ROW (no logo left) */}
      <div className="profileTopRow">
        <div className="profileMeta">
          <div className="profileMetaItem">
            <span className="profileMetaLabel">Pass</span>
            <span className="profileMetaValue">{passId || "—"}</span>
          </div>

          <div className="profileMetaItem">
            <span className="profileMetaLabel">Email</span>
            <span className="profileMetaValue">{email || "—"}</span>
          </div>

          <div className="profileMetaItem">
            <span className="profileMetaLabel">Creations</span>
            <span className="profileMetaValue">{creationsCount}</span>
          </div>

          <div className="profileMetaItem">
            <span className="profileMetaLabel">Liked</span>
            <span className="profileMetaValue">{likedCount}</span>
          </div>

          {/* ✅ Logout moved to the same level as Email row (no underline) */}
          <button className="profileLogoutBtn" onClick={logout} type="button">
            Logout
          </button>
        </div>

        {/* ✅ Instead of Logout in header: Back to studio | Get more Matchas */}
        <div className="profileHeaderLinks">
          <button className="profileLinkBtn" onClick={backToStudio} type="button">
            Back to studio
          </button>
          <span className="profileLinkSep">|</span>
          <a
            className="profileLinkA"
            href="https://www.faltastudio.com/checkouts/cn/hWN6ZMJyJf9Xoe5NY4oPf4OQ/en-ae?_r=AQABkH10Ox_45MzEaFr8pfWPV5uVKtznFCRMT06qdZv_KKw"
            target="_blank"
            rel="noreferrer"
          >
            Get more Matchas
          </a>
        </div>
      </div>

      <div className="profileDivider" />

      <div className="profileBodyTop">
        <div>
          <div className="profileTitle">Archive</div>
          {!err ? (
            <div className="profileSubtle">{items.length ? "" : "No creations yet."}</div>
          ) : (
            <div className="profileError">{err}</div>
          )}
        </div>

        {/* ✅ FILTERS (Session + Creation removed) */}
        <div className="profileFilters">
          {/* ✅ Motion is now a 3-state pill, NOT a dropdown, NOT an infinite toggle */}
          <button className="pillBtn" onClick={cycleMotion} type="button" aria-label="Cycle motion filter">
            <span className="pillLabel">Motion</span>
            <span className="pillValue">{motionLabel}</span>
          </button>

          <button
            className={`pillBtn ${likedOnly ? "pillActive" : ""}`}
            onClick={() => setLikedOnly((v) => !v)}
            type="button"
          >
            Liked
          </button>

          <button
            className={`pillBtn ${recentOnly ? "pillActive" : ""}`}
            onClick={() => setRecentOnly((v) => !v)}
            type="button"
          >
            Recent
          </button>
        </div>
      </div>

      <div className="profileGrid">
        {items.map((it) => (
          <div className="profileCard" key={it.id || it.url}>
            <div className="profileMedia">
              {it.url ? (
                it.motion ? (
                  <video src={it.url} controls playsInline />
                ) : (
                  <img src={it.url} alt="creation" loading="lazy" />
                )
              ) : (
                <div className="profileMissing">No media</div>
              )}
            </div>

            <div className="profileCardMeta">
              <div className="profileCardTopLine">
                <span className="profileTag">{it.motion ? "Motion" : "Still"}</span>
                {it.liked ? <span className="profileTagLiked">Liked</span> : null}
                <span className="profileDate">{it.createdAt ? new Date(it.createdAt).toLocaleString() : ""}</span>
              </div>

              {it.platform ? <div className="profilePlatform">{it.platform}</div> : null}

              {it.prompt ? <div className="profilePrompt">{it.prompt}</div> : null}

              {it.url ? (
                <a className="profileOpenLink" href={it.url} target="_blank" rel="noreferrer">
                  Open asset
                </a>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
