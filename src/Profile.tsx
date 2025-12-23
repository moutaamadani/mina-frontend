// =============================================================
// FILE: src/Profile.tsx
// Mina — Profile (Render-only, data comes from MinaApp)
// - Mina-style header (logo left, Back to Studio right, Logout far right)
// - Meta row (email + matchas + expiry)
// - Archive grid (paged render)
// - Click item => open lightbox (no new tab)
// - Prompt line + tiny "more"
// - Expanded view shows "inputs used" + Re-create button (only when expanded)
// - Filters (motion / liked / aspect) => non-matching dim
// - Video autoplay via IntersectionObserver (plays only most-visible)
// =============================================================

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./Profile.css";
import TopLoadingBar from "./components/TopLoadingBar";

type Row = Record<string, any>;

function pick(row: any, keys: string[], fallback = ""): string {
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

// Likes can be legacy feedback rows (comment empty) OR MMA event rows (event_type === "like")
function findLikeUrl(row: Row) {
  const payload = (row as any)?.mg_payload ?? (row as any)?.payload ?? null;

  const eventType = String(
    pick(row, ["mg_event_type", "event_type", "type"], "") || pick(payload, ["event_type", "type"], "")
  )
    .trim()
    .toLowerCase();

  const isLikeEvent = eventType === "like";

  // Legacy: "Likes are feedback rows where comment is empty."
  const payloadComment = typeof payload?.comment === "string" ? payload.comment.trim() : null;

  const commentFieldPresent =
    Object.prototype.hasOwnProperty.call(row, "mg_comment") ||
    Object.prototype.hasOwnProperty.call(row, "comment");

  const commentValue = commentFieldPresent ? pick(row, ["mg_comment", "comment"], "") : null;
  const commentTrim = typeof commentValue === "string" ? commentValue.trim() : null;

  const isLegacyLike = (payloadComment !== null && payloadComment === "") || (commentTrim !== null && commentTrim === "");

  if (!isLikeEvent && !isLegacyLike) return "";

  // MMA events: you post { payload: { url, result_type } }
  const mmaEventUrl =
    pick(payload, ["url", "outputUrl", "output_url", "videoUrl", "video_url", "imageUrl", "image_url"], "").trim() ||
    pick(payload?.payload, ["url", "outputUrl", "output_url", "videoUrl", "video_url", "imageUrl", "image_url"], "").trim();

  // Generations/legacy feedback rows
  const outputs = (row as any)?.mg_outputs ?? (row as any)?.outputs ?? payload?.outputs ?? null;

  const out = pick(row, ["mg_output_url", "outputUrl", "output_url"], "").trim();
  const img = pick(row, ["mg_image_url", "imageUrl", "image_url"], "").trim();
  const vid = pick(row, ["mg_video_url", "videoUrl", "video_url"], "").trim();

  const outVideo = pick(outputs, ["kling_video_url", "video_url"], "").trim();
  const outImage = pick(outputs, ["seedream_image_url", "image_url"], "").trim();

  const chosen =
    mmaEventUrl ||
    vid ||
    outVideo ||
    (isVideoUrl(out) ? out : "") ||
    img ||
    outImage ||
    out;

  return chosen;
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
    // legacy / Studio-friendly (camelCase)
    productImageUrl?: string;
    logoImageUrl?: string;
    styleImageUrls?: string[];
    kling_start_image_url?: string;
    kling_end_image_url?: string;

    // MMA pipeline-friendly (snake_case)
    product_image_url?: string;
    logo_image_url?: string;
    inspiration_image_urls?: string[];
    start_image_url?: string;
    end_image_url?: string;
    kling_image_urls?: string[];
  };
};

