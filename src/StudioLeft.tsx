// src/StudioLeft.tsx
// ============================================================================
// Mina Studio — LEFT SIDE (Input + pills + panels + style + create + motion)
// ---------------------------------------------------------------------------
// File map
// 1) Imports: React + CSS.
// 2) Types: local shapes for uploads, presets, props (kept self-contained).
// 3) Helpers: classNames + stable Collapse wrapper for animated panels.
// 4) Timelines: keyframe map + inline style helpers.
// 5) Components: pill row, upload panels, prompts, toggles, motion controls.
// 6) Main component: StudioLeft UI wiring and rendering.
// ============================================================================

// [PART 1] Imports
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import MatchaQtyModal from "./components/MatchaQtyModal";
import "./StudioLeft.css";

// ------------------------------------
// Types (kept local so StudioLeft is standalone)
// ------------------------------------
export type UploadPanelKey = "product" | "logo" | "inspiration";
export type PanelKey = "product" | "logo" | "inspiration" | "style" | null;

export type UploadKind = "file" | "url";

export type UploadItem = {
  id: string;
  kind: UploadKind;
  url: string; // UI preview (blob: or http)
  remoteUrl?: string; // stored URL (https://...)
  file?: File;
  uploading?: boolean;
  error?: string;
};

export type StylePreset = {
  key: string;
  label: string;
  thumb: string;
  hero?: string;
};

export type CustomStyle = {
  key: string;
  label: string;
  thumbUrl: string;
  createdAt?: string;
};

export type AspectOptionLike = {
  key: string;
  label: string;
  subtitle: string;
  ratio?: string;
  platformKey?: string;
};

export type MotionStyleKey = "melt" | "drop" | "expand" | "satisfying" | "slow_motion" | "fix_camera" | "loop";

type StyleMode = "main" | "niche";

type StudioLeftProps = {
  globalDragging: boolean;
  typingHidden: boolean;

  showPills: boolean;
  showPanels: boolean;
  showControls: boolean;
  uiStage: 0 | 1 | 2 | 3;

  brief: string;
  briefHintVisible: boolean;
  briefShellRef: React.RefObject<HTMLDivElement>;
  onBriefScroll: () => void;
  onBriefChange: (value: string) => void;

  activePanel: PanelKey;
  openPanel: (key: PanelKey) => void;

  pillInitialDelayMs: number;
  pillStaggerMs: number;
  panelRevealDelayMs: number;

  currentAspect: AspectOptionLike;
  currentAspectIconUrl: string;
  onCycleAspect: () => void;

  animateAspect?: AspectOptionLike;
  animateAspectIconUrl?: string;
  animateAspectIconRotated?: boolean;

  uploads: Record<UploadPanelKey, UploadItem[]>;
  uploadsPending: boolean;

  removeUploadItem: (panel: UploadPanelKey, id: string) => void;
  moveUploadItem: (panel: UploadPanelKey, from: number, to: number) => void;
  triggerPick: (panel: UploadPanelKey) => void;

  // still provided, but StudioLeft doesn't need to call it directly
  onFilesPicked: (panel: UploadPanelKey, files: FileList) => void;

  productInputRef: React.RefObject<HTMLInputElement>;
  logoInputRef: React.RefObject<HTMLInputElement>;
  inspirationInputRef: React.RefObject<HTMLInputElement>;

  stylePresetKeys: string[];
  setStylePresetKeys: (k: string[]) => void;
  styleMode: StyleMode;
  setStyleMode: (m: StyleMode) => void;

  stylePresets: readonly StylePreset[];
  customStyles: CustomStyle[];

  getStyleLabel: (key: string, fallback: string) => string;

  deleteCustomStyle: (key: string) => void;
  onOpenCustomStylePanel: () => void;

  onImageUrlPasted?: (url: string) => void;

  minaVisionEnabled: boolean;
  onToggleVision: () => void;

  // IMAGE create
  stillGenerating: boolean;
  stillError: string | null;
  onCreateStill: () => void;

  // ✅ MOTION mode (optional for backward compatibility)
  animateMode?: boolean;
  onToggleAnimateMode?: (next: boolean) => void;

  motionStyleKeys?: MotionStyleKey[];
  setMotionStyleKeys?: (k: MotionStyleKey[]) => void;

  motionSuggesting?: boolean;
  canCreateMotion?: boolean;
  motionHasImage?: boolean;
  motionCreditsOk?: boolean;
  motionBlockReason?: string | null;

  imageCreditsOk?: boolean;
  matchaUrl: string;

  motionGenerating?: boolean;
  motionError?: string | null;
  onCreateMotion?: () => void;
  onTypeForMe?: () => void;

  minaMessage?: string;
  minaTalking?: boolean;

  timingVars?: React.CSSProperties;

  onGoProfile: () => void;
};

