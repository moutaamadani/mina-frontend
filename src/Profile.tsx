// =============================================================
// FILE: src/Profile.tsx
// Mina — Profile (Render-only, data comes from MinaApp)
//
// What this version does (per your requirements):
// 1) Card text shows ONLY what the USER typed (create/tweak/animate).
// 2) "Re-create" appears for ALL generations (still/motion, create/tweak).
//    - It copies all inputs: images + styles + settings + the user text.
// 3) "Animate" appears ONLY for still IMAGE results (create OR tweak).
//    - It uses the OUTPUT image url as first frame (kling_start_image_url)
//    - Motion text area is EMPTY (brief: "")
// 4) "More" shows details; includes Mina prompt used (clean_prompt/motion_prompt)
// =============================================================

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./Profile.css";
import TopLoadingBar from "./components/TopLoadingBar";
import MatchaQtyModal from "./components/MatchaQtyModal";

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

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "2-digit" });
}

function guessDownloadExt(url: string, fallbackExt: string) {
  const lower = (url || "").toLowerCase().split("?")[0].split("#")[0];
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

function buildDownloadName(url: string, id?: string | null) {
  const ext = guessDownloadExt(url, ".png");
  const short = (id || "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 10);
  const base = short ? `Mina_${short}` : "Mina_export";
  return base.endsWith(ext) ? base : `${base}${ext}`;
}

async function downloadMedia(url: string, id?: string | null) {
  if (!url) return;

  try {
    const res = await fetch(url, { mode: "cors" });
    if (!res.ok) throw new Error("fetch failed");
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = buildDownloadName(url, id);
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    setTimeout(() => URL.revokeObjectURL(objectUrl), 1500);
    return;
  } catch {
    window.open(url, "_blank", "noopener,noreferrer");
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

// Likes are feedback rows where comment is empty.
function findLikeUrl(row: Row) {
  const payload = (row as any)?.mg_payload ?? (row as any)?.payload ?? null;
  const payloadObj = tryParseJson<any>(payload) ?? payload;

  const payloadComment = typeof payloadObj?.comment === "string" ? payloadObj.comment.trim() : null;

  const commentFieldPresent =
    Object.prototype.hasOwnProperty.call(row, "mg_comment") || Object.prototype.hasOwnProperty.call(row, "comment");

  const commentValue = commentFieldPresent ? pick(row, ["mg_comment", "comment"], "") : null;
  const commentTrim = typeof commentValue === "string" ? commentValue.trim() : null;

  const isLike = (payloadComment !== null && payloadComment === "") || (commentTrim !== null && commentTrim === "");
  if (!isLike) return "";

  const out = pick(row, ["mg_output_url", "outputUrl", "output_url"], "").trim();
  const img = pick(row, ["mg_image_url", "imageUrl", "image_url"], "").trim();
  const vid = pick(row, ["mg_video_url", "videoUrl", "video_url"], "").trim();

  return vid || (isVideoUrl(out) ? out : "") || img || out;
}

type RecreateDraft = {
  mode: "still" | "motion";
  brief: string; // IMPORTANT: for still => user typed; for motion => user typed (or empty if Animate button)
  settings: {
    aspect_ratio?: string;
    minaVisionEnabled?: boolean;
    stylePresetKeys?: string[];
  };
  assets: {
    productImageUrl?: string;
    logoImageUrl?: string;
    styleImageUrls?: string[];

    // motion frames
    kling_start_image_url?: string;
    kling_end_image_url?: string;
  };

  // optional metadata (harmless extra fields if MinaApp wants them)
  source_generation_id?: string;
  result_url?: string;
};

function looksLikeSystemPrompt(s: string) {
  const t = (s || "").trim();
  if (!t) return false;
  if (t.length > 350) return true;
  const low = t.toLowerCase();
  if (low.includes("you are") && (low.includes("assistant") || low.includes("system"))) return true;
  if (low.includes("do not") && low.includes("must")) return true;
  return false;
}

/**
 * Extract what the USER typed (the thing you want to show on the card).
 * - still create/tweak: feedback.still_feedback first, then inputs.brief
 * - motion animate/tweak: feedback.motion_feedback first, then inputs.motion_user_brief
 */
function extractUserTypedText(args: {
  row: Row;
  payload: any;
  meta: any;
  vars: any;
  isMotionResult: boolean;
}): string {
  const { row, payload, meta, vars, isMotionResult } = args;

  const varsInputs = vars && typeof vars === "object" ? (vars as any).inputs : null;
  const varsFeedback = vars && typeof vars === "object" ? (vars as any).feedback : null;

  const stillFeedback = String(
    pick(varsFeedback, ["still_feedback", "stillFeedback", "feedback", "still"], "") ||
      pick(payload?.feedback, ["still_feedback", "stillFeedback"], "") ||
      ""
  ).trim();

  const motionFeedback = String(
    pick(varsFeedback, ["motion_feedback", "motionFeedback", "motion"], "") ||
      pick(payload?.feedback, ["motion_feedback", "motionFeedback"], "") ||
      ""
  ).trim();

  const stillBrief = String(
    pick(varsInputs, ["brief", "userBrief", "user_brief"], "") ||
      pick(payload?.inputs, ["brief", "userBrief", "user_brief", "userPrompt", "user_prompt"], "") ||
      pick(payload, ["user_brief", "userBrief", "brief", "userPrompt", "user_prompt"], "") ||
      pick(meta, ["userBrief", "user_brief", "brief", "userPrompt", "user_prompt"], "") ||
      pick(row, ["mg_user_prompt", "mg_user_message", "userPrompt", "user_prompt", "brief", "mg_brief"], "") ||
      ""
  ).trim();

  const motionBrief = String(
    pick(varsInputs, ["motion_user_brief", "motionUserBrief"], "") ||
      pick(payload?.inputs, ["motion_user_brief", "motionUserBrief"], "") ||
      pick(payload, ["motion_user_brief", "motionUserBrief"], "") ||
      pick(row, ["mg_motion_user_brief"], "") ||
      ""
  ).trim();

  // If it's a motion RESULT => user typed text is motion_feedback or motion_user_brief
  if (isMotionResult) {
    const out = (motionFeedback || motionBrief || "").trim();
    return out;
  }

  // If it's a still RESULT => user typed text is still_feedback or inputs.brief
  const out = (stillFeedback || stillBrief || "").trim();
  return out;
}

/**
 * Extract the "Mina prompt used" (clean_prompt / motion_prompt / mg_prompt).
 * This is NOT what we display on the card, but nice to show inside "more".
 */
function extractUsedPrompt(args: { row: Row; vars: any; isMotionResult: boolean }): string {
  const { row, vars, isMotionResult } = args;
  const varsPrompts = vars && typeof vars === "object" ? (vars as any).prompts : null;

  const fromVars = String(
    isMotionResult ? pick(varsPrompts, ["motion_prompt", "motionPrompt"], "") : pick(varsPrompts, ["clean_prompt", "cleanPrompt"], "")
  ).trim();

  const rawFallback = safeString(pick(row, ["mg_prompt", "prompt"], ""), "").trim();
  const fallbackPrompt = rawFallback && !looksLikeSystemPrompt(rawFallback) ? rawFallback : "";

  return (fromVars || fallbackPrompt || "").trim();
}

function extractInputsForDisplay(row: Row, isMotionResult: boolean) {
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

  const userText = extractUserTypedText({ row, payload, meta, vars, isMotionResult });
  const usedPrompt = extractUsedPrompt({ row, vars, isMotionResult });

  const aspect =
    normalizeAspectRatio(
      pick(row, ["mg_aspect_ratio", "aspect_ratio", "aspectRatio"], "") ||
        pick(meta, ["aspectRatio", "aspect_ratio"], "") ||
        pick(payload, ["aspect_ratio", "aspectRatio"], "") ||
        pick(payload?.inputs, ["aspect_ratio", "aspectRatio"], "") ||
        pick(varsInputs, ["aspect_ratio", "aspectRatio"], "") ||
        pick(varsMeta, ["aspectRatio", "aspect_ratio"], "")
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

  // assets (product/logo/style) – vars.assets FIRST
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
    ? styleImageUrls.map(String).filter((u) => u.startsWith("http"))
    : [];

  // motion start/end images
  const startImageUrl =
    String(
      varsAssets?.start_image_url ||
        varsAssets?.startImageUrl ||
        varsInputs?.start_image_url ||
        varsInputs?.startImageUrl ||
        ""
    ).trim() || "";

  const endImageUrl =
    String(
      varsAssets?.end_image_url ||
        varsAssets?.endImageUrl ||
        varsInputs?.end_image_url ||
        varsInputs?.endImageUrl ||
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
    userText,
    usedPrompt,

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
  const registerVideoEl = useCallback((id: string, el: HTMLVideoElement | null) => {
    const m = videoElsRef.current;
    if (el) m.set(id, el);
    else m.delete(id);
  }, []);

  const openLightbox = (url: string | null, isMotion: boolean) => {
    if (!url) return;
    setLightbox({ url, isMotion });
  };
  const closeLightbox = () => setLightbox(null);

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

      // 👻 turn into ghost (keeps grid space)
      setGhostIds((prev) => ({ ...prev, [id]: true }));

      // remove after fade finishes
      setTimeout(() => {
        setRemovedIds((prev) => ({ ...prev, [id]: true }));
        setGhostIds((prev) => {
          const next = { ...prev };
          delete next[id];
          return next;
        });
      }, 260);
    } catch (e: any) {
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
    }
  };

  // Likes set (by URL)
  const likedUrlSet = useMemo(() => {
    const s = new Set<string>();
    for (const f of feedbacks) {
      const likeUrl = normalizeMediaUrl(findLikeUrl(f));
      if (likeUrl) s.add(likeUrl);
    }
    return s;
  }, [feedbacks]);

  const { items, activeCount } = useMemo(() => {
    // liked generation ids from feedback payloads
    const likedGenIdSet = new Set<string>();
    for (const f of feedbacks) {
      const fpRaw: any = (f as any)?.mg_payload ?? (f as any)?.payload ?? {};
      const fp = tryParseJson<any>(fpRaw) ?? fpRaw;

      const rawLiked = fp?.liked ?? fp?.isLiked ?? fp?.like ?? (f as any)?.liked;
      const isLiked = rawLiked === true || rawLiked === 1 || rawLiked === "true";
      if (!isLiked) continue;

      const gid = safeString(
        (f as any)?.mg_generation_id ??
          fp?.generationId ??
          fp?.generation_id ??
          fp?.generationID ??
          fp?.generation ??
          "",
        ""
      ).trim();

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

        const aspectRatio =
          normalizeAspectRatio(aspectRaw) ||
          normalizeAspectRatio(
            typeof payload?.aspect_ratio === "string"
              ? payload.aspect_ratio
              : typeof payload?.aspectRatio === "string"
              ? payload.aspectRatio
              : ""
          );

        const liked =
          (generationId && likedGenIdSet.has(generationId)) || (url ? likedUrlSet.has(normalizeMediaUrl(url)) : false);

        // Extract inputs (now includes: userText + usedPrompt)
        const inputs = extractInputsForDisplay(g, isMotion);

        // What we show on the card = USER typed text only
        const userText = (inputs.userText || "").trim();

        // Re-create should be available for ALL generations if handler exists
        const canRecreate = source === "generation" && !!onRecreate;

        const draft: RecreateDraft | null = canRecreate
          ? {
              mode: isMotion ? "motion" : "still",
              brief: userText, // user typed text for this generation type
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
              source_generation_id: generationId || id,
              result_url: url || undefined,
            }
          : null;

        return {
          id,
          createdAt,
          userText,
          usedPrompt: (inputs.usedPrompt || "").trim(),
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

    // Merge duplicates by URL
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

      // Prefer non-empty userText if one is empty
      if (!next.userText && other.userText) next.userText = other.userText;
      // Prefer non-empty usedPrompt if one is empty
      if (!next.usedPrompt && other.usedPrompt) next.usedPrompt = other.usedPrompt;

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

  // Grid video autoplay (plays ONLY most-visible)
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
          v.muted = true;
          if (shouldPlay) {
            v.muted = true;
            const p = v.play();
            if (p && typeof p.catch === "function") {
              p.catch(() => {});
            }
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

            // text on card = user typed; show "more" if long OR we have actions/details
            const showViewMore =
              (it.userText || "").length > 90 ||
              !!it.usedPrompt ||
              !!it.inputs?.productImageUrl ||
              !!it.inputs?.logoImageUrl ||
              !!(it.inputs?.styleImageUrls || []).length ||
              !!it.draft;

            const deleting = Boolean(deletingIds[it.id]);
            const removing = Boolean(removingIds[it.id]);
            const deleteErr = deleteErrors[it.id];
            const confirming = Boolean(confirmDeleteIds[it.id]);

            const inputs = it.inputs || null;

            // Animate only for still image results (create OR tweak) => not motion + url is image
            const canAnimate = !!it.draft && !it.isMotion && isImageUrl(it.url);

            return (
              <div
                key={it.id}
                className={`profile-card ${it.sizeClass} ${it.dimmed ? "is-dim" : ""} ${
                  removing ? "is-removing" : ""
                } ${ghostIds[it.id] ? "is-ghost" : ""}`}
              >
                <div className="profile-card-top">
                  <button
                    className="profile-card-show"
                    type="button"
                    onClick={() => downloadMedia(it.url, it.id)}
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
                        preload="auto"
                        autoPlay
                      />
                    ) : (
                      <img src={it.url} alt="" loading="lazy" />
                    )
                  ) : (
                    <div style={{ padding: 10, fontSize: 12, opacity: 0.6 }}>No media</div>
                  )}
                </div>

                {/* USER TYPED TEXT + actions */}
                <div className="profile-card-promptline">
                  <div className={`profile-card-prompt ${expanded ? "expanded" : ""}`}>
                    {/* This is the KEY change: show user typed only */}
                    {it.userText?.trim() ? it.userText.trim() : "—"}

                    {/* Actions row: Re-create always; Animate only for still images */}
                    {!!it.draft && !!onRecreate ? (
                      <div className="profile-card-detailrow" style={{ marginTop: 8 }}>
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
                                // IMPORTANT: motion textarea should be empty
                                brief: "",
                                assets: {
                                  ...it.draft!.assets,
                                  // IMPORTANT: use OUTPUT image as first frame
                                  kling_start_image_url: it.url,
                                  kling_end_image_url: undefined,
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

                    {/* Details in expanded mode */}
                    {expanded && inputs ? (
                      <div className="profile-card-details">
                        {/* Show Mina prompt used (clean_prompt/motion_prompt/mg_prompt) */}
                        {it.usedPrompt && it.usedPrompt.trim() ? (
                          <div className="profile-card-detailrow">
                            <span className="k">Mina prompt</span>
                            <span className="v" style={{ opacity: 0.9 }}>
                              {it.usedPrompt}
                            </span>
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
                                onClick={() => openLightbox(inputs.productImageUrl, false)}
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
                                onClick={() => openLightbox(inputs.logoImageUrl, false)}
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
                                onClick={() => openLightbox(inputs.styleImageUrls[0], false)}
                              >
                                view
                              </button>
                              {inputs.styleImageUrls.length > 1 ? (
                                <span className="profile-card-miniNote">+{inputs.styleImageUrls.length - 1}</span>
                              ) : null}
                            </span>
                          </div>
                        ) : null}

                        {/* If this is a motion generation, allow viewing start/end frames */}
                        {it.isMotion && inputs.startImageUrl ? (
                          <div className="profile-card-detailrow">
                            <span className="k">Start frame</span>
                            <span className="v">
                              <button
                                className="profile-card-mini"
                                type="button"
                                onClick={() => openLightbox(inputs.startImageUrl, false)}
                              >
                                view
                              </button>
                            </span>
                          </div>
                        ) : null}

                        {it.isMotion && inputs.endImageUrl ? (
                          <div className="profile-card-detailrow">
                            <span className="k">End frame</span>
                            <span className="v">
                              <button
                                className="profile-card-mini"
                                type="button"
                                onClick={() => openLightbox(inputs.endImageUrl, false)}
                              >
                                view
                              </button>
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