function extractInputsForDisplay(row: Row) {
  const payload = (row as any)?.mg_payload ?? (row as any)?.payload ?? null;
  const meta = (row as any)?.mg_meta ?? (row as any)?.meta ?? null;

  const brief =
    pick(row, ["mg_user_prompt", "userPrompt", "promptUser", "prompt_raw", "promptOriginal"], "") ||
    pick(payload?.inputs, ["brief", "userPrompt", "user_prompt", "prompt"], "") ||
    pick(payload, ["userPrompt", "user_prompt", "userMessage", "brief", "prompt"], "") ||
    pick(row, ["mg_prompt", "prompt"], "");

  const aspect =
    normalizeAspectRatio(
      pick(row, ["mg_aspect_ratio", "aspect_ratio", "aspectRatio"], "") ||
        pick(meta, ["aspectRatio", "aspect_ratio"], "") ||
        pick(payload?.inputs, ["aspect_ratio", "aspectRatio"], "") ||
        pick(payload, ["aspect_ratio", "aspectRatio"], "")
    ) || "";

  const stylePresetKeysRaw =
    meta?.stylePresetKeys ??
    meta?.style_preset_keys ??
    payload?.settings?.stylePresetKeys ??
    payload?.settings?.style_preset_keys ??
    payload?.inputs?.stylePresetKeys ??
    payload?.inputs?.style_preset_keys ??
    null;

  const stylePresetKeyRaw =
    meta?.stylePresetKey ??
    meta?.style_preset_key ??
    payload?.settings?.stylePresetKey ??
    payload?.settings?.style_preset_key ??
    payload?.inputs?.stylePresetKey ??
    payload?.inputs?.style_preset_key ??
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
          : undefined;

  // STILL assets (support both MMA snake_case and legacy camelCase)
  const productImageUrl =
    meta?.productImageUrl ||
    payload?.assets?.productImageUrl ||
    payload?.assets?.product_image_url ||
    payload?.assets?.product_image ||
    "";

  const logoImageUrl =
    meta?.logoImageUrl ||
    payload?.assets?.logoImageUrl ||
    payload?.assets?.logo_image_url ||
    payload?.assets?.logo_image ||
    "";

  const styleImageUrls =
    meta?.styleImageUrls ||
    payload?.assets?.styleImageUrls ||
    payload?.assets?.style_image_urls ||
    payload?.assets?.inspiration_image_urls ||
    payload?.assets?.inspirationImageUrls ||
    [];

  const styleImages: string[] = Array.isArray(styleImageUrls)
    ? styleImageUrls.map(String).filter((u) => u.startsWith("http"))
    : [];

  // MOTION frames (MMA)
  const startImageUrl =
    payload?.assets?.start_image_url ||
    payload?.assets?.startImageUrl ||
    payload?.assets?.kling_start_image_url ||
    payload?.assets?.klingStartImageUrl ||
    "";

  const endImageUrl =
    payload?.assets?.end_image_url ||
    payload?.assets?.endImageUrl ||
    payload?.assets?.kling_end_image_url ||
    payload?.assets?.klingEndImageUrl ||
    "";

  const tone = String(meta?.tone || payload?.inputs?.tone || payload?.tone || "").trim();
  const platform = String(meta?.platform || payload?.inputs?.platform || payload?.platform || "").trim();

  return {
    brief: String(brief || "").trim(),
    aspectRatio: aspect,
    stylePresetKeys,
    minaVisionEnabled,
    productImageUrl: String(productImageUrl || "").trim(),
    logoImageUrl: String(logoImageUrl || "").trim(),
    styleImageUrls: styleImages,
    tone,
    platform,
    motionStartImageUrl: String(startImageUrl || "").trim(),
    motionEndImageUrl: String(endImageUrl || "").trim(),
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
  onRefresh,
  onDelete,
  onRecreate,
}: ProfileProps) {
  const [deletingIds, setDeletingIds] = useState<Record<string, boolean>>({});
  const [deleteErrors, setDeleteErrors] = useState<Record<string, string>>({});
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

  // Pagination (reduces DOM + speeds up load)
  const [visibleCount, setVisibleCount] = useState(36);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  // Video refs (IntersectionObserver)
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

  useEffect(() => {
    if (!lightbox) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeLightbox();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [lightbox]);

  const deleteItem = async (id: string) => {
    setDeleteErrors((prev) => ({ ...prev, [id]: "" }));
    setDeletingIds((prev) => ({ ...prev, [id]: true }));
    try {
      if (!onDelete) throw new Error("Delete not available.");
      await onDelete(id);
    } catch (e: any) {
      setDeleteErrors((prev) => ({ ...prev, [id]: e?.message || "Delete failed" }));
    } finally {
      setDeletingIds((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    }
  };

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
        // ✅ MMA uses generation_id (and sometimes mg_generation_id)
        const id = pick(g, ["mg_id", "mg_generation_id", "generation_id", "id"], `row_${idx}`);

        const createdAt =
          pick(g, ["mg_event_at", "mg_created_at", "created_at", "createdAt"], "") || "";

        const payload = (g as any)?.mg_payload ?? (g as any)?.payload ?? null;
        const meta = (g as any)?.mg_meta ?? (g as any)?.meta ?? null;
        const outputs = (g as any)?.mg_outputs ?? (g as any)?.outputs ?? payload?.outputs ?? null;

        const prompt =
          pick(g, ["mg_user_prompt", "userPrompt", "promptUser", "prompt_raw", "promptOriginal"], "") ||
          pick(payload?.inputs, ["brief", "userPrompt", "user_prompt", "prompt"], "") ||
          pick(payload, ["userPrompt", "user_prompt", "userMessage", "brief", "prompt"], "") ||
          pick(g, ["mg_prompt", "prompt"], "") ||
          "";

        // ✅ If this is a like-event feedback row, skip it (we use it only to mark liked)
        const likeUrl = source === "feedback" ? findLikeUrl(g) : "";
        const isLikeOnly = source === "feedback" && !!likeUrl;
        if (isLikeOnly) return null;

        // ✅ Media URL extraction supports nested MMA outputs + legacy columns
        const out = pick(g, ["mg_output_url", "outputUrl", "output_url"], "").trim();
        const img = pick(g, ["mg_image_url", "imageUrl", "image_url"], "").trim();
        const vid = pick(g, ["mg_video_url", "videoUrl", "video_url"], "").trim();

        const outVideo = pick(outputs, ["kling_video_url", "video_url"], "").trim();
        const outImage = pick(outputs, ["seedream_image_url", "image_url"], "").trim();
        const outGeneric = pick(outputs, ["output_url", "outputUrl", "url"], "").trim();

        const aspectRaw =
          pick(g, ["mg_aspect_ratio", "aspect_ratio", "aspectRatio"], "") ||
          pick(meta, ["aspectRatio", "aspect_ratio"], "") ||
          pick(payload?.inputs, ["aspect_ratio", "aspectRatio"], "") ||
          pick(payload, ["aspect_ratio", "aspectRatio"], "");

        const contentType = pick(g, ["mg_content_type", "contentType"], "").toLowerCase();
        const kindHint = String(pick(g, ["mg_result_type", "resultType", "mg_type", "type"], "")).toLowerCase();

        const looksVideoMeta =
          contentType.includes("video") || kindHint.includes("motion") || kindHint.includes("video") || !!outVideo;

        const looksImage = isImageUrl(out) || isImageUrl(img) || !!outImage;

        const videoUrl =
          vid ||
          outVideo ||
          (isVideoUrl(out) ? out : "") ||
          (!looksImage && looksVideoMeta && out ? out : "") ||
          (isVideoUrl(outGeneric) ? outGeneric : "");

        const imageUrl = img || outImage || (!videoUrl ? out || outGeneric : "") || "";
        const url = (videoUrl || imageUrl || out || outGeneric).trim();

        const isMotion = Boolean(videoUrl);

        const aspectRatio =
          normalizeAspectRatio(aspectRaw) ||
          normalizeAspectRatio(
            typeof payload?.inputs?.aspect_ratio === "string"
              ? payload.inputs.aspect_ratio
              : typeof payload?.inputs?.aspectRatio === "string"
                ? payload.inputs.aspectRatio
                : typeof payload?.aspect_ratio === "string"
                  ? payload.aspect_ratio
                  : typeof payload?.aspectRatio === "string"
                    ? payload.aspectRatio
                    : ""
          );

        const liked = url ? likedUrlSet.has(normalizeMediaUrl(url)) : false;

        const inputs = extractInputsForDisplay(g);

        const canRecreate = source === "generation" && !!onRecreate && !!inputs.brief;

        const draft: RecreateDraft | null = canRecreate
          ? {
              mode: isMotion ? "motion" : "still",
              brief: inputs.brief,
              settings: {
                aspect_ratio: inputs.aspectRatio || undefined,
                minaVisionEnabled: inputs.minaVisionEnabled,
                stylePresetKeys: inputs.stylePresetKeys.length ? inputs.stylePresetKeys : undefined,
              },
              assets: isMotion
                ? {
                    // motion frames (both styles)
                    kling_start_image_url: inputs.motionStartImageUrl || inputs.productImageUrl || undefined,
                    kling_end_image_url: inputs.motionEndImageUrl || undefined,

                    start_image_url: inputs.motionStartImageUrl || inputs.productImageUrl || undefined,
                    end_image_url: inputs.motionEndImageUrl || undefined,
                    kling_image_urls:
                      inputs.motionEndImageUrl && (inputs.motionStartImageUrl || inputs.productImageUrl)
                        ? [inputs.motionStartImageUrl || inputs.productImageUrl, inputs.motionEndImageUrl]
                        : (inputs.motionStartImageUrl || inputs.productImageUrl)
                          ? [inputs.motionStartImageUrl || inputs.productImageUrl]
                          : undefined,
                  }
                : {
                    // still assets (both styles)
                    productImageUrl: inputs.productImageUrl || undefined,
                    logoImageUrl: inputs.logoImageUrl || undefined,
                    styleImageUrls: inputs.styleImageUrls.length ? inputs.styleImageUrls : undefined,

                    product_image_url: inputs.productImageUrl || undefined,
                    logo_image_url: inputs.logoImageUrl || undefined,
                    inspiration_image_urls: inputs.styleImageUrls.length ? inputs.styleImageUrls : undefined,
                  },
            }
          : null;

        return {
          id,
          createdAt,
          prompt: inputs.brief || prompt,
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
  }, [generations, feedbacks, likedUrlSet, motion, likedOnly, activeAspectFilter, onRecreate]);

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

    // Observe currently registered videos
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

              {onRefresh ? (
                <>
                  <span className="profile-topsep">|</span>
                  <button className="profile-toplink" type="button" onClick={onRefresh}>
                    Refresh
                  </button>
                </>
              ) : null}

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
          {visibleItems.map((it) => {
            const expanded = Boolean(expandedPromptIds[it.id]);
            const showViewMore = (it.prompt || "").length > 90 || it.canRecreate; // allow "more" even if short (to reveal inputs)
            const deleting = Boolean(deletingIds[it.id]);
            const deleteErr = deleteErrors[it.id];

            const inputs = it.inputs || null;

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

                  <div className="profile-card-top-right">
                    {it.liked ? <span className="profile-card-liked">Liked</span> : null}

                    <button
                      className="profile-card-delete"
                      type="button"
                      onClick={() => deleteItem(it.id)}
                      disabled={deleting || !onDelete}
                      title="Delete"
                      aria-label="Delete"
                    >
                      −
                    </button>
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
                  <div className={`profile-card-prompt ${expanded ? "expanded" : ""}`}>
                    {it.prompt || ""}

                    {/* Expanded “inputs used” */}
                    {expanded && inputs ? (
                      <div className="profile-card-details">
                        <div className="profile-card-detailrow">
                          <span className="k">Created</span>
                          <span className="v">{it.createdAt ? fmtDate(it.createdAt) : "—"}</span>
                        </div>

                        {inputs.aspectRatio ? (
                          <div className="profile-card-detailrow">
                            <span className="k">Aspect</span>
                            <span className="v">{inputs.aspectRatio}</span>
                          </div>
                        ) : null}

                        {inputs.tone ? (
                          <div className="profile-card-detailrow">
                            <span className="k">Tone</span>
                            <span className="v">{inputs.tone}</span>
                          </div>
                        ) : null}

                        {inputs.platform ? (
                          <div className="profile-card-detailrow">
                            <span className="k">Platform</span>
                            <span className="v">{inputs.platform}</span>
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

                        {it.canRecreate && it.draft ? (
                          <div className="profile-card-actions">
                            <button
                              type="button"
                              className="profile-card-recreate"
                              onClick={() => {
                                onRecreate?.(it.draft!);
                                onBackToStudio?.();
                              }}
                            >
                              Re-create
                            </button>
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
