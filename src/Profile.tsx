// =============================================================
// FILE: src/Profile.tsx
// Mina — Profile (Archive)
// - Mina-style header (logo left, Back to Studio right, Logout far right)
// - Customer meta row (mega_customer + mega_generation stats)
// - Archive: 7-col grid, infinite load (10/page)
// - Click item => download (no new tab)
// - Prompt line + tiny "view more"
// - Date + Delete with confirm ("Yes delete" normal, "No keep" bold)
// - Filters (motion / creation / liked / recent / session) => non-matching dim to 10%
// =============================================================

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "./lib/supabaseClient";
import "./Profile.css";

const PASS_ID_STORAGE_KEY = "minaPassId";
const PAGE_SIZE = 10;

// Best-effort field picking (DB schema tolerant)
function pick(obj, keys, fallback = "") {
  if (!obj) return fallback;
  for (const k of keys) {
    if (obj[k] !== undefined && obj[k] !== null && String(obj[k]).trim() !== "") {
      return obj[k];
    }
  }
  return fallback;
}

function formatDate(iso) {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "2-digit",
    });
  } catch {
    return String(iso);
  }
}

function extFromUrl(url) {
  if (!url) return "";
  const clean = url.split("?")[0].split("#")[0];
  const m = clean.match(/\.([a-zA-Z0-9]+)$/);
  return m ? m[1].toLowerCase() : "";
}

function isVideoUrl(url) {
  const ext = extFromUrl(url);
  return ["mp4", "webm", "mov", "m4v"].includes(ext);
}

function safeFilename(base, url) {
  const ext = extFromUrl(url);
  const suffix = ext ? `.${ext}` : ".bin";
  return `${base}${suffix}`;
}

// Try multiple possible “owner” columns without breaking if column doesn't exist
async function fetchByOwnerKey({
  table,
  select,
  ownerValue,
  orderBy = "created_at",
  ascending = false,
  rangeFrom,
  rangeTo,
}) {
  const ownerKeys = ["pass_id", "passId", "customer_pass_id", "customer_id", "customerId"];
  let lastError = null;

  for (const ownerKey of ownerKeys) {
    const q = supabase
      .from(table)
      .select(select)
      .order(orderBy, { ascending })
      .range(rangeFrom, rangeTo);

    const { data, error } = await q.eq(ownerKey, ownerValue);

    if (!error) return { data: data || [], ownerKeyUsed: ownerKey, error: null };

    lastError = error;
    const msg = String(error.message || "").toLowerCase();
    // If it's a "column does not exist" style error, keep trying other keys
    if (msg.includes("column") && msg.includes("does not exist")) continue;

    // Otherwise: stop (permissions / network / etc)
    break;
  }

  return { data: [], ownerKeyUsed: null, error: lastError };
}

async function fetchCustomer(passId) {
  // Same tolerant approach for mega_customer lookup
  const keys = ["pass_id", "passId", "id", "customer_id", "customerId"];
  let lastError = null;

  for (const k of keys) {
    const { data, error } = await supabase
      .from("mega_customer")
      .select("*")
      .eq(k, passId)
      .limit(1);

    if (!error && data && data.length) return { customer: data[0], error: null };
    if (error) {
      lastError = error;
      const msg = String(error.message || "").toLowerCase();
      if (msg.includes("column") && msg.includes("does not exist")) continue;
      break;
    }
  }

  return { customer: null, error: lastError };
}

async function fetchCounts(passId) {
  // total
  const totalRes = await fetchByOwnerKey({
    table: "mega_generation",
    select: "id",
    ownerValue: passId,
    rangeFrom: 0,
    rangeTo: 0,
  });

  // If we found a usable ownerKey, we can use it for cheap HEAD counts:
  const ownerKey = totalRes.ownerKeyUsed;

  let total = null;
  let liked = null;

  if (ownerKey) {
    const { count: totalCount, error: totalErr } = await supabase
      .from("mega_generation")
      .select("id", { count: "exact", head: true })
      .eq(ownerKey, passId);

    if (!totalErr) total = totalCount ?? 0;

    const { count: likedCount, error: likedErr } = await supabase
      .from("mega_generation")
      .select("id", { count: "exact", head: true })
      .eq(ownerKey, passId)
      .eq("liked", true);

    if (!likedErr) liked = likedCount ?? 0;
  }

  return { total, liked, ownerKeyUsed: ownerKey || null };
}