// ------------------------------------
// Small helpers
// ------------------------------------
function classNames(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

// ------------------------------------
// Stable Collapse (keeps children mounted)
// ------------------------------------
const Collapse: React.FC<{
  open: boolean;
  delayMs?: number; // kept for compat
  children: React.ReactNode;
}> = ({ open, delayMs = 0, children }) => {
  const innerRef = useRef<HTMLDivElement | null>(null);
  const [maxH, setMaxH] = useState<number>(open ? 1000 : 0);

  useLayoutEffect(() => {
    void delayMs; // intentionally not delaying panel switches

    const el = innerRef.current;
    if (!el) return;

    let raf1 = 0;
    let raf2 = 0;
    let ro: ResizeObserver | null = null;

    const measure = () => {
      const h = el.scrollHeight || 0;
      setMaxH(h);
    };

    if (open) {
      measure();
      raf1 = requestAnimationFrame(measure);

      if (typeof ResizeObserver !== "undefined") {
        ro = new ResizeObserver(() => measure());
        ro.observe(el);
      }

      return () => {
        if (raf1) cancelAnimationFrame(raf1);
        if (raf2) cancelAnimationFrame(raf2);
        if (ro) ro.disconnect();
      };
    }

    setMaxH(el.scrollHeight || 0);
    raf2 = requestAnimationFrame(() => setMaxH(0));

    return () => {
      if (raf1) cancelAnimationFrame(raf1);
      if (raf2) cancelAnimationFrame(raf2);
      if (ro) ro.disconnect();
    };
  }, [open, delayMs]);

  return (
    <div
      style={{
        overflow: "hidden",
        maxHeight: open ? maxH : 0,
        opacity: open ? 1 : 0,
        transform: open ? "translateY(0)" : "translateY(-6px)",
        pointerEvents: open ? "auto" : "none",
        transition:
          "max-height 650ms cubic-bezier(0.16,1,0.3,1), opacity 650ms cubic-bezier(0.16,1,0.3,1), transform 650ms cubic-bezier(0.16,1,0.3,1)",
        transitionDelay: "0ms",
      }}
    >
      <div ref={innerRef}>{children}</div>
    </div>
  );
};

// ------------------------------------
// Motion styles
// ------------------------------------
const MOTION_STYLES: Array<{ key: MotionStyleKey; label: string; seed: string; thumb: string }> = [
  {
    key: "expand",
    label: "Expand",
    seed: "Subtle expansion, calm luxury vibe.",
    thumb: "https://assets.faltastudio.com/Website%20Assets/Movement%20styles/expand.png",
  },
  {
    key: "melt",
    label: "Melt",
    seed: "Slow, asmr, melting motion—soft drips, luxury macro feel.",
    thumb: "https://assets.faltastudio.com/Website%20Assets/Movement%20styles/melt.png",
  },
  {
    key: "drop",
    label: "Drop",
    seed: "Falling in slow rhythm—minimal, ASMR, drops.",
    thumb: "https://assets.faltastudio.com/Website%20Assets/Movement%20styles/drop.png",
  },
  {
    key: "satisfying",
    label: "Satisfying",
    seed: "Slime video, satisfying, smooth, satisfying, motion loop—micro movements, clean, premium.",
    thumb: "https://assets.faltastudio.com/Website%20Assets/Movement%20styles/satisfying.png",
  },
  {
    key: "slow_motion",
    label: "Slow motion",
    seed: "Ultra slow motion, 1000fps, asmr, premium calm.",
    thumb: "https://assets.faltastudio.com/Website%20Assets/Movement%20styles/slow-motion.png",
  },
  {
    key: "fix_camera",
    label: "Still camera",
    seed: "fix camera",
    thumb: "https://assets.faltastudio.com/Website%20Assets/Movement%20styles/fix-camera.png",
  },
  {
    key: "loop",
    label: "Perfect loop",
    seed: "perfect loop",
    thumb: "https://assets.faltastudio.com/Website%20Assets/Movement%20styles/perfect-look.png",
  },
];

const TYPE_FOR_ME_ICON = "https://assets.faltastudio.com/Website%20Assets/icon-type-for-me.svg";

// ============================================================================
// Component
// ============================================================================
const StudioLeft: React.FC<StudioLeftProps> = (props) => {
  
  const {
    globalDragging,
    typingHidden,
    showPills,
    showPanels,
    showControls,
    uiStage,

    brief,
    briefHintVisible,
    briefShellRef,
    onBriefScroll,
    onBriefChange,

    activePanel,
    openPanel,

    pillInitialDelayMs,
    pillStaggerMs,
    panelRevealDelayMs,

    currentAspect,
    currentAspectIconUrl,
    onCycleAspect,

    animateAspect,
    animateAspectIconUrl,
    animateAspectIconRotated,

    uploads,
    uploadsPending,

    removeUploadItem,
    moveUploadItem,
    triggerPick,

    productInputRef,
    logoInputRef,
    inspirationInputRef,

    stylePresetKeys,
    setStylePresetKeys,
    styleMode,
    setStyleMode,
    stylePresets,
    customStyles,
    getStyleLabel,
    deleteCustomStyle, // ✅ IMPORTANT: needed for confirm delete

    onOpenCustomStylePanel,
    onImageUrlPasted,

    minaVisionEnabled,
    onToggleVision,

    stillGenerating,
    stillError,
    onCreateStill,

    motionHasImage: motionHasImageProp,
    motionGenerating,
    motionError,
    onCreateMotion,
    onTypeForMe,

    imageCreditsOk: imageCreditsOkProp,
    matchaUrl,

    minaMessage,
    minaTalking,

    timingVars,

    onGoProfile,
  } = props;
  // ✅ Mobile default ratio = 9:16 (keeps cycling one step per render until it hits 9:16)
const mobileAspectTriesRef = useRef(0);

useEffect(() => {
  const isMobile = window.matchMedia("(max-width: 900px)").matches;
  if (!isMobile) return;

  const ratio = (currentAspect?.ratio || "").trim();

  // IMPORTANT: if your app stores it as "916" instead of "9:16", change the check below.
  const TARGET = "9:16";

  if (ratio === TARGET) return;

  // safety: don't loop forever if TARGET isn't in the cycle
  if (mobileAspectTriesRef.current >= 12) return;
  mobileAspectTriesRef.current += 1;

  onCycleAspect?.();
}, [currentAspect?.ratio, onCycleAspect]);

  const imageCreditsOk = imageCreditsOkProp ?? true;
  const hasMotionImage = !!motionHasImageProp;

  const briefInputRef = useRef<HTMLTextAreaElement | null>(null);

  // ✅ Style UX:
  // - single click = select
  // - double click (custom only) = ask to delete with bold YES/NO
  const [deleteConfirm, setDeleteConfirm] = useState<{ key: string; label: string } | null>(null);
  // ============================================================
  // Matcha quantity popup (opens Shopify with chosen quantity)
  // ============================================================
  const [matchaQtyOpen, setMatchaQtyOpen] = useState(false);
  const [matchaQty, setMatchaQty] = useState(1);

  const clampQty = (n: number) => Math.max(1, Math.min(10, Math.floor(Number(n || 1))));

  // Build a Shopify URL that actually sets quantity (best effort).
  // Works best if matchaUrl is a cart permalink like:
  //   https://www.faltastudio.com/cart/<VARIANT_ID>:1
  // Or:
  //   https://www.faltastudio.com/cart/add?id=<VARIANT_ID>&quantity=1
  const buildMatchaCheckoutUrl = (base: string, qty: number) => {
    const q = clampQty(qty);

    try {
      const u = new URL(String(base || ""));

      // 1) cart permalink: /cart/123:1  -> /cart/123:q
      const m = u.pathname.match(/\/cart\/(\d+)(?::(\d+))?/);
      if (m?.[1]) {
        const id = m[1];
        u.pathname = `/cart/${id}:${q}`;
        return u.toString();
      }

      // 2) cart/add form
      if (u.pathname.includes("/cart/add")) {
        u.searchParams.set("quantity", String(q));
        return u.toString();
      }

      // 3) fallback: add quantity param (may or may not be used by checkout links)
      u.searchParams.set("quantity", String(q));
      return u.toString();
    } catch {
      // If it isn't a valid URL, just return as-is
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
    window.open(url, "_blank", "noopener");
  };

  const styleClickTimerRef = useRef<number | null>(null);
  const pendingStyleKeyRef = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      if (styleClickTimerRef.current !== null) window.clearTimeout(styleClickTimerRef.current);
    };
  }, []);

  const onStyleSingleClick = (key: string) => {
    // delay a bit so double-click can cancel the selection toggle
    if (styleClickTimerRef.current !== null) window.clearTimeout(styleClickTimerRef.current);
    pendingStyleKeyRef.current = key;

    styleClickTimerRef.current = window.setTimeout(() => {
      const k = pendingStyleKeyRef.current;
      pendingStyleKeyRef.current = null;
      styleClickTimerRef.current = null;
      if (k) toggleStylePreset(k);
    }, 220);
  };

  const onStyleDoubleClick = (s: { key: string; label: string; isCustom: boolean }) => {
    // cancel the pending single-click toggle
    if (styleClickTimerRef.current !== null) window.clearTimeout(styleClickTimerRef.current);
    styleClickTimerRef.current = null;
    pendingStyleKeyRef.current = null;

    if (!s.isCustom) return; // never delete built-in presets
    setDeleteConfirm({ key: s.key, label: s.label });
  };

  const confirmDeleteYes = () => {
    if (!deleteConfirm) return;
    deleteCustomStyle(deleteConfirm.key);
    setDeleteConfirm(null);
  };

  const confirmDeleteNo = () => {
    setDeleteConfirm(null);
  };

  // ------------------------------------
  // Pointer-based reordering (no HTML5 drag/drop)
  // ------------------------------------
  const reorderRef = useRef<{
    panel: UploadPanelKey;
    index: number;
    pointerId: number;
    startX: number;
    startY: number;
    active: boolean;
  } | null>(null);

  const suppressClickRef = useRef(false);
  const DRAG_THRESHOLD_PX = 6;

  const onThumbPointerDown =
    (panel: UploadPanelKey, index: number) =>
    (e: React.PointerEvent<HTMLButtonElement>) => {
      if (e.button !== 0) return; // left click only
      if ((uploads[panel]?.length || 0) < 2) return;

      suppressClickRef.current = false;

      reorderRef.current = {
        panel,
        index,
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        active: false,
      };

      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {}

      e.preventDefault();
      e.stopPropagation();
    };

  const onThumbPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const st = reorderRef.current;
    if (!st || st.pointerId !== e.pointerId) return;

    const dx = e.clientX - st.startX;
    const dy = e.clientY - st.startY;
    const dist = Math.hypot(dx, dy);

    if (!st.active) {
      if (dist < DRAG_THRESHOLD_PX) return;
      st.active = true;
      suppressClickRef.current = true;
    }

    const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
    const btn = el?.closest("button.studio-thumb") as HTMLButtonElement | null;
    const to = btn?.dataset?.index ? Number(btn.dataset.index) : NaN;
    if (!Number.isFinite(to)) return;

    if (to !== st.index) {
      moveUploadItem(st.panel, st.index, to);
      st.index = to;
    }

    e.preventDefault();
    e.stopPropagation();
  };

  const onThumbPointerUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    const st = reorderRef.current;
    if (!st || st.pointerId !== e.pointerId) return;

    reorderRef.current = null;

    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {}

    if (st.active) {
      window.setTimeout(() => {
        suppressClickRef.current = false;
      }, 0);
    }
  };

  const handleThumbClick = (panel: UploadPanelKey, id: string) => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    removeUploadItem(panel, id);
  };

  // ✅ motion mode (with local fallback)
  const [localAnimate, setLocalAnimate] = useState(false);
  const animateMode = props.animateMode ?? localAnimate;
  const prevAnimateModeRef = useRef(animateMode);

  const [localMotionStyle, setLocalMotionStyle] = useState<MotionStyleKey[]>([]);
  const motionStyleKeys = props.motionStyleKeys ?? localMotionStyle;
  const setMotionStyleKeys = props.setMotionStyleKeys ?? setLocalMotionStyle;

  // ✅ Always start movement styles as none-selected when entering motion mode
  useEffect(() => {
    if (animateMode) {
      setMotionStyleKeys([]);
    }
  }, [animateMode, setMotionStyleKeys]);

  const stillBriefRef = useRef<string>("");
  const motionBriefRef = useRef<string>("");

  // keep separate briefs per mode (so switching doesn't destroy text)
  useEffect(() => {
    if (animateMode) motionBriefRef.current = brief;
    else stillBriefRef.current = brief;
  }, [brief, animateMode]);

  useEffect(() => {
    const prev = prevAnimateModeRef.current;
    if (animateMode === prev) return;

    if (animateMode) {
      stillBriefRef.current = brief;
      openPanel("product");
    } else {
      motionBriefRef.current = brief;
      openPanel("product");
    }

    prevAnimateModeRef.current = animateMode;
  }, [animateMode, brief, onBriefChange, openPanel]);

  const isMotion = animateMode;

  const briefLen = brief.trim().length;

  // pills delay style
  const pillBaseStyle = (index: number): React.CSSProperties => ({
    transitionDelay: showPills ? `${pillInitialDelayMs + index * pillStaggerMs}ms` : "0ms",
    opacity: showPills ? 1 : 0,
    transform: showPills ? "translateY(0)" : "translateY(-8px)",
  });

  // panel behavior
  const effectivePanel: PanelKey = uiStage === 0 ? null : activePanel ?? "product";

  const getFirstImageUrl = (items: UploadItem[]) => items[0]?.remoteUrl || items[0]?.url || "";

  // Prefer permanent URLs. Hide blob: previews
  const getDisplayUrl = (it: UploadItem) => {
    const u = it?.remoteUrl || it?.url || "";
    if (!u) return "";
    if (u.startsWith("blob:")) return "";
    return u;
  };

  // Drag/drop support:
  // - drop files => onFilesPicked(panel, files)
  // - drop url => onImageUrlPasted(url)
  const extractDropUrl = (e: React.DragEvent) => {
    const dt = e.dataTransfer;

    const uri = (dt.getData("text/uri-list") || "").trim();
    const plain = (dt.getData("text/plain") || "").trim();
    const html = dt.getData("text/html") || "";

    const fromHtml =
      html.match(/src\s*=\s*["']([^"']+)["']/i)?.[1] || html.match(/https?:\/\/[^\s"'<>]+/i)?.[0] || "";

    const candidates = [uri, plain, fromHtml].filter(Boolean).map((u) => u.split("\n")[0].trim());

    for (const u of candidates) {
      if (/^https?:\/\//i.test(u)) return u;
    }
    return "";
  };

  const handleDropOnPanel = (panel: UploadPanelKey) => (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    // ✅ Ignore drags that originate from style thumbnails
    const dt = e.dataTransfer;
    const types = Array.from(dt?.types ?? []);

    const isStyleThumbDrag =
      types.includes("text/x-mina-style-thumb") ||
      types.includes("application/x-mina-style-thumb") ||
      dt?.getData("text/x-mina-style-thumb") === "1" ||
      dt?.getData("application/x-mina-style-thumb") === "1";

    if (isStyleThumbDrag) return;

    // URL drop
    const url = extractDropUrl(e);
    if (url) {
      openPanel(panel);
      props.onImageUrlPasted?.(url);
      return;
    }

    // file drop
    const files = e.dataTransfer?.files;
    if (files && files.length) {
      props.onFilesPicked(panel, files);
      return;
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  };

  const productThumb = getFirstImageUrl(uploads.product);
  const logoThumb = getFirstImageUrl(uploads.logo);
  const inspirationThumb = getFirstImageUrl(uploads.inspiration);

  const allStyleCards = useMemo(() => {
    return [
      ...stylePresets.map((p) => ({
        key: p.key,
        label: getStyleLabel(p.key, p.label),
        thumb: p.thumb,
        isCustom: false,
      })),
      ...customStyles.map((s) => ({
        key: s.key,
        label: getStyleLabel(s.key, s.label),
        thumb: s.thumbUrl,
        isCustom: true,
      })),
    ];
  }, [stylePresets, customStyles, getStyleLabel]);

  const selectedStyleCards = allStyleCards.filter((c) => stylePresetKeys.includes(c.key));
  const primaryStyleCard = selectedStyleCards[0] || null;
  const styleThumb = primaryStyleCard?.thumb || "";
  const styleLabel =
    selectedStyleCards.length === 0
      ? "Moodboard"
      : selectedStyleCards.length === 1
      ? primaryStyleCard?.label || "Style"
      : `${selectedStyleCards.length} styles`;

  const motionStyleCards = MOTION_STYLES;
  const selectedMotionCards = motionStyleCards.filter((c) => motionStyleKeys.includes(c.key));

  // none selected => no thumb => pill shows "+"
  const motionStyleThumb = selectedMotionCards[0]?.thumb || "";
  const motionStyleLabel =
    selectedMotionCards.length === 0
      ? "Movement styles"
      : selectedMotionCards.length === 1
      ? selectedMotionCards[0].label
      : `${selectedMotionCards.length} styles`;

  const renderPillIcon = (
    src: string,
    fallback: React.ReactNode,
    isPlus?: boolean,
    options?: { plain?: boolean }
  ) => (
    <span
      className={classNames(
        "studio-pill-icon",
        src ? (options?.plain ? "studio-pill-icon-plain" : "studio-pill-icon-thumb") : "studio-pill-icon-mark",
        !src && isPlus && "studio-pill-icon--plus"
      )}
      aria-hidden="true"
    >
      {src ? <img src={src} alt="" /> : fallback}
    </span>
  );

   // -------------------------
  // Create CTA state machine
  // -------------------------
  type CreateState = "creating" | "uploading" | "need_frame" | "describe_more" | "ready";

  const hasMotionHandler = typeof props.onCreateMotion === "function";

  const motionSuggesting = !!props.motionSuggesting;
  const motionHasImage = !!props.motionHasImage;
  const canCreateMotion = props.canCreateMotion ?? briefLen >= 1;
  const motionCreditsOk = props.motionCreditsOk ?? true;
  const motionBlockReason = props.motionBlockReason || null;

  const typeForMeLabel = motionSuggesting ? "Typing…" : "Type for me";

  // STILL CTA
  const imageCreateState: CreateState = stillGenerating
    ? "creating"
    : uploadsPending
    ? "uploading"
    : !imageCreditsOk
    ? "describe_more"
    : briefLen < 20
    ? "describe_more"
    : "ready";

  // MOTION CTA (✅ prioritize frames first)
  const motionCreateState: CreateState = motionGenerating
    ? "creating"
    : motionSuggesting
    ? "creating"
    : uploadsPending
    ? "uploading"
    : !motionHasImage
    ? "need_frame"
    : !motionCreditsOk
    ? "describe_more"
    : canCreateMotion
    ? "ready"
    : "describe_more";

  const createState: CreateState = isMotion ? motionCreateState : imageCreateState;
  const canCreateStill = imageCreateState === "ready";

  const wantsMatcha = (!isMotion && !imageCreditsOk) || (isMotion && !motionCreditsOk);

  const createLabel =
    createState === "creating"
      ? isMotion
        ? motionSuggesting
          ? "Typing…"
          : "Animating…"
        : "Creating…"
      : createState === "uploading"
      ? "Uploading…"
      : createState === "need_frame"
      ? "Add frame"
      : createState === "describe_more"
      ? wantsMatcha
        ? "I need Matcha"
        : "Describe more"
      : isMotion
      ? "Animate"
      : "Create";

  const createDisabled = (() => {
    if (createState === "creating" || createState === "uploading") return true;

    // ✅ if no frames, keep enabled so click opens picker
    if (createState === "need_frame") return false;

    // "Describe more" should be clickable (focus input / open matcha)
    if (createState === "describe_more") return false;

    // READY
    if (isMotion) {
      return !hasMotionHandler || motionSuggesting || !motionCreditsOk || !motionHasImage || !canCreateMotion;
    }
    return !canCreateStill || !imageCreditsOk;
  })();

  const handleCreateClick = () => {
    if (createState === "ready") {
      if (isMotion) onCreateMotion?.();
      else onCreateStill();
      return;
    }

    if (createState === "need_frame") {
      // ✅ Open frames + trigger file picker
      openPanel("product");
      triggerPick("product");
      return;
    }

    if (createState === "describe_more") {
      if (wantsMatcha) {
        openMatchaQty(); // ✅ open popup instead of direct link
        return;
      }
      requestAnimationFrame(() => briefInputRef.current?.focus());
    }
  };

  // -------------------------
  // File inputs (just wiring)
  // -------------------------
  const handleFileInput = (panel: UploadPanelKey, e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length) props.onFilesPicked(panel, files);
    e.target.value = "";
  };

  // motion style click: pick + optionally seed the motion brief if empty
  const pickMotionStyle = (k: MotionStyleKey) => {
    let added = false;
    setMotionStyleKeys((prev) => {
      const exists = prev.includes(k);
      const next = exists ? prev.filter((x) => x !== k) : [...prev, k];
      added = !exists;
      return next;
    });
    openPanel("style");

    // only seed if user hasn't typed yet
    const trimmed = brief.trim();
    if ((!trimmed || trimmed.length < 4) && added) {
      const seed = MOTION_STYLES.find((s) => s.key === k)?.seed || "";
      if (seed) onBriefChange(seed);
    }
  };

  // still style click: ✅ STILL (Create) mode = single selection (0 or 1)
  const toggleStylePreset = (key: string) => {
    setStylePresetKeys((prev) => {
      const exists = prev.includes(key);

      // Create mode (still): only ONE style allowed
      if (!isMotion) {
        return exists ? [] : [key];
      }

      // Motion mode: keep multi-select (if you later enable it)
      return exists ? prev.filter((k) => k !== key) : [...prev, key];
    });

    openPanel("style");
  };

  return (
    <div
      className={classNames(
        "studio-left",
        globalDragging && "drag-active",
        typingHidden && "is-typing-hidden",
        minaTalking && "is-thinking"
      )}
      style={timingVars}
    >      
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

      <div className="studio-left-main">
        {/* Input 1 */}
        <div className="studio-input1-block">
          {/* Pills slot */}
          <div className="studio-pills-slot">
            <div className={classNames("studio-row", "studio-row--pills", !showPills && "hidden")}>
              {!isMotion ? (
                <>
                  {/* Product */}
                  <button
                    type="button"
                    className={classNames(
                      "studio-pill",
                      effectivePanel === "product" && "active",
                      !productThumb && "studio-pill--solo-plus"
                    )}
                    style={pillBaseStyle(0)}
                    onClick={() => {
                      if (!productThumb) triggerPick("product");
                      else openPanel("product");
                    }}
                    onMouseEnter={() => openPanel("product")}
                  >
                    {renderPillIcon(productThumb, "+", true)}
                    <span className="studio-pill-main">Product</span>
                  </button>

                  {/* Logo */}
                  <button
                    type="button"
                    className={classNames(
                      "studio-pill",
                      activePanel === "logo" && "active",
                      !logoThumb && "studio-pill--solo-plus"
                    )}
                    style={pillBaseStyle(1)}
                    onClick={() => {
                      if (!logoThumb) triggerPick("logo");
                      else openPanel("logo");
                    }}
                    onMouseEnter={() => openPanel("logo")}
                  >
                    {renderPillIcon(logoThumb, "+", true)}
                    <span className="studio-pill-main">Logo</span>
                  </button>

                  {/* Inspiration */}
                  <button
                    type="button"
                    className={classNames(
                      "studio-pill",
                      activePanel === "inspiration" && "active",
                      !inspirationThumb && "studio-pill--solo-plus"
                    )}
                    style={pillBaseStyle(2)}
                    onClick={() => {
                      if (!inspirationThumb) triggerPick("inspiration");
                      else openPanel("inspiration");
                    }}
                    onMouseEnter={() => openPanel("inspiration")}
                  >
                    {renderPillIcon(inspirationThumb, "+", true)}
                    <span className="studio-pill-main">Inspiration</span>
                  </button>

                  {/* Style */}
                  <button
                    type="button"
                    className={classNames("studio-pill", activePanel === "style" && "active", !styleThumb && "studio-pill--solo-plus")}
                    style={pillBaseStyle(3)}
                    onClick={() => openPanel("style")}
                    onMouseEnter={() => openPanel("style")}
                  >
                    {renderPillIcon(styleThumb, "+", true)}
                    <span className="studio-pill-main">{styleLabel}</span>
                  </button>

                  {/* Mode (Main / Niche) */}
                  <button
                    type="button"
                    className={classNames("studio-pill", "studio-pill--mode")}
                    style={pillBaseStyle(4)}
                    onClick={() => setStyleMode(styleMode === "main" ? "niche" : "main")}
                  >
                    {/* spacer to keep pill alignment without showing an icon */}
                    <span className="studio-pill-icon studio-pill-icon--spacer" aria-hidden="true" />
                    <span className="studio-pill-main">{styleMode === "main" ? "Main" : "Niche"}</span>
                    {/* spacer to keep 2-line pill height without showing refs text */}
                    <span className="studio-pill-sub studio-pill-sub--spacer" aria-hidden="true">
                      &nbsp;
                    </span>
                  </button>

                  {/* Ratio */}
                  <button
                    type="button"
                    className={classNames("studio-pill", "studio-pill--aspect")}
                    style={pillBaseStyle(5)}
                    onClick={onCycleAspect}
                  >
                    <span className="studio-pill-icon">
                      <img src={currentAspectIconUrl} alt="" />
                    </span>
                    <span className="studio-pill-main">{currentAspect.label}</span>
                    <span className="studio-pill-sub">{currentAspect.subtitle}</span>
                  </button>
                </>
              ) : (
                <>
                  {/* Type for me */}
                  {(() => {
                    const typeForMeDisabled = motionSuggesting || motionGenerating || !hasMotionImage || !motionCreditsOk;

                    const typeForMeTitle = !hasMotionImage
                      ? "Upload at least 1 frame first"
                      : !motionCreditsOk
                      ? "Not enough Matcha"
                      : motionGenerating
                      ? "Animating…"
                      : motionSuggesting
                      ? "Typing…"
                      : "Type for me";

                    return (
                      <button
                        type="button"
                        className={classNames(
                          "studio-pill",
                          motionSuggesting && "active",
                          typeForMeDisabled && "studio-pill--ghost"
                        )}
                        style={pillBaseStyle(0)}
                        onClick={() => {
                          if (typeForMeDisabled) return;
                          onTypeForMe?.();
                        }}
                        disabled={typeForMeDisabled}
                        aria-disabled={typeForMeDisabled}
                        title={typeForMeTitle}
                      >
                        {renderPillIcon(TYPE_FOR_ME_ICON, "✎", false, { plain: true })}
                        <span className="studio-pill-main">{typeForMeLabel}</span>
                      </button>
                    );
                  })()}

                  {/* Frames */}
                  <button
                    type="button"
                    className={classNames(
                      "studio-pill",
                      effectivePanel === "product" && "active",
                      !productThumb && "studio-pill--solo-plus"
                    )}
                    style={pillBaseStyle(1)}
                    onClick={() => {
                      if (!productThumb) triggerPick("product");
                      else openPanel("product");
                    }}
                    onMouseEnter={() => openPanel("product")}
                  >
                    {renderPillIcon(productThumb, "+", true)}
                    <span className="studio-pill-main">Frames</span>
                  </button>

                  {/* Movement style */}
                  <button
                    type="button"
                    className={classNames(
                      "studio-pill",
                      effectivePanel === "style" && "active",
                      !motionStyleThumb && "studio-pill--solo-plus"
                    )}
                    style={pillBaseStyle(2)}
                    onClick={() => openPanel("style")}
                    onMouseEnter={() => openPanel("style")}
                  >
                    {renderPillIcon(motionStyleThumb, "+", true)}
                    <span className="studio-pill-main">{motionStyleLabel}</span>
                  </button>

                  {/* Ratio */}
                  <button type="button" className={classNames("studio-pill", "studio-pill--aspect")} style={pillBaseStyle(3)} disabled>
                    <span className="studio-pill-icon">
                      <img
                        src={animateAspectIconUrl || currentAspectIconUrl}
                        alt=""
                        style={{ transform: animateAspectIconRotated ? "rotate(90deg)" : undefined }}
                      />
                    </span>
                    <span className="studio-pill-main">{(animateAspect ?? currentAspect).label}</span>
                    <span className="studio-pill-sub">{(animateAspect ?? currentAspect).subtitle}</span>
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Textarea */}
          <div className="studio-brief-block">
            <div className={classNames("studio-brief-shell", briefHintVisible && "has-brief-hint")} ref={briefShellRef} onScroll={onBriefScroll}>
              <textarea
                ref={briefInputRef}
                className="studio-brief-input"
                maxLength={1000}
                placeholder={
                  isMotion ? "Describe the motion you want (loop, camera, drips, melt, etc.)" : "Describe how you want your still life image to look like"
                }
                value={brief}
                onChange={(e) => onBriefChange(e.target.value)}
                rows={4}
                onPaste={(e) => {
                  const text = e.clipboardData?.getData("text/plain") || "";
                  if (!text) return;
                  const url = text.match(/https?:\/\/[^\s)]+/i)?.[0];
                  if (url && /\.(png|jpe?g|webp|gif|avif)(\?.*)?$/i.test(url)) {
                    onImageUrlPasted?.(url);
                  }
                }}
              />
              <div className={classNames("studio-brief-overlay", minaTalking && "is-visible")} aria-hidden="true">
                {minaTalking ? minaMessage : ""}
              </div>
              {briefHintVisible && <div className="studio-brief-hint">Describe more</div>}
            </div>
          </div>
        </div>

        {/* Panels */}
        <div className="mina-left-block">
          {!isMotion ? (
            <>
              <Collapse open={showPanels && (effectivePanel === "product" || activePanel === null)} delayMs={panelRevealDelayMs}>
                <div className="studio-panel">
                  <div className="studio-panel-title">Add your product</div>

                  <div className="studio-panel-row">
                    <div className="studio-thumbs studio-thumbs--inline" onDragOver={handleDragOver} onDrop={handleDropOnPanel("product")}>
                      {uploads.product.map((it, idx) => (
                        <button
                          key={it.id}
                          type="button"
                          className="studio-thumb"
                          data-panel="product"
                          data-index={idx}
                          style={{ touchAction: "none" }}
                          onPointerDown={onThumbPointerDown("product", idx)}
                          onPointerMove={onThumbPointerMove}
                          onPointerUp={onThumbPointerUp}
                          onPointerCancel={onThumbPointerUp}
                          onClick={() => handleThumbClick("product", it.id)}
                          title="Drag to reorder • Click to delete"
                        >
                          {getDisplayUrl(it) ? (
                            <img src={getDisplayUrl(it)} alt="" draggable={false} />
                          ) : it.uploading ? (
                            <span className="studio-thumb-spinner" aria-hidden="true" />
                          ) : null}
                        </button>
                      ))}

                      {uploads.product.length === 0 && (
                        <button type="button" className="studio-plusbox studio-plusbox--inline" onClick={() => triggerPick("product")} title="Add image">
                          <span aria-hidden="true">+</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </Collapse>

              <Collapse open={showPanels && activePanel === "logo"} delayMs={panelRevealDelayMs}>
                <div className="studio-panel">
                  <div className="studio-panel-title">Add your logo</div>

                  <div className="studio-panel-row">
                    <div className="studio-thumbs studio-thumbs--inline" onDragOver={handleDragOver} onDrop={handleDropOnPanel("logo")}>
                      {uploads.logo.map((it) => (
                        <button key={it.id} type="button" className="studio-thumb" onClick={() => removeUploadItem("logo", it.id)} title="Click to delete">
                          {getDisplayUrl(it) ? <img src={getDisplayUrl(it)} alt="" /> : it.uploading ? <span className="studio-thumb-spinner" aria-hidden="true" /> : null}
                        </button>
                      ))}

                      {uploads.logo.length === 0 && (
                        <button type="button" className="studio-plusbox studio-plusbox--inline" onClick={() => triggerPick("logo")} title="Add image">
                          <span aria-hidden="true">+</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </Collapse>

              <Collapse open={showPanels && activePanel === "inspiration"} delayMs={panelRevealDelayMs}>
                <div className="studio-panel">
                  <div className="studio-panel-title">Add your inspirations</div>

                  <div className="studio-panel-row">
                    <div className="studio-thumbs studio-thumbs--inline" onDragOver={handleDragOver} onDrop={handleDropOnPanel("inspiration")}>
                      {uploads.inspiration.map((it, idx) => (
                        <button
                          key={it.id}
                          type="button"
                          className="studio-thumb"
                          data-panel="inspiration"
                          data-index={idx}
                          style={{ touchAction: "none" }}
                          onPointerDown={onThumbPointerDown("inspiration", idx)}
                          onPointerMove={onThumbPointerMove}
                          onPointerUp={onThumbPointerUp}
                          onPointerCancel={onThumbPointerUp}
                          onClick={() => handleThumbClick("inspiration", it.id)}
                          onDragStart={(e) => e.preventDefault()}
                          title="Drag to reorder • Click to delete"
                        >
                          {getDisplayUrl(it) ? (
                            <img src={getDisplayUrl(it)} alt="" draggable={false} style={{ WebkitUserDrag: "none", userSelect: "none" }} />
                          ) : it.uploading ? (
                            <span className="studio-thumb-spinner" aria-hidden="true" />
                          ) : null}
                        </button>
                      ))}

                      {uploads.inspiration.length < 4 && (
                        <button type="button" className="studio-plusbox studio-plusbox--inline" onClick={() => triggerPick("inspiration")} title="Add image">
                          <span aria-hidden="true">+</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </Collapse>

              <Collapse open={showPanels && activePanel === "style"} delayMs={panelRevealDelayMs}>
                <div className="studio-panel">
                  <div className="studio-panel-title">Pick a style</div>

                  <div className="studio-style-row">
                    {allStyleCards.map((s) => (
                      <button
                        key={s.key}
                        type="button"
                        draggable
                        onDragStart={(e) => {
                          // marker (use BOTH types for cross-browser reliability)
                          e.dataTransfer.setData("text/x-mina-style-thumb", "1");
                          e.dataTransfer.setData("application/x-mina-style-thumb", "1");

                          e.dataTransfer.setData("text/uri-list", s.thumb);
                          e.dataTransfer.setData("text/plain", s.thumb);
                          e.dataTransfer.effectAllowed = "copy";
                        }}
                        className={classNames("studio-style-card", stylePresetKeys.includes(s.key) && "active")}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          onStyleSingleClick(s.key); // single click = select
                        }}
                        onDoubleClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          onStyleDoubleClick(s); // double click = confirm delete (custom only)
                        }}
                        title={s.isCustom ? "Double click to delete" : undefined}
                      >
                        <div className="studio-style-thumb">
                          {s.thumb ? <img src={s.thumb} alt="" draggable={false} /> : <span aria-hidden="true">+</span>}
                        </div>
                        <div className="studio-style-label">{s.label}</div>
                      </button>
                    ))}

                    {/* Create style */}
                    <button type="button" className={classNames("studio-style-card", "add")} onClick={onOpenCustomStylePanel}>
                      <div className="studio-style-thumb">
                        <span aria-hidden="true">+</span>
                      </div>
                      <div className="studio-style-label">Your style</div>
                    </button>
                  </div>
                </div>
              </Collapse>
            </>
          ) : (
            <>
              <Collapse open={showPanels && (effectivePanel === "product" || activePanel === null)} delayMs={panelRevealDelayMs}>
                <div className="studio-panel">
                  <div className="studio-panel-title">Add frames</div>

                  <div className="studio-panel-row">
                    <div className="studio-thumbs studio-thumbs--inline" onDragOver={handleDragOver} onDrop={handleDropOnPanel("product")}>
                      {uploads.product.map((it, idx) => (
                        <button
                          key={it.id}
                          type="button"
                          className="studio-thumb"
                          data-panel="product"
                          data-index={idx}
                          style={{ touchAction: "none" }}
                          onPointerDown={onThumbPointerDown("product", idx)}
                          onPointerMove={onThumbPointerMove}
                          onPointerUp={onThumbPointerUp}
                          onPointerCancel={onThumbPointerUp}
                          onClick={() => handleThumbClick("product", it.id)}
                          title="Drag to reorder • Click to delete"
                        >
                          {getDisplayUrl(it) ? <img src={getDisplayUrl(it)} alt="" draggable={false} /> : it.uploading ? <span className="studio-thumb-spinner" aria-hidden="true" /> : null}
                        </button>
                      ))}

                      {uploads.product.length < 2 && (
                        <button
                          type="button"
                          className="studio-plusbox studio-plusbox--inline"
                          onClick={() => triggerPick("product")}
                          title={uploads.product.length === 0 ? "Add start frame" : "Add end frame (optional)"}
                        >
                          <span aria-hidden="true">+</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </Collapse>

              <Collapse open={showPanels && (effectivePanel === "style" || activePanel === null)} delayMs={panelRevealDelayMs}>
                <div className="studio-panel">
                  <div className="studio-panel-title">Pick movement styles</div>

                  <div className="studio-style-row">
                    {MOTION_STYLES.map((m) => (
                      <button
                        key={m.key}
                        type="button"
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.setData("text/x-mina-style-thumb", "1");
                          e.dataTransfer.setData("application/x-mina-style-thumb", "1");
                          e.dataTransfer.setData("text/uri-list", m.thumb);
                          e.dataTransfer.setData("text/plain", m.thumb);
                          e.dataTransfer.effectAllowed = "copy";
                        }}
                        className={classNames("studio-style-card", "studio-motion-style-card", motionStyleKeys.includes(m.key) && "active")}
                        onClick={() => pickMotionStyle(m.key)}
                      >
                        <div className={classNames("studio-style-thumb", "studio-motion-style-thumb")}>
                          {m.thumb ? (
                            <img src={m.thumb} alt="" draggable={false} />
                          ) : (
                            <span aria-hidden="true">{m.label.slice(0, 1)}</span>
                          )}
                        </div>
                        <div className="studio-motion-style-label">{m.label}</div>
                      </button>
                    ))}
                  </div>
                </div>
              </Collapse>
            </>
          )}

          {/* Controls */}
          {showControls && (
            <div className="studio-controls">
              <div className="studio-controls-divider" />

              <button type="button" className="studio-vision-toggle" onClick={onToggleVision}>
                Mina Vision Intelligence: <span className="studio-vision-state">{minaVisionEnabled ? "ON" : "OFF"}</span>
              </button>

              {isMotion && motionBlockReason ? <div className="error-text">{motionBlockReason}</div> : null}

              <div className="studio-create-block">
                <button
                  type="button"
                  aria-busy={createDisabled}
                  className={classNames("studio-create-link", createDisabled && "disabled", createState === "describe_more" && "state-describe")}
                  disabled={createDisabled}
                  onClick={handleCreateClick}
                  title={isMotion && !hasMotionHandler ? "Wire onCreateMotion in MinaApp" : undefined}
                >
                  {createLabel}
                </button>
              </div>

              {!isMotion && stillError && <div className="error-text">{stillError}</div>}
              {isMotion && motionError && <div className="error-text">{motionError}</div>}
            </div>
          )}
        </div>

        {/* Delete confirm modal */}
        {deleteConfirm && (
          <div
            onClick={confirmDeleteNo}
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,0.45)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 9999,
              padding: 16,
            }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                width: "min(420px, 92vw)",
                background: "#fff",
                borderRadius: 18,
                padding: 18,
                boxShadow: "0 16px 50px rgba(0,0,0,0.25)",
              }}
            >
              <div style={{ fontSize: 16, marginBottom: 12 }}>
                Do you want delete style <b>{deleteConfirm.label}</b>?
              </div>

              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                <button
                  type="button"
                  onClick={confirmDeleteNo}
                  style={{
                    padding: "10px 14px",
                    borderRadius: 12,
                    border: "1px solid #ddd",
                    background: "#fff",
                    cursor: "pointer",
                  }}
                >
                  <b>NO</b>
                </button>

                <button
                  type="button"
                  onClick={confirmDeleteYes}
                  style={{
                    padding: "10px 14px",
                    borderRadius: 12,
                    border: "1px solid #111",
                    background: "#111",
                    color: "#fff",
                    cursor: "pointer",
                  }}
                >
                  <b>YES</b>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Hidden file inputs */}
        <input
          ref={productInputRef}
          type="file"
          accept="image/*"
          multiple={isMotion}
          style={{ display: "none" }}
          onChange={(e) => handleFileInput("product", e)}
        />
        <input
          ref={logoInputRef}
          type="file"
          accept="image/*"
          style={{ display: "none" }}
          onChange={(e) => handleFileInput("logo", e)}
        />
        <input
          ref={inspirationInputRef}
          type="file"
          accept="image/*"
          multiple
          style={{ display: "none" }}
          onChange={(e) => handleFileInput("inspiration", e)}
        />
      </div>

      <div className="studio-footer-links">
        <button type="button" className="studio-footer-link" onClick={onGoProfile}>
          Profile
        </button>
        <a className="studio-footer-link" href="https://wa.me/971522177594" target="_blank" rel="noreferrer">
          Need help?
        </a>
        <span className="studio-footer-link studio-footer-link--disabled">Tutorial</span>
      </div>
    </div>
  );
};

export default StudioLeft;
