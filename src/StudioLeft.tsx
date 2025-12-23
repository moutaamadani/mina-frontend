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

  stylePresets: readonly StylePreset[];
  customStyles: CustomStyle[];

  getStyleLabel: (key: string, fallback: string) => string;

  editingStyleKey: string | null;
  editingStyleValue: string;
  setEditingStyleValue: (v: string) => void;

  beginRenameStyle: (key: string, currentLabel: string) => void;
  commitRenameStyle: () => void;
  cancelRenameStyle: () => void;

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
// Motion styles (exactly 6)
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
    stylePresets,
    customStyles,
    getStyleLabel,

    editingStyleKey,
    editingStyleValue,
    setEditingStyleValue,
    beginRenameStyle,
    commitRenameStyle,
    cancelRenameStyle,
    deleteCustomStyle,

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

  const imageCreditsOk = imageCreditsOkProp ?? true;
  const hasMotionImage = !!motionHasImageProp;

  const briefInputRef = useRef<HTMLTextAreaElement | null>(null);

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
  const effectivePanel: PanelKey = uiStage === 0 ? null : (activePanel ?? "product");

  const getFirstImageUrl = (items: UploadItem[]) => items[0]?.remoteUrl || items[0]?.url || "";

  // Prefer permanent URLs. Hide blob: previews (user asked: no blobs in UI).
  const getDisplayUrl = (it: UploadItem) => {
    const u = it?.remoteUrl || it?.url || "";
    if (!u) return "";
    if (u.startsWith("blob:")) return ""; // hide blob previews
    return u;
  };

  // Drag/drop support:
  // - drop files => onFilesPicked(panel, files)
  // - drop url => onImageUrlPasted(url) (and we open the panel for UX)
  const extractDropUrl = (e: React.DragEvent) => {
    const dt = e.dataTransfer;

    const uri = (dt.getData("text/uri-list") || "").trim();
    const plain = (dt.getData("text/plain") || "").trim();
    const html = dt.getData("text/html") || "";

    const fromHtml =
      html.match(/src\s*=\s*["']([^"']+)["']/i)?.[1] ||
      html.match(/https?:\/\/[^\s"'<>]+/i)?.[0] ||
      "";

    const candidates = [uri, plain, fromHtml].filter(Boolean).map((u) => u.split("\n")[0].trim());

    for (const u of candidates) {
      if (/^https?:\/\//i.test(u)) return u; // ✅ only http(s)
    }
    return "";
  };

  const handleDropOnPanel = (panel: UploadPanelKey) => (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    // ✅ Ignore drags that originate from style thumbnails (prevents accidental style->upload)
    const dt = e.dataTransfer;
    const types = Array.from(dt?.types ?? []);
    
    const isStyleThumbDrag =
      types.includes("text/x-mina-style-thumb") ||
      types.includes("application/x-mina-style-thumb") ||
      dt?.getData("text/x-mina-style-thumb") === "1" ||
      dt?.getData("application/x-mina-style-thumb") === "1";
    
    // ✅ Block style-thumbs from being added as uploads (prevents accidents)
    if (isStyleThumbDrag) return;
    // ✅ First: if the drag contains a URL, treat it as a URL drop (prevents blob/temp-file drags)
    const url = extractDropUrl(e);
    if (url) {
      openPanel(panel);
      props.onImageUrlPasted?.(url);
      return;
    }

    // ✅ Otherwise: normal file drop (from desktop)
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
      ? "Editorial styles"
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
  const hasMotionHandler = typeof props.onCreateMotion === "function";

  const imageCreateState: "creating" | "uploading" | "describe_more" | "ready" =
    stillGenerating
      ? "creating"
      : uploadsPending
        ? "uploading"
        : !imageCreditsOk
          ? "describe_more"
          : briefLen < 20
            ? "describe_more"
            : "ready";

  const motionSuggesting = !!props.motionSuggesting;
  const motionHasImage = !!props.motionHasImage;
  const canCreateMotion = props.canCreateMotion ?? briefLen >= 1;
  const motionCreditsOk = props.motionCreditsOk ?? true;
  const motionBlockReason = props.motionBlockReason || null;

  const typeForMeLabel = motionSuggesting ? "Typing…" : "Type for me";

  const motionCreateState: "creating" | "describe_more" | "ready" = motionGenerating
    ? "creating"
    : motionSuggesting
      ? "creating"
      : canCreateMotion && motionCreditsOk
        ? "ready"
        : "describe_more";

  const createState = isMotion ? motionCreateState : imageCreateState;
  const canCreateStill = imageCreateState === "ready";

  const createLabel =
    createState === "creating"
      ? isMotion
        ? motionSuggesting
          ? "Typing…"
          : "Animating…"
        : "Creating…"
    : createState === "uploading"
      ? "Uploading…"
      : createState === "describe_more"
        ? (!isMotion && !imageCreditsOk) || (isMotion && !motionCreditsOk)
          ? "I need Matcha"
          : "Describe more"
        : isMotion
          ? "Animate"
          : "Create";

  const wantsMatcha = (!isMotion && !imageCreditsOk) || (isMotion && !motionCreditsOk);

  const createDisabled =
    createState === "creating" ||
    createState === "uploading" ||
    (createState === "describe_more"
      ? wantsMatcha
        ? false
        : isMotion
          ? !hasMotionHandler || motionSuggesting || !motionCreditsOk || !hasMotionImage || !canCreateMotion
          : !canCreateStill
      : (isMotion && (!hasMotionHandler || motionSuggesting || !motionCreditsOk)) ||
        (!isMotion && (!canCreateStill || !imageCreditsOk)));

  const handleCreateClick = () => {
    if (createState === "ready") {
      if (isMotion) {
        props.onCreateMotion?.();
      } else {
        onCreateStill();
      }
      return;
    }

    if (createState === "describe_more") {
      if (wantsMatcha) {
        window.open(matchaUrl, "_blank", "noopener");
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

  // still style click: allow 0/1/2+ selections just like motion styles
  const toggleStylePreset = (key: string) => {
    setStylePresetKeys((prev) => {
      const exists = prev.includes(key);
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
                                if (!productThumb) {
                                  triggerPick("product");
                                } else {
                                  openPanel("product");
                                }
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
                                if (!logoThumb) {
                                  triggerPick("logo");
                                } else {
                                  openPanel("logo");
                                }
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
                                if (!inspirationThumb) {
                                  triggerPick("inspiration");
                                } else {
                                  openPanel("inspiration");
                                }
                              }}
                              onMouseEnter={() => openPanel("inspiration")}
                            >
                              {renderPillIcon(inspirationThumb, "+", true)}
                              <span className="studio-pill-main">Inspiration</span>
                            </button>


                 {/* Style */}
                          <button
                            type="button"
                            className={classNames(
                              "studio-pill",
                              activePanel === "style" && "active",
                              !styleThumb && "studio-pill--solo-plus"
                            )}
                            style={pillBaseStyle(3)}
                            onClick={() => openPanel("style")}
                            onMouseEnter={() => openPanel("style")}
                          >
                            {renderPillIcon(styleThumb, "+", true)}
                            <span className="studio-pill-main">{styleLabel}</span>
                          </button>


                  {/* Ratio */}
                  <button
                    type="button"
                    className={classNames("studio-pill", "studio-pill--aspect")}
                    style={pillBaseStyle(4)}
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
                          <button
                            type="button"
                            className={classNames("studio-pill", motionSuggesting && "active")}
                            style={pillBaseStyle(0)}
                            onClick={() => onTypeForMe?.()}
                            disabled={
                              motionSuggesting || motionGenerating || !hasMotionImage || !motionCreditsOk
                            }
                          >
                            {renderPillIcon(TYPE_FOR_ME_ICON, "✎", false, { plain: true })}
                            <span className="studio-pill-main">{typeForMeLabel}</span>
                          </button>

                          {/* Image */}
                          <button
                            type="button"
                            className={classNames(
                              "studio-pill",
                              effectivePanel === "product" && "active",
                              !productThumb && "studio-pill--solo-plus"
                            )}
                            style={pillBaseStyle(1)}
                            onClick={() => {
                              if (!productThumb) {
                                triggerPick("product");
                              } else {
                                openPanel("product");
                              }
                            }}
                            onMouseEnter={() => openPanel("product")}
                          >
                            {renderPillIcon(productThumb, "+", true)}
                            <span className="studio-pill-main">Frames</span>
                          </button>

                          {/* Mouvement style */}
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
                  <button
                    type="button"
                    className={classNames("studio-pill", "studio-pill--aspect")}
                    style={pillBaseStyle(3)}
                    disabled
                  >
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
            <div
              className={classNames("studio-brief-shell", briefHintVisible && "has-brief-hint")}
              ref={briefShellRef}
              onScroll={onBriefScroll}
            >
              <textarea
                ref={briefInputRef}
                className="studio-brief-input"
                placeholder={
                  isMotion
                    ? "Describe the motion you want (loop, camera, drips, melt, etc.)"
                    : "Describe how you want your still life image to look like"
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
              <div
                className={classNames("studio-brief-overlay", minaTalking && "is-visible")}
                aria-hidden="true"
              >
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
                      <div
                        className="studio-thumbs studio-thumbs--inline"
                        onDragOver={handleDragOver}
                        onDrop={handleDropOnPanel("product")}
                      >
                        {uploads.product.map((it) => (
                          <button
                            key={it.id}
                            type="button"
                            className="studio-thumb"
                            onClick={() => removeUploadItem("product", it.id)}
                            title="Click to delete"
                          >
                            {getDisplayUrl(it) ? (
                              <img src={getDisplayUrl(it)} alt="" />
                            ) : it.uploading ? (
                              <span className="studio-thumb-spinner" aria-hidden="true" />
                            ) : null}
                          </button>
                        ))}

                        {uploads.product.length === 0 && (
                          <button
                            type="button"
                            className="studio-plusbox studio-plusbox--inline"
                            onClick={() => triggerPick("product")}
                            title="Add image"
                          >
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
                      <div
                        className="studio-thumbs studio-thumbs--inline"
                        onDragOver={handleDragOver}
                        onDrop={handleDropOnPanel("logo")}
                      >
                        {uploads.logo.map((it) => (
                          <button
                            key={it.id}
                            type="button"
                            className="studio-thumb"
                            onClick={() => removeUploadItem("logo", it.id)}
                            title="Click to delete"
                          >
                            {getDisplayUrl(it) ? (
                              <img src={getDisplayUrl(it)} alt="" />
                            ) : it.uploading ? (
                              <span className="studio-thumb-spinner" aria-hidden="true" />
                            ) : null}
                          </button>
                        ))}

                        {uploads.logo.length === 0 && (
                          <button
                            type="button"
                            className="studio-plusbox studio-plusbox--inline"
                            onClick={() => triggerPick("logo")}
                            title="Add image"
                          >
                            <span aria-hidden="true">+</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </Collapse>

                <Collapse open={showPanels && activePanel === "inspiration"} delayMs={panelRevealDelayMs}>
                  <div className="studio-panel">
                    <div className="studio-panel-title">Add inspiration</div>

                    <div className="studio-panel-row">
                      <div
                        className="studio-thumbs studio-thumbs--inline"
                        onDragOver={handleDragOver}
                        onDrop={handleDropOnPanel("inspiration")}
                      >
                        {uploads.inspiration.map((it, idx) => (
                          <button
                            key={it.id}
                            type="button"
                            className="studio-thumb"
                            draggable
                            onDragStart={() => {
                              (window as any).__minaDragIndex = idx;
                            }}
                            onDragOver={(e) => e.preventDefault()}
                            onDrop={(e) => {
                              e.preventDefault();
                              const from = Number((window as any).__minaDragIndex);
                              const to = idx;
                              if (Number.isFinite(from) && from !== to) {
                                moveUploadItem("inspiration", from, to);
                              }
                              (window as any).__minaDragIndex = null;
                            }}
                            onClick={() => removeUploadItem("inspiration", it.id)}
                            title="Click to delete • Drag to reorder"
                          >
                            {getDisplayUrl(it) ? (
                              <img src={getDisplayUrl(it)} alt="" />
                            ) : it.uploading ? (
                              <span className="studio-thumb-spinner" aria-hidden="true" />
                            ) : null}
                          </button>
                        ))}

                        {uploads.inspiration.length < 4 && (
                          <button
                            type="button"
                            className="studio-plusbox studio-plusbox--inline"
                            onClick={() => triggerPick("inspiration")}
                            title="Add image"
                          >
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
                            // ✅ marker (use BOTH types for cross-browser reliability)
                            e.dataTransfer.setData("text/x-mina-style-thumb", "1");
                            e.dataTransfer.setData("application/x-mina-style-thumb", "1");
                          
                            e.dataTransfer.setData("text/uri-list", s.thumb /* or m.thumb */);
                            e.dataTransfer.setData("text/plain", s.thumb /* or m.thumb */);
                            e.dataTransfer.effectAllowed = "copy";
                          }}

                          className={classNames(
                            "studio-style-card",
                            stylePresetKeys.includes(s.key) && "active"
                          )}
                          onClick={() => toggleStylePreset(s.key)}
                        >
                          <div className="studio-style-thumb">
                            {s.thumb ? <img src={s.thumb} alt="" draggable={false} /> : <span aria-hidden="true">+</span>}
                          </div>

                      <div
                        className="studio-style-label"
                            onDoubleClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              if (s.isCustom) deleteCustomStyle(s.key);
                            }}
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              beginRenameStyle(s.key, s.label);
                            }}
                          >
                            {editingStyleKey === s.key ? (
                              <input
                                autoFocus
                                value={editingStyleValue}
                                onChange={(e) => setEditingStyleValue(e.target.value)}
                                onBlur={commitRenameStyle}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") commitRenameStyle();
                                  if (e.key === "Escape") cancelRenameStyle();
                                }}
                              />
                            ) : (
                              s.label
                            )}
                          </div>
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
                    <div className="studio-panel-title">Add one or two frames</div>

                    <div className="studio-panel-row">
                      <div
                        className="studio-thumbs studio-thumbs--inline"
                        onDragOver={handleDragOver}
                        onDrop={handleDropOnPanel("product")}
                      >
                        {uploads.product.map((it, idx) => (
                          <button
                            key={it.id}
                            type="button"
                            className="studio-thumb"
                            draggable
                            onDragStart={() => {
                              (window as any).__minaDragIndex = idx;
                            }}
                            onDragOver={(e) => e.preventDefault()}
                            onDrop={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              const from = Number((window as any).__minaDragIndex);
                              const to = idx;
                              if (Number.isFinite(from) && from !== to) {
                                moveUploadItem("product", from, to);
                              }
                              (window as any).__minaDragIndex = null;
                            }}
                            onClick={() => removeUploadItem("product", it.id)}
                            title={idx === 0 ? "Start frame (required) • Click to delete • Drag to reorder" : "End frame (optional) • Click to delete • Drag to reorder"}
                          >
                            {getDisplayUrl(it) ? (
                              <img src={getDisplayUrl(it)} alt="" />
                            ) : it.uploading ? (
                              <span className="studio-thumb-spinner" aria-hidden="true" />
                            ) : null}
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
                              // ✅ marker (use BOTH types for cross-browser reliability)
                              e.dataTransfer.setData("text/x-mina-style-thumb", "1");
                              e.dataTransfer.setData("application/x-mina-style-thumb", "1");
                            
                              e.dataTransfer.setData("text/uri-list", s.thumb /* or m.thumb */);
                              e.dataTransfer.setData("text/plain", s.thumb /* or m.thumb */);
                              e.dataTransfer.effectAllowed = "copy";
                            }}

                          className={classNames(
                            "studio-style-card",
                            "studio-motion-style-card",
                            motionStyleKeys.includes(m.key) && "active"
                          )}
                          onClick={() => pickMotionStyle(m.key)}
                        >
                          <div className={classNames("studio-style-thumb", "studio-motion-style-thumb")}>
                            {m.thumb ? <img src={m.thumb} alt="" draggable={false} /> : <span aria-hidden="true">{m.label.slice(0, 1)}</span>}
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

                <div className="studio-create-block">
                  <button
                    type="button"
                    aria-busy={createDisabled}
                    className={classNames(
                      "studio-create-link",
                      createDisabled && "disabled",
                      createState === "describe_more" && "state-describe"
                    )}
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
