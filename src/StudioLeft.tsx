// src/StudioLeft.tsx
// ============================================================================
// StudioLeft — LEFT COLUMN ONLY (brief + pills + panels + style + vision + create)
// ============================================================================

import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import "./StudioLeft.css";

// ============================================================================
// Types (kept local so MinaApp stays sane)
// ============================================================================
type UploadPanelKey = "product" | "logo" | "inspiration";
type PanelKey = "product" | "logo" | "inspiration" | "style" | null;

type UploadItem = {
  id: string;
  kind: "file" | "url";
  url: string;
  remoteUrl?: string;
  uploading?: boolean;
  error?: string;
};

type AspectKey = "9-16" | "3-4" | "2-3" | "1-1";
type AspectOption = {
  key: AspectKey;
  ratio: string;
  label: string;
  subtitle: string;
  platformKey: string;
};

type StylePreset = {
  key: string;
  label: string;
  thumb: string;
};

type CustomStyle = {
  id: string;
  key: string;
  label: string;
  thumbUrl: string;
  createdAt: string;
};

function classNames(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

// ============================================================================
// Collapse (moved out of MinaApp)
// ============================================================================
const Collapse: React.FC<{
  open: boolean;
  delayMs?: number; // compatibility
  children: React.ReactNode;
}> = ({ open, delayMs = 0, children }) => {
  const innerRef = useRef<HTMLDivElement | null>(null);
  const [maxH, setMaxH] = useState<number>(open ? 1000 : 0);

  useLayoutEffect(() => {
    void delayMs;

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

// ============================================================================
// Props
// ============================================================================
type StudioLeftProps = {
  // layout / state
  globalDragging: boolean;
  showPills: boolean;
  showPanels: boolean;
  showControls: boolean;
  uiStage: 0 | 1 | 2 | 3;

  // brief
  brief: string;
  briefHintVisible: boolean;
  briefShellRef: React.RefObject<HTMLDivElement>;
  onBriefScroll: () => void;
  onBriefChange: (value: string) => void;
  briefFocused: boolean;
  setBriefFocused: (v: boolean) => void;

  // pills + panels
  activePanel: PanelKey;
  openPanel: (key: Exclude<PanelKey, null>) => void;
  pillInitialDelayMs: number;
  pillStaggerMs: number;
  panelRevealDelayMs: number;

  // aspect
  currentAspect: AspectOption;
  currentAspectIconUrl: string;
  onCycleAspect: () => void;

  // uploads
  uploads: Record<UploadPanelKey, UploadItem[]>;
  removeUploadItem: (panel: UploadPanelKey, id: string) => void;
  moveUploadItem: (panel: UploadPanelKey, from: number, to: number) => void;
  triggerPick: (panel: UploadPanelKey) => void;
  onFilesPicked: (panel: UploadPanelKey, files: FileList) => void;

  productInputRef: React.RefObject<HTMLInputElement>;
  logoInputRef: React.RefObject<HTMLInputElement>;
  inspirationInputRef: React.RefObject<HTMLInputElement>;

  // style
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

  // controls
  minaVisionEnabled: boolean;
  onToggleVision: () => void;

  canCreateStill: boolean;
  stillGenerating: boolean;
  stillError: string | null;
  onCreateStill: () => void;

  onGoProfile: () => void;
};

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

    uploads,
    removeUploadItem,
    moveUploadItem,
    triggerPick,
    onFilesPicked,

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
    canCreateStill,
    stillGenerating,
    stillError,
    onCreateStill,

    onGoProfile,
  } = props;

  // pills delays
  const pillBaseStyle = (index: number): React.CSSProperties => ({
    transitionDelay: showPills ? `${pillInitialDelayMs + index * pillStaggerMs}ms` : "0ms",
  });

  const plusOrTick = (n: number) => (n > 0 ? "✓" : "+");

  const productCount = uploads.product.length;
  const logoCount = uploads.logo.length;
  const inspirationCount = uploads.inspiration.length;

  const effectivePanel: PanelKey = uiStage === 0 ? null : (activePanel ?? "product");

  const allStyleCards: Array<{
    key: string;
    label: string;
    thumb: string;
    isCustom: boolean;
  }> = [
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

  // focus state drives hiding below textarea (no :has)
  const handleBriefFocus = () => setBriefFocused(true);
  const handleBriefBlur = () => setBriefFocused(false);

  // helper for file inputs
  const onFileInputChange = (panel: UploadPanelKey, e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length) onFilesPicked(panel, files);
    e.target.value = "";
  };

  return (
    <div
      className={classNames(
        "studio-left",
        globalDragging && "drag-active",
        briefFocused && "is-brief-focused"
      )}
    >
      <div className="studio-left-main">
        {/* Input 1 */}
        <div className="studio-input1-block">
          {/* Pills slot */}
          <div className="studio-pills-slot">
            <div className={classNames("studio-row", "studio-row--pills", "mina-slide", !showPills && "hidden")}>
              <button
                type="button"
                className={classNames("studio-pill", effectivePanel === "product" && "active")}
                style={pillBaseStyle(0)}
                onClick={() => openPanel("product")}
              >
                <span className="studio-pill-main">Product</span>
                <span aria-hidden="true">{plusOrTick(productCount)}</span>
              </button>

              <button
                type="button"
                className={classNames("studio-pill", effectivePanel === "logo" && "active")}
                style={pillBaseStyle(1)}
                onClick={() => openPanel("logo")}
              >
                <span className="studio-pill-main">Logo</span>
                <span aria-hidden="true">{plusOrTick(logoCount)}</span>
              </button>

              <button
                type="button"
                className={classNames("studio-pill", effectivePanel === "inspiration" && "active")}
                style={pillBaseStyle(2)}
                onClick={() => openPanel("inspiration")}
              >
                <span className="studio-pill-main">Inspiration</span>
                <span aria-hidden="true">{plusOrTick(inspirationCount)}</span>
              </button>

              <button
                type="button"
                className={classNames("studio-pill", effectivePanel === "style" && "active")}
                style={pillBaseStyle(3)}
                onClick={() => openPanel("style")}
              >
                <span className="studio-pill-main">Style</span>
                <span aria-hidden="true">✓</span>
              </button>

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
                className="studio-brief-input"
                placeholder="Describe how you want your still life image to look like"
                value={brief}
                onChange={(e) => onBriefChange(e.target.value)}
                onFocus={handleBriefFocus}
                onBlur={handleBriefBlur}
                rows={4}
              />
              {briefHintVisible && <div className="studio-brief-hint">Describe more</div>}
            </div>
          </div>
        </div>

        {/* Panels */}
        <div className="mina-slide">
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

          <Collapse open={showPanels && effectivePanel === "logo"} delayMs={panelRevealDelayMs}>
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

          <Collapse open={showPanels && effectivePanel === "inspiration"} delayMs={panelRevealDelayMs}>
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

          <Collapse open={showPanels && effectivePanel === "style"} delayMs={panelRevealDelayMs}>
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

                <button type="button" className={classNames("studio-style-card", "add")} onClick={onOpenCustomStylePanel}>
                  <div className="studio-style-thumb">
                    <span aria-hidden="true">+</span>
                  </div>
                  <div className="studio-style-label">Create style</div>
                </button>
              </div>
            </div>
          </Collapse>
        </div>

        {/* Controls */}
        <div className={classNames("mina-slide", !showControls && "hidden")}>
          <div className="studio-controls-divider" />

          <button type="button" className="studio-vision-toggle" onClick={onToggleVision}>
            Mina Vision Intelligence: <span className="studio-vision-state">{minaVisionEnabled ? "ON" : "OFF"}</span>
          </button>

          <div className="studio-create-block">
            <button
              type="button"
              className={classNames("studio-create-link", !canCreateStill && "disabled")}
              disabled={!canCreateStill}
              onClick={onCreateStill}
            >
              {stillGenerating ? "Creating…" : "Create"}
            </button>
          </div>

          {stillError && <div className="error-text">{stillError}</div>}
        </div>

        {/* Hidden file inputs */}
        <input
          ref={productInputRef}
          type="file"
          accept="image/*"
          style={{ display: "none" }}
          onChange={(e) => onFileInputChange("product", e)}
        />
        <input
          ref={logoInputRef}
          type="file"
          accept="image/*"
          style={{ display: "none" }}
          onChange={(e) => onFileInputChange("logo", e)}
        />
        <input
          ref={inspirationInputRef}
          type="file"
          accept="image/*"
          multiple
          style={{ display: "none" }}
          onChange={(e) => onFileInputChange("inspiration", e)}
        />
      </div>

      <button type="button" className="studio-profile-float" onClick={onGoProfile}>
        Profile
      </button>
    </div>
  );
};

export default StudioLeft;
