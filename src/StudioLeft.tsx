// src/StudioLeft.tsx
// ============================================================================
// Mina Studio — LEFT SIDE (Input + pills + panels + style + create + motion)
// ============================================================================

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

export type MotionStyleKey = "melt" | "drop" | "expand" | "satisfying" | "slow_motion" | "fix_camera";

type StudioLeftProps = {
  globalDragging: boolean;

  showPills: boolean;
  showPanels: boolean;
  showControls: boolean;
  uiStage: 0 | 1 | 2 | 3;

  brief: string;
  briefHintVisible: boolean;
  briefShellRef: React.RefObject<HTMLDivElement>;
  onBriefScroll: () => void;
  onBriefChange: (value: string) => void;

  briefFocused: boolean;
  setBriefFocused: (v: boolean) => void;

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

  stylePresetKey: string;
  setStylePresetKey: (k: string) => void;

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

  motionGenerating?: boolean;
  motionError?: string | null;
  onCreateMotion?: () => void;

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
const MOTION_STYLES: Array<{ key: MotionStyleKey; label: string; seed: string }> = [
  { key: "melt", label: "Melt", seed: "Slow, elegant melting motion—soft drips, glossy tension, luxury macro feel." },
  { key: "drop", label: "Drop", seed: "Gentle droplets falling in slow rhythm—minimal, ASMR, clean editorial motion." },
  { key: "expand", label: "Expand", seed: "Subtle expansion / blooming—fabric or liquid spreading softly, calm luxury vibe." },
  { key: "satisfying", label: "Satisfying", seed: "Perfectly smooth, satisfying motion loop—micro movements, clean, premium." },
  { key: "slow_motion", label: "Slow motion", seed: "Ultra slow camera drift + tiny prop movement—soft light shifts, premium calm." },
  { key: "fix_camera", label: "Fix camera", seed: "Fixed camera, only scene moves—minimal loop, tiny motion in light/props." },
];

// ============================================================================
// Component
// ============================================================================
const StudioLeft: React.FC<StudioLeftProps> = (props) => {
  const {
    globalDragging,
    showPills,
    showPanels,
    showControls,
    uiStage,

    brief,
    briefHintVisible,
    briefShellRef,
    onBriefScroll,
    onBriefChange,

    briefFocused,
    setBriefFocused,

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

    stylePresetKey,
    setStylePresetKey,
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

    minaVisionEnabled,
    onToggleVision,

    stillGenerating,
    stillError,
    onCreateStill,

    motionHasImage,

    onGoProfile,
  } = props;

  const briefInputRef = useRef<HTMLTextAreaElement | null>(null);

  // ✅ motion mode (with local fallback)
  const [localAnimate, setLocalAnimate] = useState(false);
  const animateMode = props.animateMode ?? localAnimate;
  const prevAnimateModeRef = useRef(animateMode);

  const [localMotionStyle, setLocalMotionStyle] = useState<MotionStyleKey[]>(["fix_camera"]);
  const motionStyleKeys = props.motionStyleKeys ?? localMotionStyle;
  const setMotionStyleKeys = props.setMotionStyleKeys ?? setLocalMotionStyle;

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
  });

  const plusOrTick = (n: number) => (n > 0 ? "✓" : "+");

  // panel behavior
  const effectivePanel: PanelKey = uiStage === 0 ? null : (activePanel ?? "product");

  const productCount = uploads.product.length;
  const logoCount = uploads.logo.length;
  const inspirationCount = uploads.inspiration.length;
  const motionImageCount = motionHasImage ? 1 : productCount;

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

  // -------------------------
  // Create CTA state machine
  // -------------------------
  const motionGenerating = !!props.motionGenerating;
  const motionError = props.motionError ?? null;
  const hasMotionHandler = typeof props.onCreateMotion === "function";

  const imageCreateState: "creating" | "uploading" | "describe_more" | "ready" =
    stillGenerating ? "creating" : uploadsPending ? "uploading" : briefLen < 40 ? "describe_more" : "ready";

  const motionSuggesting = !!props.motionSuggesting;
  const canCreateMotion = props.canCreateMotion ?? briefLen >= 1;

  const motionCreateState: "creating" | "describe_more" | "ready" = motionGenerating
    ? "creating"
    : motionSuggesting
      ? "creating"
      : canCreateMotion
        ? "ready"
        : "describe_more";

  const createState = isMotion ? motionCreateState : imageCreateState;
  const canCreateStill = imageCreateState === "ready";

  const createLabel =
    createState === "creating"
      ? isMotion
        ? "Animating…"
        : "Creating…"
      : createState === "uploading"
        ? "Uploading…"
        : createState === "describe_more"
          ? "Describe more"
          : isMotion
            ? "Animate"
            : "Create";

  const createDisabled =
    createState === "creating" ||
    createState === "uploading" ||
    (isMotion && (!hasMotionHandler || motionSuggesting)) ||
    (!isMotion && !canCreateStill);

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
      setBriefFocused(true);
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
      return next.length ? next : ["fix_camera"];
    });
    openPanel("style");

    // only seed if user hasn't typed yet
    const trimmed = brief.trim();
    if ((!trimmed || trimmed.length < 4) && added) {
      const seed = MOTION_STYLES.find((s) => s.key === k)?.seed || "";
      if (seed) onBriefChange(seed);
    }
  };

  return (
    <div className={classNames("studio-left", globalDragging && "drag-active")}>
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
                    className={classNames("studio-pill", effectivePanel === "product" && "active")}
                    style={pillBaseStyle(0)}
                    onClick={() => openPanel("product")}
                  >
                    <span className="studio-pill-main">Product</span>
                    <span aria-hidden="true">{plusOrTick(productCount)}</span>
                  </button>

                  {/* Logo */}
                  <button
                    type="button"
                    className={classNames("studio-pill", activePanel === "logo" && "active")}
                    style={pillBaseStyle(1)}
                    onClick={() => openPanel("logo")}
                  >
                    <span className="studio-pill-main">Logo</span>
                    <span aria-hidden="true">{plusOrTick(logoCount)}</span>
                  </button>

                  {/* Inspiration */}
                  <button
                    type="button"
                    className={classNames("studio-pill", activePanel === "inspiration" && "active")}
                    style={pillBaseStyle(2)}
                    onClick={() => openPanel("inspiration")}
                  >
                    <span className="studio-pill-main">Inspiration</span>
                    <span aria-hidden="true">{plusOrTick(inspirationCount)}</span>
                  </button>

                  {/* Style */}
                  <button
                    type="button"
                    className={classNames("studio-pill", activePanel === "style" && "active")}
                    style={pillBaseStyle(3)}
                    onClick={() => openPanel("style")}
                  >
                    <span className="studio-pill-main">Style</span>
                    <span aria-hidden="true">✓</span>
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
                  {/* Image */}
                  <button
                    type="button"
                    className={classNames("studio-pill", effectivePanel === "product" && "active")}
                    style={pillBaseStyle(0)}
                    onClick={() => openPanel("product")}
                  >
                    <span className="studio-pill-main">Image</span>
                    <span aria-hidden="true">{plusOrTick(motionImageCount)}</span>
                  </button>

                  {/* Mouvement style */}
                  <button
                    type="button"
                    className={classNames("studio-pill", effectivePanel === "style" && "active")}
                    style={pillBaseStyle(0)}
                    onClick={() => openPanel("style")}
                  >
                    <span className="studio-pill-main">Mouvement style</span>
                  </button>

                  {/* Ratio */}
                  <button
                    type="button"
                    className={classNames("studio-pill", "studio-pill--aspect")}
                    style={pillBaseStyle(2)}
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
                onFocus={() => setBriefFocused(true)}
                onBlur={() => setBriefFocused(false)}
              />
              {briefHintVisible && <div className="studio-brief-hint">Describe more</div>}
            </div>
          </div>
        </div>

        {/* Panels */}
        {!briefFocused && (
          <div className="mina-left-block">
            {!isMotion ? (
              <>
                <Collapse open={showPanels && (effectivePanel === "product" || activePanel === null)} delayMs={panelRevealDelayMs}>
                  <div className="studio-panel">
                    <div className="studio-panel-title">Add your product</div>

                    <div className="studio-panel-row">
                      <div className="studio-thumbs studio-thumbs--inline">
                        {uploads.product.map((it) => (
                          <button
                            key={it.id}
                            type="button"
                            className="studio-thumb"
                            onClick={() => removeUploadItem("product", it.id)}
                            title="Click to delete"
                          >
                            <img src={it.remoteUrl || it.url} alt="" />
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
                      <div className="studio-thumbs studio-thumbs--inline">
                        {uploads.logo.map((it) => (
                          <button
                            key={it.id}
                            type="button"
                            className="studio-thumb"
                            onClick={() => removeUploadItem("logo", it.id)}
                            title="Click to delete"
                          >
                            <img src={it.remoteUrl || it.url} alt="" />
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
                      <div className="studio-thumbs studio-thumbs--inline">
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
                            <img src={it.remoteUrl || it.url} alt="" />
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
                          className={classNames("studio-style-card", stylePresetKey === s.key && "active")}
                          onMouseEnter={() => setStylePresetKey(s.key)}
                          onClick={() => setStylePresetKey(s.key)}
                        >
                          <div className="studio-style-thumb">
                            <img src={s.thumb} alt="" />
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
                        <div className="studio-style-label">Create style</div>
                      </button>
                    </div>
                  </div>
                </Collapse>
              </>
            ) : (
              <>
                <Collapse open={showPanels && (effectivePanel === "product" || activePanel === null)} delayMs={panelRevealDelayMs}>
                  <div className="studio-panel">
                    <div className="studio-panel-title">Add your image</div>

                    <div className="studio-panel-row">
                      <div className="studio-thumbs studio-thumbs--inline">
                        {uploads.product.map((it) => (
                          <button
                            key={it.id}
                            type="button"
                            className="studio-thumb"
                            onClick={() => removeUploadItem("product", it.id)}
                            title="Click to delete"
                          >
                            <img src={it.remoteUrl || it.url} alt="" />
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

                <Collapse open={showPanels && (effectivePanel === "style" || activePanel === null)} delayMs={panelRevealDelayMs}>
                  <div className="studio-panel">
                    <div className="studio-panel-title">Pick a mouvement style</div>

                    <div className="studio-style-row">
                      {MOTION_STYLES.map((m) => (
                        <button
                          key={m.key}
                          type="button"
                          className={classNames(
                            "studio-style-card",
                            "studio-motion-card",
                            motionStyleKeys.includes(m.key) && "active"
                          )}
                          onClick={() => pickMotionStyle(m.key)}
                        >
                          <div className={classNames("studio-style-thumb", "studio-motion-thumb")}>
                            <span aria-hidden="true">{m.label.slice(0, 1)}</span>
                          </div>
                          <div className="studio-style-label">{m.label}</div>
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
        )}

        {/* Hidden file inputs */}
        <input
          ref={productInputRef}
          type="file"
          accept="image/*"
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

      {/* Profile bottom-left */}
      <button type="button" className="studio-profile-float" onClick={onGoProfile}>
        Profile
      </button>
    </div>
  );
};

export default StudioLeft;