export default function Profile() {
  const [passId, setPassId] = useState("");
  const [customer, setCustomer] = useState(null);

  const [counts, setCounts] = useState({ total: null, liked: null });
  const [ownerKeyUsed, setOwnerKeyUsed] = useState(null);

  const [items, setItems] = useState([]);
  const [isBootLoading, setIsBootLoading] = useState(true);
  const [isPageLoading, setIsPageLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState("");

  const [expandedPromptId, setExpandedPromptId] = useState(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);

  // Filters
  const [filterMotion, setFilterMotion] = useState("all");
  const [filterCreation, setFilterCreation] = useState("all"); // create / animate / (or inferred)
  const [filterLiked, setFilterLiked] = useState(false);
  const [filterRecent, setFilterRecent] = useState(false); // last 7 days
  const [filterSession, setFilterSession] = useState("all");

  const pageRef = useRef(0);
  const sentinelRef = useRef(null);

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
    } catch {
      // ignore
    }
    try {
      localStorage.removeItem(PASS_ID_STORAGE_KEY);
    } catch {
      // ignore
    }
    window.location.href = "/";
  };

  const handleBackToStudio = () => {
    // Adjust if your studio route differs
    window.location.href = "/studio";
  };

  const loadNextPage = useCallback(
    async ({ reset = false } = {}) => {
      if (!passId) return;
      if (!hasMore && !reset) return;
      if (isPageLoading) return;

      setIsPageLoading(true);
      setError("");

      try {
        const page = reset ? 0 : pageRef.current;
        const from = page * PAGE_SIZE;
        const to = from + PAGE_SIZE - 1;

        let data = [];
        let usedKey = ownerKeyUsed;

        if (usedKey) {
          const q = supabase
            .from("mega_generation")
            .select("*")
            .order("created_at", { ascending: false })
            .range(from, to)
            .eq(usedKey, passId);

          const { data: d, error: e } = await q;
          if (e) throw e;
          data = d || [];
        } else {
          const res = await fetchByOwnerKey({
            table: "mega_generation",
            select: "*",
            ownerValue: passId,
            rangeFrom: from,
            rangeTo: to,
          });
          if (res.error) throw res.error;
          data = res.data || [];
          usedKey = res.ownerKeyUsed;
          if (usedKey) setOwnerKeyUsed(usedKey);
        }

        if (reset) {
          pageRef.current = 1;
          setItems(data);
        } else {
          pageRef.current = page + 1;
          setItems((prev) => [...prev, ...data]);
        }

        setHasMore(data.length === PAGE_SIZE);
      } catch (e) {
        setError(String(e?.message || e || "Failed to load archive."));
      } finally {
        setIsPageLoading(false);
      }
    },
    [passId, hasMore, isPageLoading, ownerKeyUsed]
  );

  // Boot: read passId + fetch customer + counts + first page
  useEffect(() => {
    let mounted = true;

    (async () => {
      setIsBootLoading(true);
      setError("");

      let stored = "";
      try {
        stored = localStorage.getItem(PASS_ID_STORAGE_KEY) || "";
      } catch {
        stored = "";
      }

      if (!stored) {
        setIsBootLoading(false);
        setError("Missing pass id. Please log in again.");
        return;
      }

      if (!mounted) return;
      setPassId(stored);

      try {
        const [custRes, countRes] = await Promise.all([fetchCustomer(stored), fetchCounts(stored)]);

        if (!mounted) return;

        if (custRes?.customer) setCustomer(custRes.customer);
        if (custRes?.error && !custRes.customer) {
          // We can still render profile without customer row
          // Keep it silent unless you want to show it:
          // setError(String(custRes.error.message || custRes.error));
        }

        if (countRes) {
          setCounts({ total: countRes.total, liked: countRes.liked });
          if (countRes.ownerKeyUsed) setOwnerKeyUsed(countRes.ownerKeyUsed);
        }

        // First page
        pageRef.current = 0;
        setHasMore(true);
        await loadNextPage({ reset: true });
      } catch (e) {
        setError(String(e?.message || e || "Failed to load profile."));
      } finally {
        if (mounted) setIsBootLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [loadNextPage]);

  // Infinite load sentinel
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;

    const io = new IntersectionObserver(
      (entries) => {
        const first = entries[0];
        if (first?.isIntersecting) loadNextPage();
      },
      { root: null, threshold: 0.1 }
    );

    io.observe(el);
    return () => io.disconnect();
  }, [loadNextPage]);

  // Build filter options from loaded items
  const motionOptions = useMemo(() => {
    const set = new Set();
    for (const it of items) {
      const m = pick(it, ["motion", "motion_style", "motionStyle", "motion_name"], "");
      if (m) set.add(m);
    }
    return ["all", ...Array.from(set).sort((a, b) => a.localeCompare(b))];
  }, [items]);

  const sessionOptions = useMemo(() => {
    const set = new Set();
    for (const it of items) {
      const s = pick(it, ["session", "session_id", "sessionId"], "");
      if (s) set.add(s);
    }
    return ["all", ...Array.from(set)];
  }, [items]);

  const creationOptions = useMemo(() => {
    // Try to infer from row.type / mode / kind / pipeline etc.
    const set = new Set();
    for (const it of items) {
      const c = pick(it, ["creation", "mode", "kind", "type", "pipeline"], "");
      if (c) set.add(c);
    }
    const arr = Array.from(set);
    return ["all", ...arr];
  }, [items]);

  const isMatch = useCallback(
    (it) => {
      // motion
      if (filterMotion !== "all") {
        const m = pick(it, ["motion", "motion_style", "motionStyle", "motion_name"], "");
        if (m !== filterMotion) return false;
      }

      // creation (mode/type)
      if (filterCreation !== "all") {
        const c = pick(it, ["creation", "mode", "kind", "type", "pipeline"], "");
        if (c !== filterCreation) return false;
      }

      // session
      if (filterSession !== "all") {
        const s = pick(it, ["session", "session_id", "sessionId"], "");
        if (s !== filterSession) return false;
      }

      // liked
      if (filterLiked) {
        const liked = Boolean(pick(it, ["liked", "is_liked", "isLiked"], false));
        if (!liked) return false;
      }

      // recent (7 days)
      if (filterRecent) {
        const created = pick(it, ["created_at", "createdAt"], "");
        if (!created) return false;
        const dt = new Date(created).getTime();
        const now = Date.now();
        const sevenDays = 7 * 24 * 60 * 60 * 1000;
        if (Number.isNaN(dt) || now - dt > sevenDays) return false;
      }

      return true;
    },
    [filterCreation, filterLiked, filterMotion, filterRecent, filterSession]
  );

  const resolveUrls = useCallback(async (it) => {
    // Prefer explicit thumb + download url fields if present
    const thumbUrl =
      pick(it, ["thumb_url", "thumbnail_url", "preview_url", "thumbUrl", "previewUrl"], "") ||
      pick(it, ["output_url", "url", "public_url", "file_url", "image_url"], "");

    let downloadUrl =
      pick(it, ["download_url", "output_url", "url", "public_url", "file_url", "image_url"], "") ||
      "";

    // If stored in Supabase Storage, create signed URL (best effort)
    const bucket = pick(it, ["bucket", "storage_bucket", "storageBucket"], "");
    const path = pick(it, ["path", "storage_path", "storagePath", "file_path"], "");

    if (!downloadUrl && bucket && path) {
      const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 60);
      if (!error && data?.signedUrl) downloadUrl = data.signedUrl;
    }

    // If thumb missing but bucket/path exist, try signed url too
    let resolvedThumb = thumbUrl;
    if (!resolvedThumb && bucket && path) {
      const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 60);
      if (!error && data?.signedUrl) resolvedThumb = data.signedUrl;
    }

    return { thumbUrl: resolvedThumb, downloadUrl };
  }, []);

  const downloadItem = useCallback(
    async (it, indexNumber) => {
      try {
        const { downloadUrl } = await resolveUrls(it);
        if (!downloadUrl) return;

        const base = `mina-${indexNumber}`;
        const filename = safeFilename(base, downloadUrl);

        const res = await fetch(downloadUrl, { credentials: "omit" });
        if (!res.ok) throw new Error("Download failed.");

        const blob = await res.blob();
        const href = URL.createObjectURL(blob);

        const a = document.createElement("a");
        a.href = href;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();

        URL.revokeObjectURL(href);
      } catch (e) {
        setError(String(e?.message || e || "Download failed."));
      }
    },
    [resolveUrls]
  );

  const deleteItem = useCallback(
    async (it) => {
      const id = pick(it, ["id", "generation_id", "generationId"], "");
      if (!id) return;

      try {
        setError("");

        const { error: delErr } = await supabase.from("mega_generation").delete().eq("id", id);
        if (delErr) throw delErr;

        setItems((prev) => prev.filter((x) => pick(x, ["id"], "") !== id));
        setConfirmDeleteId(null);
      } catch (e) {
        setError(String(e?.message || e || "Delete failed."));
      }
    },
    []
  );

  // Card sizing pattern (big / small like your reference)
  const cardVariantClass = useCallback((i) => {
    if (i % 19 === 0) return "profile-card--hero";
    if (i % 11 === 0) return "profile-card--tall";
    if (i % 7 === 0) return "profile-card--wide";
    return "profile-card--mini";
  }, []);

  // Customer meta (small plain text)
  const customerEmail = pick(customer, ["email", "customer_email", "mail"], "");
  const customerName = pick(customer, ["name", "full_name", "fullName"], "");
  const customerCreated = pick(customer, ["created_at", "createdAt"], "");
  const customerPlan = pick(customer, ["plan", "tier", "subscription"], "");

  const metaPairs = useMemo(() => {
    const out = [];

    if (passId) out.push({ k: "Pass", v: passId });
    if (customerName) out.push({ k: "Name", v: customerName });
    if (customerEmail) out.push({ k: "Email", v: customerEmail });
    if (customerPlan) out.push({ k: "Plan", v: customerPlan });
    if (customerCreated) out.push({ k: "Joined", v: formatDate(customerCreated) });

    if (counts.total !== null) out.push({ k: "Creations", v: String(counts.total) });
    if (counts.liked !== null) out.push({ k: "Liked", v: String(counts.liked) });

    // Sessions (from loaded set; will grow as infinite loads)
    const sessions = new Set();
    for (const it of items) {
      const s = pick(it, ["session", "session_id", "sessionId"], "");
      if (s) sessions.add(s);
    }
    if (sessions.size) out.push({ k: "Sessions", v: String(sessions.size) });

    return out;
  }, [passId, customerName, customerEmail, customerPlan, customerCreated, counts.total, counts.liked, items]);

  return (
    <div className="profile-shell">
      <div className="profile-topbar">
        <a className="profile-logo-link" href="/studio" onClick={(e) => { e.preventDefault(); handleBackToStudio(); }}>
          {/* Put your real Mina logo in /public/mina-logo.svg (or change this src) */}
          <img className="profile-logo" src="/mina-logo.svg" alt="Mina" />
        </a>

        <div className="profile-topbar-right">
          <button type="button" className="studio-header-cta" onClick={handleBackToStudio}>
            Back to Studio
          </button>

          <button type="button" className="profile-logout" onClick={handleLogout}>
            Logout
          </button>
        </div>
      </div>

      <div className="profile-meta-strip">
        {metaPairs.map((p) => (
          <div key={`${p.k}-${p.v}`} className="profile-kv">
            <span className="profile-k">{p.k}</span>
            <span className="profile-v">{p.v}</span>
          </div>
        ))}
      </div>

      <div className="profile-archive-head">
        <div className="profile-archive-left">
          <div className="profile-archive-title">Archive</div>
          <div className="profile-archive-sub">
            {items.length ? `${items.length}${hasMore ? "+" : ""} loaded` : "No creations yet."}
            {ownerKeyUsed ? ` • key: ${ownerKeyUsed}` : ""}
          </div>
        </div>

        <div className="profile-filters">
          {/* Motion */}
          <label className="profile-filter">
            <span className="profile-filter-label">Motion</span>
            <select
              className="profile-filter-select"
              value={filterMotion}
              onChange={(e) => setFilterMotion(e.target.value)}
            >
              {motionOptions.map((m) => (
                <option key={m} value={m}>
                  {m === "all" ? "All" : m}
                </option>
              ))}
            </select>
          </label>

          {/* Creation */}
          <label className="profile-filter">
            <span className="profile-filter-label">Creation</span>
            <select
              className="profile-filter-select"
              value={filterCreation}
              onChange={(e) => setFilterCreation(e.target.value)}
            >
              {creationOptions.map((c) => (
                <option key={c} value={c}>
                  {c === "all" ? "All" : c}
                </option>
              ))}
            </select>
          </label>

          {/* Liked */}
          <button
            type="button"
            className={`profile-filter-pill ${filterLiked ? "active" : ""}`}
            onClick={() => setFilterLiked((v) => !v)}
          >
            Liked
          </button>

          {/* Recent */}
          <button
            type="button"
            className={`profile-filter-pill ${filterRecent ? "active" : ""}`}
            onClick={() => setFilterRecent((v) => !v)}
          >
            Recent
          </button>

          {/* Session */}
          <label className="profile-filter">
            <span className="profile-filter-label">Session</span>
            <select
              className="profile-filter-select"
              value={filterSession}
              onChange={(e) => setFilterSession(e.target.value)}
            >
              {sessionOptions.map((s) => (
                <option key={s} value={s}>
                  {s === "all" ? "All" : s}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {error ? <div className="error-text profile-error">{error}</div> : null}

      <div className="profile-grid">
        {items.map((it, i) => {
          const n = i + 1;
          const variant = cardVariantClass(i);
          const dim = !isMatch(it);

          const prompt = pick(it, ["prompt", "text", "input_prompt", "inputPrompt"], "");
          const createdAt = pick(it, ["created_at", "createdAt"], "");
          const liked = Boolean(pick(it, ["liked", "is_liked", "isLiked"], false));

          const thumbFallback =
            pick(it, ["thumb_url", "thumbnail_url", "preview_url", "thumbUrl", "previewUrl"], "") ||
            pick(it, ["output_url", "url", "public_url", "file_url", "image_url"], "");

          const showExpanded = expandedPromptId === pick(it, ["id"], `idx-${i}`);

          return (
            <div
              key={pick(it, ["id"], `idx-${i}`)}
              className={`profile-card ${variant} ${dim ? "is-dim" : ""}`}
            >
              <div className="profile-card-top">
                <button
                  type="button"
                  className="profile-card-show"
                  onClick={() => downloadItem(it, n)}
                  title="Download"
                >
                  {n}. Show
                </button>

                {liked ? <div className="profile-card-liked">Liked</div> : <div className="profile-card-liked ghost"> </div>}
              </div>

              <button
                type="button"
                className="profile-card-media"
                onClick={() => downloadItem(it, n)}
                title="Download"
              >
                {/* We keep it simple: image only. If your archive includes video, we still download on click. */}
                {thumbFallback ? (
                  <img
                    src={thumbFallback}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    draggable="false"
                  />
                ) : (
                  <div className="profile-card-media-empty" />
                )}
              </button>

              <div className="profile-card-promptline">
                <div className={`profile-card-prompt ${showExpanded ? "expanded" : ""}`}>
                  {prompt || "—"}
                </div>

                {prompt && prompt.length > 60 ? (
                  <button
                    type="button"
                    className="profile-card-viewmore"
                    onClick={() =>
                      setExpandedPromptId((prev) =>
                        prev === pick(it, ["id"], `idx-${i}`) ? null : pick(it, ["id"], `idx-${i}`)
                      )
                    }
                  >
                    {showExpanded ? "less" : "view more"}
                  </button>
                ) : null}
              </div>

              <div className="profile-card-bottom">
                <div className="profile-card-date">{formatDate(createdAt)}</div>

                {confirmDeleteId === pick(it, ["id"], "") ? (
                  <div className="profile-card-confirm">
                    <button
                      type="button"
                      className="profile-card-confirm-yes"
                      onClick={() => deleteItem(it)}
                    >
                      Yes delete
                    </button>
                    <button
                      type="button"
                      className="profile-card-confirm-no"
                      onClick={() => setConfirmDeleteId(null)}
                    >
                      No keep
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="profile-card-delete"
                    onClick={() => setConfirmDeleteId(pick(it, ["id"], ""))}
                  >
                    Delete
                  </button>
                )}
              </div>
            </div>
          );
        })}

        <div ref={sentinelRef} className="profile-grid-sentinel" />
      </div>

      <div className="profile-foot">
        {isBootLoading ? (
          <div className="profile-foot-note">Loading…</div>
        ) : isPageLoading ? (
          <div className="profile-foot-note">Loading more…</div>
        ) : hasMore ? (
          <div className="profile-foot-note">Scroll to load more.</div>
        ) : (
          <div className="profile-foot-note">End of archive.</div>
        )}
      </div>
    </div>
  );
}
