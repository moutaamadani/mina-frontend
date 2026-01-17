// =============================================================
// FILE: src/Profile.tsx
// Mina — Profile (Render-only, data comes from MinaApp)
// - show real user prompt (user-typed brief, not system prompt)
// - likes + ratio filters actually filter (not just dim)
// - delete confirm + fade out
// - better download
// - Re-create + Animate (if still image)
// - Video: autoplay muted in grid, UNMUTE on hover (desktop)
// - Lightbox: stop click-bubbling so controls work on mobile
// =============================================================

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./Profile.css";
import TopLoadingBar from "./components/TopLoadingBar";
import MatchaQtyModal from "./components/MatchaQtyModal";
import { downloadMinaAsset } from "./lib/minaDownload";

type Row = Record<string, any>;

function safeString(v: any, fallback = ""): string {
  if (v === null || v === undefined) return fallback;
  const s = String(v);
  return s === "undefined" || s === "null" ? fallback : s;
}

function pick(row: any, keys: string[], fallback = ""): string {
  for (const k of keys) {
    const v = row?.[k];
    if (v !== undefined && v !== null && String(v).trim() !== "") return String(v);
  }
  return fallback;
}

function cfThumb(url: string, width = 1200, quality = 75) {
  if (!url) return url;
  if (!url.includes("assets.faltastudio.com/")) return url;
  if (url.includes("/cdn-cgi/image/")) return url; // already transformed
  return `https://assets.faltastudio.com/cdn-cgi/image/width=${width},quality=${quality},format=auto/${url.replace(
    "https://assets.faltastudio.com/",
    ""
  )}`;
}

function tryParseJson<T = any>(v: any): T | null {
  if (!v) return null;
  if (typeof v === "object") return v as T;
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (!s) return null;
  if (!(s.startsWith("{") || s.startsWith("["))) return null;
  try {
    return JSON.parse(s) as T;
  } catch {
    return null;
  }
}

function isVideoUrl(url: string) {
  const u = (url || "").split("?")[0].split("#")[0].toLowerCase();
  return u.endsWith(".mp4") || u.endsWith(".webm") || u.endsWith(".mov") || u.endsWith(".m4v");
}

function isImageUrl(url: string) {
  const u = (url || "").split("?")[0].split("#")[0].toLowerCase();
  return u.endsWith(".jpg") || u.endsWith(".jpeg") || u.endsWith(".png") || u.endsWith(".gif") || u.endsWith(".webp");
}

function normalizeMediaUrl(url: string) {
  if (!url) return "";
  const base = url.split(/[?#]/)[0];
  return base || url;
}

// Make likes match even if one URL is Cloudflare transformed and the other is raw.
function canonicalAssetUrl(url: string) {
  const s = normalizeMediaUrl(url);
  if (!s) return "";

  // https://assets.faltastudio.com/cdn-cgi/image/width=...,quality=...,format=auto/<path>
  const m = s.match(/^https?:\/\/assets\.faltastudio\.com\/cdn-cgi\/image\/[^/]+\/(.+)$/);
  if (m?.[1]) return `https://assets.faltastudio.com/${m[1]}`;

  return s;
}

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "2-digit" });
}

async function downloadMedia(url: string, prompt: string, isMotion: boolean) {
  if (!url) return;
  try {
    await downloadMinaAsset({
      url,
      kind: isMotion ? "motion" : "still",
      prompt: prompt || "",
    });
  } catch (err) {
    console.warn("Download failed:", err);
  }
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

  // ✅ Accept keys like "9-16", "2-3"
  const asKey = trimmed.replace("/", "-").replace(":", "-");
  const byKey = ASPECT_OPTIONS.find((opt) => opt.key === asKey);
  if (byKey) return byKey.ratio;

  // direct ratio form
  const direct = trimmed.replace("/", ":");
  if (direct.includes(":")) {
    const [a, b] = direct.split(":").map((p) => p.trim());
    if (a && b) {
      const candidate = `${a}:${b}`;
      const match = ASPECT_OPTIONS.find((opt) => opt.ratio === candidate);
      if (match) return match.ratio;
    }
  }

  // parse "9 x 16" etc and pick closest
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

function looksLikeSystemPrompt(s: string) {
  const t = (s || "").trim();
  if (!t) return false;

  const low = t.toLowerCase();
  if (low.includes("you are") && (low.includes("assistant") || low.includes("system"))) return true;
  if (low.includes("return strict json")) return true;
  if (low.includes("output format")) return true;
  if (low.includes("safety:")) return true;

  return false;
}

function sanitizeUserBrief(s: string) {
  let t = (s || "").trim();

  // Fix stored typo like "chttps://..."
  if (t.startsWith("chttp://") || t.startsWith("chttps://")) t = t.slice(1);

  // Treat placeholder dashes as empty
  const withoutDashes = t.replace(/[-–—]/g, "").trim();
  if (!withoutDashes) return "";

  return t.trim();
}

// ---------- LIKES (MMA + legacy safe) ----------

function isLikeEventRow(row: Row) {
  const metaRaw = (row as any)?.mg_meta ?? (row as any)?.meta ?? null;
  const metaObj = tryParseJson<any>(metaRaw) ?? metaRaw ?? {};
  const eventType = String(metaObj?.event_type ?? metaObj?.eventType ?? (row as any)?.event_type ?? "").toLowerCase();
  if (eventType === "like") return true;

  // legacy: payload.liked true
  const payloadRaw = (row as any)?.mg_payload ?? (row as any)?.payload ?? null;
  const payload = tryParseJson<any>(payloadRaw) ?? payloadRaw ?? {};
  const rawLiked = payload?.liked ?? payload?.isLiked ?? payload?.like ?? (row as any)?.liked;
  if (rawLiked === true || rawLiked === 1 || rawLiked === "true") return true;

  // legacy: "likes are feedback rows where comment is empty"
  const payloadComment = typeof payload?.comment === "string" ? payload.comment.trim() : null;
  const commentFieldPresent =
    Object.prototype.hasOwnProperty.call(row, "mg_comment") || Object.prototype.hasOwnProperty.call(row, "comment");
  const commentValue = commentFieldPresent ? pick(row, ["mg_comment", "comment"], "") : null;
  const commentTrim = typeof commentValue === "string" ? commentValue.trim() : null;
  if ((payloadComment !== null && payloadComment === "") || (commentTrim !== null && commentTrim === "")) return true;

  return false;
}

function findLikeUrl(row: Row) {
  if (!isLikeEventRow(row)) return "";

  const metaRaw = (row as any)?.mg_meta ?? (row as any)?.meta ?? null;
  const metaObj = tryParseJson<any>(metaRaw) ?? metaRaw ?? {};
  const metaPayloadRaw = metaObj?.payload ?? null;
  const metaPayload = tryParseJson<any>(metaPayloadRaw) ?? metaPayloadRaw ?? {};

  const payloadRaw = (row as any)?.mg_payload ?? (row as any)?.payload ?? null;
  const payload = tryParseJson<any>(payloadRaw) ?? payloadRaw ?? {};

  const out =
    pick(metaPayload, ["output_url", "outputUrl", "url", "media_url", "mediaUrl"], "").trim() ||
    pick(payload, ["output_url", "outputUrl", "url", "media_url", "mediaUrl"], "").trim() ||
    pick(payload, ["image_url", "imageUrl", "video_url", "videoUrl"], "").trim() ||
    pick(row, ["mg_output_url", "outputUrl", "output_url"], "").trim() ||
    pick(row, ["mg_image_url", "imageUrl", "image_url"], "").trim() ||
    pick(row, ["mg_video_url", "videoUrl", "video_url"], "").trim();

  return out;
}

function findLikedGenerationId(row: Row) {
  if (!isLikeEventRow(row)) return "";

  const metaRaw = (row as any)?.mg_meta ?? (row as any)?.meta ?? null;
  const metaObj = tryParseJson<any>(metaRaw) ?? metaRaw ?? {};
  const metaPayloadRaw = metaObj?.payload ?? null;
  const metaPayload = tryParseJson<any>(metaPayloadRaw) ?? metaPayloadRaw ?? {};

  const payloadRaw = (row as any)?.mg_payload ?? (row as any)?.payload ?? null;
  const payload = tryParseJson<any>(payloadRaw) ?? payloadRaw ?? {};

  const gid =
    safeString((row as any)?.mg_generation_id, "").trim() ||
    safeString(metaPayload?.generation_id ?? metaPayload?.generationId ?? metaPayload?.generationID, "").trim() ||
    safeString(payload?.generation_id ?? payload?.generationId ?? payload?.generationID, "").trim();

  return gid;
}

// ---------- INPUT EXTRACTION (USER BRIEF) ----------

function extractInputsForDisplay(row: Row, isMotionHint?: boolean) {
  const payloadRaw = (row as any)?.mg_payload ?? (row as any)?.payload ?? null;
  const metaRaw = (row as any)?.mg_meta ?? (row as any)?.meta ?? null;
  const varsRaw =
    (row as any)?.mg_mma_vars ??
    (row as any)?.mg_vars ??
    (row as any)?.vars ??
    (row as any)?.mma_vars ??
    null;

  const payload = tryParseJson<any>(payloadRaw) ?? payloadRaw ?? null;
  const meta = tryParseJson<any>(metaRaw) ?? metaRaw ?? null;
  const vars = tryParseJson<any>(varsRaw) ?? varsRaw ?? null;

  const varsAssets = vars && typeof vars === "object" ? (vars as any).assets : null;
  const varsInputs = vars && typeof vars === "object" ? (vars as any).inputs : null;
  const varsHistory = vars && typeof vars === "object" ? (vars as any).history : null;
  const varsMeta = vars && typeof vars === "object" ? (vars as any).meta : null;
  const varsFeedback = vars && typeof vars === "object" ? (vars as any).feedback : null;

  const flow = String(varsMeta?.flow || meta?.flow || "").toLowerCase();
  const mmaMode = String((row as any)?.mg_mma_mode || vars?.mode || "").toLowerCase();

  const isTweak =
    flow.includes("tweak") ||
    flow.includes("edit") ||
    flow.includes("revise") ||
    flow.includes("variant") ||
    flow.includes("iterate");

  const isMotion =
    typeof isMotionHint === "boolean"
      ? isMotionHint
      : mmaMode === "video" ||
        mmaMode === "motion" ||
        flow.includes("video") ||
        flow.includes("animate") ||
        flow.includes("motion");

  // ----------------------------
  // ✅ USER BRIEF ONLY (no AI prompt)
  // ----------------------------

  const commonUser = pick(varsInputs, ["brief", "user_brief", "userBrief", "prompt", "user_prompt", "userPrompt"], "");
  const commonUserMeta = pick(varsMeta, ["brief", "user_brief", "userBrief", "prompt", "user_prompt", "userPrompt"], "");

  // Still
  const stillCreate = commonUser || commonUserMeta;
  const stillTweak = pick(varsInputs, ["tweak_brief", "tweak_user_brief", "tweakBrief"], "");
  const fbStill = pick(varsFeedback, ["still_feedback", "stillFeedback", "feedback_still"], "");

  // Motion / Video
  const motionCreate =
    pick(varsInputs, ["motion_user_brief", "motionUserBrief", "motion_brief", "motionBrief"], "") ||
    commonUser ||
    commonUserMeta;

  const motionOverride = pick(varsInputs, ["prompt_override", "motion_prompt_override", "motionPromptOverride"], "");

  const motionTweak = pick(varsInputs, ["tweak_motion_user_brief", "tweakMotionUserBrief"], "");
  const fbMotion = pick(varsFeedback, ["motion_feedback", "motionFeedback", "feedback_motion"], "");

  // Last resort user-entered legacy fields (still user-typed)
  const legacyUser =
    pick(row, ["mg_user_prompt", "mg_user_message", "mg_brief"], "") ||
    pick(payload?.inputs, ["brief", "user_brief", "userBrief", "motion_user_brief", "prompt", "userPrompt"], "") ||
    pick(payload, ["brief", "user_brief", "userBrief", "motion_user_brief", "prompt", "userPrompt"], "") ||
    pick(meta, ["brief", "user_brief", "userBrief", "userPrompt", "user_prompt", "prompt"], "");

  const candidates: string[] = isMotion
    ? isTweak
      ? [motionTweak, fbMotion, motionOverride, motionCreate, fbStill, stillCreate, legacyUser]
      : [motionCreate, motionOverride, fbMotion, motionTweak, fbStill, stillCreate, legacyUser]
    : isTweak
    ? [stillTweak, fbStill, stillCreate, fbMotion, motionCreate, legacyUser]
    : [stillCreate, fbStill, stillTweak, legacyUser];

  const brief =
    candidates
      .map((s) => sanitizeUserBrief(String(s || "")))
      .map((s) => s.trim())
      .filter(Boolean)
      .filter((s) => !looksLikeSystemPrompt(s))[0] || "";

  // ----------------------------
  // extractions for recreate + details
  // ----------------------------

  const aspect =
    normalizeAspectRatio(
      pick(row, ["mg_aspect_ratio", "aspect_ratio", "aspectRatio"], "") ||
        pick(meta, ["aspectRatio", "aspect_ratio"], "") ||
        pick(payload, ["aspect_ratio", "aspectRatio"], "") ||
        pick(payload?.inputs, ["aspect_ratio", "aspectRatio"], "") ||
        pick(varsInputs, ["aspect_ratio", "aspectRatio", "ratio"], "") ||
        pick(varsMeta, ["aspectRatio", "aspect_ratio", "ratio"], "")
    ) || "";

  const stylePresetKeysRaw =
    meta?.stylePresetKeys ??
    meta?.style_preset_keys ??
    payload?.settings?.stylePresetKeys ??
    payload?.settings?.style_preset_keys ??
    payload?.inputs?.stylePresetKeys ??
    payload?.inputs?.style_preset_keys ??
    varsMeta?.stylePresetKeys ??
    varsMeta?.style_preset_keys ??
    varsInputs?.stylePresetKeys ??
    varsInputs?.style_preset_keys ??
    vars?.stylePresetKeys ??
    vars?.style_preset_keys ??
    null;

  const stylePresetKeyRaw =
    meta?.stylePresetKey ??
    meta?.style_preset_key ??
    payload?.settings?.stylePresetKey ??
    payload?.settings?.style_preset_key ??
    payload?.inputs?.stylePresetKey ??
    payload?.inputs?.style_preset_key ??
    varsMeta?.stylePresetKey ??
    varsMeta?.style_preset_key ??
    varsInputs?.stylePresetKey ??
    varsInputs?.style_preset_key ??
    vars?.stylePresetKey ??
    vars?.style_preset_key ??
    null;

  const stylePresetKeys: string[] = Array.isArray(stylePresetKeysRaw)
    ? stylePresetKeysRaw.map(String).filter(Boolean)
    : stylePresetKeyRaw
    ? [String(stylePresetKeyRaw)]
    : [];

  const minaVisionEnabled =
    typeof meta?.minaVisionEnabled === "boolean"
      ? meta.minaVisionEnabled
      : typeof payload?.settings?.minaVisionEnabled === "boolean"
      ? payload.settings.minaVisionEnabled
      : typeof payload?.inputs?.minaVisionEnabled === "boolean"
      ? payload.inputs.minaVisionEnabled
      : typeof varsHistory?.vision_intelligence === "boolean"
      ? varsHistory.vision_intelligence
      : typeof varsHistory?.visionIntelligence === "boolean"
      ? varsHistory.visionIntelligence
      : undefined;

  const productImageUrl =
    varsAssets?.product_image_url ||
    varsAssets?.productImageUrl ||
    varsInputs?.product_image_url ||
    varsInputs?.productImageUrl ||
    meta?.productImageUrl ||
    payload?.assets?.productImageUrl ||
    payload?.assets?.product_image_url ||
    payload?.assets?.product_image ||
    vars?.productImageUrl ||
    vars?.product_image_url ||
    "";

  const logoImageUrl =
    varsAssets?.logo_image_url ||
    varsAssets?.logoImageUrl ||
    varsInputs?.logo_image_url ||
    varsInputs?.logoImageUrl ||
    meta?.logoImageUrl ||
    payload?.assets?.logoImageUrl ||
    payload?.assets?.logo_image_url ||
    payload?.assets?.logo_image ||
    vars?.logoImageUrl ||
    vars?.logo_image_url ||
    "";

  const styleImageUrls =
    varsAssets?.style_image_urls ||
    varsAssets?.styleImageUrls ||
    varsAssets?.inspiration_image_urls ||
    varsAssets?.inspirationImageUrls ||
    varsInputs?.style_image_urls ||
    varsInputs?.styleImageUrls ||
    meta?.styleImageUrls ||
    payload?.assets?.styleImageUrls ||
    payload?.assets?.style_image_urls ||
    payload?.assets?.inspiration_image_urls ||
    vars?.styleImageUrls ||
    vars?.style_image_urls ||
    [];

  const styleImages: string[] = Array.isArray(styleImageUrls)
    ? styleImageUrls.map(String).filter((u) => String(u).startsWith("http"))
    : [];

  const startImageUrl =
    String(
      varsAssets?.start_image_url ||
        varsAssets?.startImageUrl ||
        varsInputs?.start_image_url ||
        varsInputs?.startImageUrl ||
        varsInputs?.kling_start_image_url ||
        varsInputs?.klingStartImageUrl ||
        ""
    ).trim() || "";

  const endImageUrl =
    String(
      varsAssets?.end_image_url ||
        varsAssets?.endImageUrl ||
        varsInputs?.end_image_url ||
        varsInputs?.endImageUrl ||
        varsInputs?.kling_end_image_url ||
        varsInputs?.klingEndImageUrl ||
        ""
    ).trim() || "";

  const tone = String(
    meta?.tone || payload?.inputs?.tone || payload?.tone || varsInputs?.tone || varsMeta?.tone || vars?.tone || ""
  ).trim();

  const platform = String(
    meta?.platform ||
      payload?.inputs?.platform ||
      payload?.platform ||
      varsInputs?.platform ||
      varsMeta?.platform ||
      vars?.platform ||
      ""
  ).trim();

  return {
    brief,
    aspectRatio: aspect,
    stylePresetKeys,
    minaVisionEnabled,
    productImageUrl: String(productImageUrl || "").trim(),
    logoImageUrl: String(logoImageUrl || "").trim(),
    styleImageUrls: styleImages,
    startImageUrl,
    endImageUrl,
    tone,
    platform,
  };
}

type RecreateDraft = {
  mode: "still" | "motion";
  brief: string;
  settings: {
    aspect_ratio?: string;
    minaVisionEnabled?: boolean;
    stylePresetKeys?: string[];
  };
  assets: {
    productImageUrl?: string;
    logoImageUrl?: string;
    styleImageUrls?: string[];
    kling_start_image_url?: string;
    kling_end_image_url?: string;
  };
};

type ProfileProps = {
  email?: string;
  credits?: number | null;
  expiresAt?: string | null;

  generations?: Row[];
  feedbacks?: Row[];

  loading?: boolean;
  error?: string | null;

  onBackToStudio?: () => void;
  onLogout?: () => void;

  // ✅ for Matcha popup (same URL you pass to StudioLeft)
  matchaUrl?: string;

  onRefresh?: () => void;

  onDelete?: (id: string) => Promise<void> | void;
  onRecreate?: (draft: RecreateDraft) => void;
};

export default function Profile({
  email = "",
  credits = null,
  expiresAt = null,
  generations = [],
  feedbacks = [],
  loading = false,
  error = null,
  onBackToStudio,
  onLogout,
  onDelete,
  onRecreate,
  matchaUrl = "https://www.faltastudio.com/cart/43328351928403:1",
}: ProfileProps) {
  const [deletingIds, setDeletingIds] = useState<Record<string, boolean>>({});
  const [removingIds, setRemovingIds] = useState<Record<string, boolean>>({});
  const [removedIds, setRemovedIds] = useState<Record<string, boolean>>({});
  const [ghostIds, setGhostIds] = useState<Record<string, boolean>>({});
  const [deleteErrors, setDeleteErrors] = useState<Record<string, string>>({});
  const [confirmDeleteIds, setConfirmDeleteIds] = useState<Record<string, boolean>>({});
  const [lightbox, setLightbox] = useState<{ url: string; isMotion: boolean } | null>(null);

  // Filters
  const [motion, setMotion] = useState<"all" | "still" | "motion">("all");
  const cycleMotion = () => setMotion((prev) => (prev === "all" ? "motion" : prev === "motion" ? "still" : "all"));
  const motionLabel = motion === "all" ? "Show all" : motion === "motion" ? "Motion" : "Still";

  const [likedOnly, setLikedOnly] = useState(false);
  const [aspectFilterStep, setAspectFilterStep] = useState(0);
  const activeAspectFilter = aspectFilterStep === 0 ? null : ASPECT_OPTIONS[aspectFilterStep - 1];
  const cycleAspectFilter = () => setAspectFilterStep((prev) => (prev + 1) % (ASPECT_OPTIONS.length + 1));
  const aspectFilterLabel = activeAspectFilter ? activeAspectFilter.label : "Ratio";

  const [expandedPromptIds, setExpandedPromptIds] = useState<Record<string, boolean>>({});

  // Pagination
  const [visibleCount, setVisibleCount] = useState(36);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  // Video refs
  const videoElsRef = useRef<Map<string, HTMLVideoElement>>(new Map());
  const hoveredVideoIdRef = useRef<string | null>(null);

  const registerVideoEl = useCallback((id: string, el: HTMLVideoElement | null) => {
    const m = videoElsRef.current;
    if (el) {
      el.dataset.minaId = id; // ✅ safe
      m.set(id, el);
    } else {
      m.delete(id);
    }
  }, []);

  // Hover audio (desktop only). Browsers may still block sound in some cases,
  // but this is the correct / safest approach.
  const setVideoHover = useCallback((id: string, hovering: boolean) => {
    const el = videoElsRef.current.get(id);
    if (!el) return;

    hoveredVideoIdRef.current =
      hovering ? id : hoveredVideoIdRef.current === id ? null : hoveredVideoIdRef.current;

    try {
      el.muted = !hovering;
      el.volume = 1;
      if (hovering) el.play().catch(() => {});
    } catch {}
  }, []);

  const openLightbox = (url: string | null, isMotion: boolean) => {
    if (!url) return;
    setLightbox({ url, isMotion });
  };
  const closeLightbox = () => setLightbox(null);

  const preloadedRef = useRef<Set<string>>(new Set());

  const prefetchImage = useCallback((url: string) => {
    if (!url) return;
    if (preloadedRef.current.has(url)) return;
    preloadedRef.current.add(url);

    const img = new Image();
    try {
      (img as any).decoding = "async";
    } catch {}
    img.src = url;
  }, []);

  // -----------------------------
  // Lightbox close: swipe any direction (mobile) + click/esc (desktop)
  // -----------------------------
  const lightboxSwipeRef = useRef<{
    active: boolean;
    pointerId: number;
    startX: number;
    startY: number;
    startedAt: number;
    pointerType: string;
  }>({
    active: false,
    pointerId: -1,
    startX: 0,
    startY: 0,
    startedAt: 0,
    pointerType: "",
  });

  const lightboxJustSwipedRef = useRef(false);

  const SWIPE_CLOSE_PX = 70;
  const SWIPE_MAX_MS = 900;

  const onLightboxPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!lightbox) return;

      const pt = String((e as any).pointerType || "");
      if (pt === "mouse") return;

      lightboxSwipeRef.current = {
        active: true,
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        startedAt: Date.now(),
        pointerType: pt,
      };

      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {}

      e.preventDefault();
    },
    [lightbox]
  );

  const onLightboxPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const st = lightboxSwipeRef.current;
      if (!lightbox) return;
      if (!st.active) return;
      if (st.pointerId !== e.pointerId) return;

      const dx = e.clientX - st.startX;
      const dy = e.clientY - st.startY;
      const dist = Math.hypot(dx, dy);
      const age = Date.now() - st.startedAt;

      if (dist >= SWIPE_CLOSE_PX && age <= SWIPE_MAX_MS) {
        lightboxJustSwipedRef.current = true;
        st.active = false;
        try {
          e.currentTarget.releasePointerCapture(e.pointerId);
        } catch {}
        closeLightbox();
        e.preventDefault();
      }
    },
    [lightbox, closeLightbox]
  );

  const onLightboxPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const st = lightboxSwipeRef.current;
    if (st.pointerId !== e.pointerId) return;
    st.active = false;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {}
  }, []);

  // ============================================================
  // Matcha quantity popup (same behavior as StudioLeft)
  // ============================================================
  const [matchaQtyOpen, setMatchaQtyOpen] = useState(false);
  const [matchaQty, setMatchaQty] = useState(1);

  const clampQty = (n: number) => Math.max(1, Math.min(10, Math.floor(Number(n || 1))));

  const buildMatchaCheckoutUrl = (base: string, qty: number) => {
    const q = clampQty(qty);
    try {
      const u = new URL(String(base || ""));

      const m = u.pathname.match(/\/cart\/(\d+)(?::(\d+))?/);
      if (m?.[1]) {
        const id = m[1];
        u.pathname = `/cart/${id}:${q}`;
        return u.toString();
      }

      if (u.pathname.includes("/cart/add")) {
        u.searchParams.set("quantity", String(q));
        return u.toString();
      }

      u.searchParams.set("quantity", String(q));
      return u.toString();
    } catch {
      return String(base || "");
    }
  };

  const openMatchaQty = () => {
    setMatchaQty(1);
    setMatchaQtyOpen(true);
  };

  const confirmMatchaQty = (qty: number) => {
    const url = buildMatchaCheckoutUrl(matchaUrl, qty);
    setMatchaQtyOpen(false);
    window.open(url, "_blank", "noopener,noreferrer");
  };

  useEffect(() => {
    if (!lightbox) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeLightbox();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [lightbox]);

  const askDelete = (id: string) => {
    setDeleteErrors((prev) => ({ ...prev, [id]: "" }));
    setConfirmDeleteIds((prev) => ({ ...prev, [id]: true }));
  };

  const cancelDelete = (id: string) => {
    setConfirmDeleteIds((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  const deleteItem = async (id: string) => {
    setRemovingIds((prev) => ({ ...prev, [id]: true }));
    setDeletingIds((prev) => ({ ...prev, [id]: true }));
    cancelDelete(id);

    try {
      if (!onDelete) throw new Error("Delete not available.");
      await onDelete(id);

      setGhostIds((prev) => ({ ...prev, [id]: true }));

      setTimeout(() => {
        setRemovedIds((prev) => ({ ...prev, [id]: true }));
        setGhostIds((prev) => {
          const next = { ...prev };
          delete next[id];
          return next;
        });
      }, 260);
    } catch (e: any) {
      setDeleteErrors((prev) => ({ ...prev, [id]: safeString(e?.message, "Delete failed.") }));
      setRemovingIds((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    } finally {
      setDeletingIds((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      setRemovingIds((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    }
  };

  // Likes set (by canonical URL)
  const likedUrlSet = useMemo(() => {
    const s = new Set<string>();
    for (const f of feedbacks) {
      const likeUrl = canonicalAssetUrl(findLikeUrl(f));
      if (likeUrl) s.add(likeUrl);
    }
    return s;
  }, [feedbacks]);

  const { items, activeCount } = useMemo(() => {
    // liked generation ids from feedback events
    const likedGenIdSet = new Set<string>();
    for (const f of feedbacks) {
      const gid = findLikedGenerationId(f);
      if (gid) likedGenIdSet.add(gid);
    }

    const baseRows: Array<{ row: Row; source: "generation" }> = generations.map((g) => ({
      row: g,
      source: "generation" as const,
    }));

    let base = baseRows
      .map(({ row: g, source }, idx) => {
        const payloadRaw: any = (g as any)?.mg_payload ?? (g as any)?.payload ?? null;
        const metaRaw: any = (g as any)?.mg_meta ?? (g as any)?.meta ?? null;
        const payload: any = tryParseJson<any>(payloadRaw) ?? payloadRaw ?? null;
        const meta: any = tryParseJson<any>(metaRaw) ?? metaRaw ?? null;

        const generationId = safeString(pick(g, ["mg_generation_id", "generation_id", "generationId", "id"]), "").trim();
        const id = generationId || safeString(pick(g, ["mg_id", "id"]), `row_${idx}`).trim();

        if (removedIds[id]) return null;

        const createdAt = safeString(pick(g, ["created_at", "mg_created_at", "ts", "timestamp"]), "").trim();

        const outUrl = pick(g, ["mg_output_url", "outputUrl", "output_url"], "").trim();
        const imgUrl = pick(g, ["mg_image_url", "imageUrl", "image_url"], "").trim();
        const vidUrl = pick(g, ["mg_video_url", "videoUrl", "video_url"], "").trim();

        const aspectRaw =
          pick(g, ["mg_aspect_ratio", "aspect_ratio", "aspectRatio"], "") ||
          pick(meta, ["aspectRatio", "aspect_ratio"], "") ||
          pick(payload, ["aspect_ratio", "aspectRatio"], "") ||
          pick(payload?.inputs, ["aspect_ratio", "aspectRatio"], "");

        const contentType = pick(g, ["mg_content_type", "contentType"], "").toLowerCase();
        const kindHint = String(pick(g, ["mg_result_type", "resultType", "mg_type", "type"], "")).toLowerCase();

        const looksVideoMeta = contentType.includes("video") || kindHint.includes("motion") || kindHint.includes("video");
        const looksImage = isImageUrl(outUrl) || isImageUrl(imgUrl);

        const videoUrl = vidUrl || (isVideoUrl(outUrl) ? outUrl : looksVideoMeta && !looksImage ? outUrl : "");
        const imageUrl = imgUrl || (!videoUrl ? outUrl : "");
        const url = (videoUrl || imageUrl || outUrl).trim();
        const isMotion = Boolean(videoUrl);

        const inputs = extractInputsForDisplay(g, isMotion || looksVideoMeta);

        const aspectRatio =
          inputs.aspectRatio ||
          normalizeAspectRatio(aspectRaw) ||
          normalizeAspectRatio(
            typeof payload?.aspect_ratio === "string"
              ? payload.aspect_ratio
              : typeof payload?.aspectRatio === "string"
              ? payload.aspectRatio
              : ""
          );

        const liked =
          (generationId && likedGenIdSet.has(generationId)) ||
          (url ? likedUrlSet.has(canonicalAssetUrl(url)) : false);

        const prompt = (inputs.brief || "").trim();

        const canRecreate = source === "generation" && !!onRecreate && !!prompt;

        const draft: RecreateDraft | null = canRecreate
          ? {
              mode: isMotion ? "motion" : "still",
              brief: prompt,
              settings: {
                aspect_ratio: inputs.aspectRatio || undefined,
                minaVisionEnabled: inputs.minaVisionEnabled,
                stylePresetKeys: inputs.stylePresetKeys.length ? inputs.stylePresetKeys : undefined,
              },
              assets: {
                productImageUrl: inputs.productImageUrl || undefined,
                logoImageUrl: inputs.logoImageUrl || undefined,
                styleImageUrls: inputs.styleImageUrls.length ? inputs.styleImageUrls : undefined,
                ...(isMotion && inputs.startImageUrl ? { kling_start_image_url: inputs.startImageUrl } : {}),
                ...(isMotion && inputs.endImageUrl ? { kling_end_image_url: inputs.endImageUrl } : {}),
              },
            }
          : null;

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
          inputs,
          canRecreate,
          draft,
        };
      })
      .filter((x): x is NonNullable<typeof x> => Boolean(x && x.url));

    base.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));

    // Merge duplicates by canonical URL
    const merged = new Map<string, typeof base[number]>();
    for (const it of base) {
      const key = canonicalAssetUrl(it.url);
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

    const deduped = Array.from(merged.values());

    // ✅ ACTUAL FILTERING (not just dimming)
    const filtered = deduped.filter((it) => {
      const matchesMotion = motion === "all" ? true : motion === "motion" ? it.isMotion : !it.isMotion;
      const matchesLiked = !likedOnly || it.liked;
      const matchesAspect = !activeAspectFilter || it.aspectRatio === activeAspectFilter.ratio;
      return matchesMotion && matchesLiked && matchesAspect;
    });

    const out = filtered.map((it, idx) => {
      let sizeClass = "profile-card--tall";
      if (idx % 13 === 0) sizeClass = "profile-card--hero";
      else if (idx % 9 === 0) sizeClass = "profile-card--wide";
      else if (idx % 7 === 0) sizeClass = "profile-card--mini";
      return { ...it, sizeClass };
    });

    return { items: out, activeCount: out.length };
  }, [generations, feedbacks, likedUrlSet, motion, likedOnly, activeAspectFilter, onRecreate, removedIds]);

  // Reset paging when list changes
  useEffect(() => {
    setVisibleCount(36);
  }, [items.length]);

  // Infinite load
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;

    const obs = new IntersectionObserver(
      (entries) => {
        if (!entries[0].isIntersecting) return;
        setVisibleCount((c) => Math.min(items.length, c + 24));
      },
      { rootMargin: "1400px 0px 1400px 0px" }
    );

    obs.observe(el);
    return () => obs.disconnect();
  }, [items.length]);

  const visibleItems = useMemo(() => items.slice(0, visibleCount), [items, visibleCount]);

  // Grid video autoplay (muted) + hover audio (desktop)
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

    const playVisible = () => {
      els.forEach((v) => {
        const ratio = visible.get(v) ?? 0;
        const shouldPlay = ratio >= 0.35;

        try {
          const id = v.dataset?.minaId || "";
          const hovering = id && hoveredVideoIdRef.current === id;

          // autoplay must be muted; only unmute on hover
          v.muted = !hovering;

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
        playVisible();
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
      else playVisible();
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      document.removeEventListener("visibilitychange", onVis);
      observer.disconnect();
      pauseAll();
    };
  }, [visibleItems.length]);

  const onTogglePrompt = (id: string) => setExpandedPromptIds((prev) => ({ ...prev, [id]: !prev[id] }));

  return (
    <>
      <TopLoadingBar active={loading} />

      <MatchaQtyModal
        open={matchaQtyOpen}
        qty={matchaQty}
        setQty={(n) => setMatchaQty(clampQty(n))}
        onClose={() => setMatchaQtyOpen(false)}
        onConfirm={(q) => confirmMatchaQty(q)}
        title="Get more Matcha"
        min={1}
        max={10}
      />

      {lightbox ? (
        <div
          className="profile-lightbox"
          role="dialog"
          aria-modal="true"
          onClick={() => {
            if (lightboxJustSwipedRef.current) {
              lightboxJustSwipedRef.current = false;
              return;
            }
            closeLightbox();
          }}
          onPointerDown={onLightboxPointerDown}
          onPointerMove={onLightboxPointerMove}
          onPointerUp={onLightboxPointerUp}
          onPointerCancel={onLightboxPointerUp}
        >
          <div
            className="profile-lightbox-media"
            onClick={(e) => {
              e.stopPropagation();
              closeLightbox();
            }}
          >
            {lightbox.isMotion ? (
              <video
                className="profile-lightbox-video"
                src={lightbox.url}
                autoPlay
                loop
                muted
                playsInline
                controls={false}
                disablePictureInPicture
                controlsList="nodownload noplaybackrate noremoteplayback"
              />
            ) : (
              <img
                className="profile-lightbox-img"
                src={lightbox.url}
                alt=""
                loading="eager"
                decoding="async"
                fetchPriority="high"
                draggable={false}
              />
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

              <button className="profile-toplink" type="button" onClick={openMatchaQty}>
                Get more Matchas
              </button>
            </div>
          </div>

          <div className="profile-meta-strip">
            <div className="profile-kv">
              <span className="profile-k">Email</span>
              <span className="profile-v">{email || "—"}</span>
            </div>

            <div className="profile-kv">
              <span className="profile-k">Matchas</span>
              <span className="profile-v">{credits === null ? "—" : credits}</span>
            </div>

            <div className="profile-kv">
              <span className="profile-k">Best before</span>
              <span className="profile-v">{expiresAt ? fmtDate(expiresAt) : "—"}</span>
            </div>

            <div className="profile-kv">
              <button className="profile-logout-meta" onClick={onLogout} type="button">
                Logout
              </button>
            </div>
          </div>

          <div className="profile-archive-head">
            <div>
              <div className="profile-archive-title">Archive</div>
              <div className="profile-archive-sub">
                {error ? (
                  <span className="profile-error">{error}</span>
                ) : loading ? (
                  "Loading…"
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
          {visibleItems.map((it) => {
            const expanded = Boolean(expandedPromptIds[it.id]);
            const showViewMore = (it.prompt || "").length > 90 || it.canRecreate;

            const deleting = Boolean(deletingIds[it.id]);
            const removing = Boolean(removingIds[it.id]);
            const deleteErr = deleteErrors[it.id];
            const confirming = Boolean(confirmDeleteIds[it.id]);

            const inputs = it.inputs || null;
            const canAnimate = !!it.draft && !it.isMotion && isImageUrl(it.url);

            return (
              <div
                key={it.id}
                className={`profile-card ${it.sizeClass} ${removing ? "is-removing" : ""} ${
                  ghostIds[it.id] ? "is-ghost" : ""
                }`}
              >
                <div className="profile-card-top">
                  <button
                    className="profile-card-show"
                    type="button"
                    onClick={() => downloadMedia(it.url, it.prompt || "", it.isMotion)}
                    disabled={!it.url}
                  >
                    Download
                  </button>

                  <div className="profile-card-top-right">
                    {it.liked ? (
                      <span className="profile-card-liked">Liked</span>
                    ) : (
                      <span className="profile-card-liked ghost">Liked</span>
                    )}

                    {confirming ? (
                      <div className="profile-card-confirm" role="group" aria-label="Confirm delete">
                        <button
                          className="profile-card-confirm-yes"
                          type="button"
                          onClick={() => deleteItem(it.id)}
                          disabled={deleting || !onDelete}
                        >
                          delete
                        </button>
                        <button
                          className="profile-card-confirm-no"
                          type="button"
                          onClick={() => cancelDelete(it.id)}
                          disabled={deleting}
                        >
                          cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        className="profile-card-delete"
                        type="button"
                        onClick={() => askDelete(it.id)}
                        disabled={deleting || !onDelete}
                        title="Delete"
                        aria-label="Delete"
                      >
                        −
                      </button>
                    )}
                  </div>
                </div>

                {deleteErr ? <div className="profile-error profile-card-deleteerr">{deleteErr}</div> : null}

                <div
                  className="profile-card-media"
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    const big = it.isMotion ? it.url : cfThumb(it.url, 2400, 85);
                    if (!it.isMotion) prefetchImage(big);
                    openLightbox(big, it.isMotion);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      const big = it.isMotion ? it.url : cfThumb(it.url, 2400, 85);
                      if (!it.isMotion) prefetchImage(big);
                      openLightbox(big, it.isMotion);
                    }
                  }}
                >
                  {it.url ? (
                    it.isMotion ? (
                      <video
                        ref={(el) => registerVideoEl(it.id, el)}
                        src={it.url}
                        loop
                        playsInline
                        preload="auto"
                        autoPlay
                        muted
                        onMouseEnter={() => setVideoHover(it.id, true)}
                        onMouseLeave={() => setVideoHover(it.id, false)}
                      />
                    ) : (
                      (() => {
                        const w =
                          it.sizeClass === "profile-card--hero"
                            ? 1400
                            : it.sizeClass === "profile-card--wide"
                              ? 1200
                              : it.sizeClass === "profile-card--mini"
                                ? 700
                                : 900;

                        const thumb = cfThumb(it.url, w, 70);

                        return (
                          <img
                            src={thumb}
                            alt=""
                            loading="lazy"
                            decoding="async"
                            onError={(e) => {
                              (e.currentTarget as HTMLImageElement).src = it.url;
                            }}
                          />
                        );
                      })()
                    )
                  ) : (
                    <div style={{ padding: 10, fontSize: 12, opacity: 0.6 }}>No media</div>
                  )}
                </div>

                <div className="profile-card-promptline">
                  <div className={`profile-card-prompt ${expanded ? "expanded" : ""}`}>
                    {it.prompt || "—"}

                    {expanded && inputs ? (
                      <div className="profile-card-details">
                        {it.canRecreate && it.draft ? (
                          <div className="profile-card-detailrow">
                            <button
                              type="button"
                              className="profile-card-show profile-card-recreate"
                              onClick={() => {
                                onRecreate?.(it.draft!);
                                onBackToStudio?.();
                              }}
                            >
                              Re-create
                            </button>

                            {canAnimate ? (
                              <button
                                type="button"
                                className="profile-card-show profile-card-animate"
                                onClick={() => {
                                  const motionDraft: RecreateDraft = {
                                    ...it.draft!,
                                    mode: "motion",
                                    assets: {
                                      ...it.draft!.assets,
                                      kling_start_image_url: it.url,
                                    },
                                  };
                                  onRecreate?.(motionDraft);
                                  onBackToStudio?.();
                                }}
                              >
                                Animate
                              </button>
                            ) : (
                              <span />
                            )}
                          </div>
                        ) : null}

                        {inputs.aspectRatio ? (
                          <div className="profile-card-detailrow">
                            <span className="k">Aspect</span>
                            <span className="v">{inputs.aspectRatio}</span>
                          </div>
                        ) : null}

                        {typeof inputs.minaVisionEnabled === "boolean" ? (
                          <div className="profile-card-detailrow">
                            <span className="k">Vision</span>
                            <span className="v">{inputs.minaVisionEnabled ? "On" : "Off"}</span>
                          </div>
                        ) : null}

                        {inputs.stylePresetKeys?.length ? (
                          <div className="profile-card-detailrow">
                            <span className="k">Styles</span>
                            <span className="v">{inputs.stylePresetKeys.join(", ")}</span>
                          </div>
                        ) : null}

                        {inputs.productImageUrl ? (
                          <div className="profile-card-detailrow">
                            <span className="k">Product</span>
                            <span className="v">
                              <button
                                className="profile-card-mini"
                                type="button"
                                onClick={() => {
                                  prefetchImage(inputs.productImageUrl);
                                  openLightbox(inputs.productImageUrl, false);
                                }}
                              >
                                view
                              </button>
                            </span>
                          </div>
                        ) : null}

                        {inputs.logoImageUrl ? (
                          <div className="profile-card-detailrow">
                            <span className="k">Logo</span>
                            <span className="v">
                              <button
                                className="profile-card-mini"
                                type="button"
                                onClick={() => {
                                  prefetchImage(inputs.logoImageUrl);
                                  openLightbox(inputs.logoImageUrl, false);
                                }}
                              >
                                view
                              </button>
                            </span>
                          </div>
                        ) : null}

                        {inputs.styleImageUrls?.length ? (
                          <div className="profile-card-detailrow">
                            <span className="k">Inspo</span>
                            <span className="v">
                              <button
                                className="profile-card-mini"
                                type="button"
                                onClick={() => {
                                  prefetchImage(inputs.styleImageUrls[0]);
                                  openLightbox(inputs.styleImageUrls[0], false);
                                }}
                              >
                                view
                              </button>
                              {inputs.styleImageUrls.length > 1 ? (
                                <span className="profile-card-miniNote">+{inputs.styleImageUrls.length - 1}</span>
                              ) : null}
                            </span>
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </div>

                  {showViewMore ? (
                    <button className="profile-card-viewmore" type="button" onClick={() => onTogglePrompt(it.id)}>
                      {expanded ? "less" : "more"}
                    </button>
                  ) : null}
                </div>
              </div>
            );
          })}

          <div ref={sentinelRef} className="profile-grid-sentinel" />
        </div>
      </div>
    </>
  );
}
