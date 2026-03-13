// src/StudioRight.tsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./StudioRight.css";

type StillItem = { id: string; url: string };
type MotionItem = { id: string; url: string };

// Fingertips modes
type FtMode = null | "toolbar" | "prompt" | "mask";
type FtModelKey = "remove_bg" | "upscale" | "expand" | "flux_fill" | "eraser" | "vectorize";

// Models that need a mask drawn before sending
const MASK_MODELS = new Set<FtModelKey>(["eraser", "flux_fill"]);
// Models that need a text prompt
const PROMPT_MODELS = new Set<FtModelKey>(["flux_fill"]);

type FingertipsResult = {
  generation_id: string;
  status: string;
  output_url?: string | null;
  output?: any;
  error?: string;
};

type StudioRightProps = {
  currentStill: StillItem | null;
  currentMotion: MotionItem | null;

  stillItems: StillItem[];
  stillIndex: number;
  setStillIndex: (i: number) => void;

  // TWEAK (was feedback)
  tweakText: string;
  setTweakText: (v: string) => void;
  onSendTweak: (text: string) => void;

  // ✅ NEW: recreate action (same behavior as Profile -> Recreate)
  onRecreate?: (args: { kind: "still" | "motion"; stillIndex: number }) => void;

  // ✅ NEW: set current generated still as Scene (fills Scene pill = assets.product on your wiring)
  // clearInspiration=true means: do NOT keep this image in inspiration/elements.
  onSetScene?: (args: { url: string; clearInspiration?: boolean }) => void;

  sending?: boolean;
  error?: string | null;

  // ✅ credit gate for tweak
  tweakCreditsOk?: boolean;
  tweakBlockReason?: string | null;

  // ✅ Fingertips
  onFingertipsGenerate?: (args: {
    modelKey: FtModelKey;
    inputs: Record<string, any>;
  }) => Promise<FingertipsResult | null>;
  fingertipsSending?: boolean;
  currentAspect?: string;

  // ✅ Like + Download (moved from header)
  onLike?: () => void;
  isLiked?: boolean;
  likeDisabled?: boolean;
  onDownload?: () => void;
  downloadDisabled?: boolean;

  // ✅ Create-mode drop zone (state 0)
  animateMode?: boolean;
  onDropUpload?: (file: File) => void;
  /** true while the right-panel upload is in flight */
  rightUploading?: boolean;
};

// ============================================================================
// PILL ANIMATION TIMING (matches StudioLeft pill timing)
// ============================================================================
const FT_INITIAL_DELAY = 260;
const FT_STAGGER = 90;

/**
 * StillImage — preloads the image fully before displaying it.
 * The browser decodes the entire image off-screen, then we set the src
 * so it paints in one frame (no progressive top-to-bottom scan).
 */
function StillImage({ url }: { url: string }) {
  const imgRef = useRef<HTMLImageElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setReady(false);
    if (!url) return;

    const img = new Image();
    img.src = url;

    // decode() ensures the image is fully rasterized before we reveal it
    const show = () => {
      if (imgRef.current) {
        imgRef.current.src = url;
        imgRef.current.classList.remove("studio-output-media--loading");
      }
      setReady(true);
    };

    if (typeof img.decode === "function") {
      img.decode().then(show).catch(show);
    } else {
      img.onload = show;
      img.onerror = show;
    }
  }, [url]);

  return (
    <img
      ref={imgRef}
      className={`studio-output-media${ready ? "" : " studio-output-media--loading"}`}
      // Start with empty src — no progressive rendering. Set by useEffect once decoded.
      src={ready ? url : ""}
      alt=""
      draggable={false}
      onDragStart={(e) => e.preventDefault()}
    />
  );
}

export default function StudioRight(props: StudioRightProps) {
  const {
    currentStill,
    currentMotion,
    stillItems,
    stillIndex,
    setStillIndex,
    tweakText,
    setTweakText,
    onSendTweak,
    onSetScene,
    sending,
    error,
    tweakCreditsOk,
    tweakBlockReason,
    onFingertipsGenerate,
    fingertipsSending,
    currentAspect,
    onLike,
    isLiked,
    likeDisabled,
    onDownload,
    downloadDisabled,
    animateMode,
    onDropUpload,
    rightUploading,
  } = props;

  const isEmpty = !currentStill && !currentMotion;

  // When a motion exists, we don't want to permanently "lock" the UI to video.
  // showMotion controls whether we currently display the video or the still carousel.
  const [showMotion, setShowMotion] = useState(false);

  // Default to video when a new motion arrives; user can switch back to stills via dots / swipe.
  useEffect(() => {
    setShowMotion(!!currentMotion);
  }, [currentMotion?.url]);

  const safeStillUrl = useMemo(() => {
    const clean = (u: any) => String(u || "").trim();

    const isInputAsset = (u: string) => /\/(product|logo|inspiration|style)\//i.test(u);
    const isReplicateTemp = (u: string) => /replicate\.delivery/i.test(u);

    const isGeneratedStill = (u: string) =>
      !!u &&
      !isReplicateTemp(u) &&
      !isInputAsset(u) &&
      (/\/mma\//i.test(u) || /\/generations\//i.test(u));

    const byIndex = clean(stillItems?.[stillIndex]?.url);
    const fromCurrent = clean(currentStill?.url);

    if (isGeneratedStill(byIndex)) return byIndex;
    if (isGeneratedStill(fromCurrent)) return fromCurrent;

    const best =
      stillItems?.map((it) => clean(it?.url)).find((u) => isGeneratedStill(u)) || "";

    if (best) return best;

    const fallback = byIndex || fromCurrent;
    if (fallback && !isReplicateTemp(fallback)) return fallback;

    return "";
  }, [stillItems, stillIndex, currentStill?.url]);

  const media = useMemo(() => {
    if (currentMotion && (showMotion || !safeStillUrl)) {
      return { type: "video" as const, url: currentMotion.url };
    }
    if (safeStillUrl) return { type: "image" as const, url: safeStillUrl };
    return null;
  }, [currentMotion, showMotion, safeStillUrl]);

  // Preload adjacent carousel images so swiping feels instant
  useEffect(() => {
    if (stillItems.length < 2) return;
    const n = stillItems.length;
    const indices = [(stillIndex - 1 + n) % n, (stillIndex + 1) % n];
    indices.forEach((i) => {
      const url = stillItems[i]?.url;
      if (url) {
        const img = new Image();
        img.src = url;
      }
    });
  }, [stillIndex, stillItems]);

  // ============================================================================
  // Swipe/drag handling (unchanged)
  // ============================================================================
  const suppressClickRef = useRef(false);
  const pointerRef = useRef({
    active: false,
    startX: 0,
    startY: 0,
    pointerId: null as number | null,
  });
  const wheelRef = useRef({ acc: 0, lastT: 0 });
  const WHEEL_TRIGGER = 60;

  const SWIPE_PX = 44;
  const SWIPE_SLOPE = 1.2;

  const [containMode, setContainMode] = useState(false);

  useEffect(() => {
    setContainMode(false);
  }, [media?.url]);

  const hasStills = stillItems.length > 0;
  const hasStillCarousel = stillItems.length > 1;

  const goPrev = () => {
    if (!hasStills) return;
    if (showMotion) setShowMotion(false);
    if (!hasStillCarousel) return;
    const n = stillItems.length;
    setStillIndex((stillIndex - 1 + n) % n);
  };

  const goNext = () => {
    if (!hasStills) return;
    if (showMotion) setShowMotion(false);
    if (!hasStillCarousel) return;
    const n = stillItems.length;
    setStillIndex((stillIndex + 1) % n);
  };

  // ============================================================================
  // FINGERTIPS STATE
  // ============================================================================
  const [ftMode, setFtMode] = useState<FtMode>(null);
  const [ftActiveModel, setFtActiveModel] = useState<FtModelKey | null>(null);
  const [ftPrompt, setFtPrompt] = useState("");
  const [ftError, setFtError] = useState<string | null>(null);
  const [ftBtnVisible, setFtBtnVisible] = useState(false);
  const [ftProcessing, setFtProcessing] = useState(false);

  // Mask state
  const maskCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const maskCursorRef = useRef<HTMLDivElement | null>(null);
  const [maskDrawing, setMaskDrawing] = useState(false);
  const maskLastPosRef = useRef<{ x: number; y: number } | null>(null);
  const maskOverlayRef = useRef<HTMLDivElement | null>(null);
  const maskZoomRef = useRef({ scale: 1, x: 0, y: 0 });

  // Exit fingertips
  const exitFingertips = useCallback(() => {
    setFtMode(null);
    setFtActiveModel(null);
    setFtPrompt("");
    setFtError(null);
    setFtBtnVisible(false);
    setFtProcessing(false);
  }, []);

  // Stagger buttons in on toolbar show
  useEffect(() => {
    if (ftMode === "toolbar" || ftMode === "prompt" || ftMode === "mask") {
      const t = setTimeout(() => setFtBtnVisible(true), 50);
      return () => clearTimeout(t);
    } else {
      setFtBtnVisible(false);
    }
  }, [ftMode]);

  // ============================================================================
  // DOUBLE-CLICK → enter fingertips (only on image, not video)
  // ============================================================================
  const lastClickRef = useRef<number>(0);

  const handleFrameClick: React.MouseEventHandler<HTMLButtonElement> = (e) => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }

    // If we're in mask mode, don't handle navigation clicks
    if (ftMode === "mask") return;

    if (!media) return;

    const now = Date.now();
    const delta = now - lastClickRef.current;
    lastClickRef.current = now;

    // Double-click detection (< 400ms between clicks) — only on images
    if (delta < 400 && media.type === "image" && !ftMode) {
      setContainMode(true); // squeeze/contain the image
      setFtMode("toolbar");
      return;
    }

    const target = e.currentTarget;
    const rect = target.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const pct = rect.width > 0 ? x / rect.width : 0.5;

    const EDGE = 0.18;

    if (hasStills && pct <= EDGE) return goPrev();
    if (hasStills && pct >= 1 - EDGE) return goNext();

    setContainMode((v) => !v);
  };

  const onPointerDown: React.PointerEventHandler<HTMLButtonElement> = (e) => {
    if (!media) return;
    pointerRef.current.active = true;
    pointerRef.current.startX = e.clientX;
    pointerRef.current.startY = e.clientY;
    pointerRef.current.pointerId = e.pointerId;

    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // ignore
    }
  };

  const onPointerMove: React.PointerEventHandler<HTMLButtonElement> = (e) => {
    const st = pointerRef.current;
    if (!st.active) return;

    const dx = e.clientX - st.startX;
    const dy = e.clientY - st.startY;

    if (Math.abs(dx) < SWIPE_PX) return;
    if (Math.abs(dx) < Math.abs(dy) * SWIPE_SLOPE) return;

    st.active = false;
    suppressClickRef.current = true;

    if (dx > 0) goPrev();
    else goNext();
  };

  const onPointerEnd: React.PointerEventHandler<HTMLButtonElement> = (e) => {
    const st = pointerRef.current;
    st.active = false;

    if (st.pointerId != null) {
      try {
        e.currentTarget.releasePointerCapture(st.pointerId);
      } catch {
        // ignore
      }
    }
    st.pointerId = null;
  };

  const onWheel: React.WheelEventHandler<HTMLButtonElement> = (e) => {
    if (!hasStills) return;

    const dx = e.deltaX;
    const dy = e.deltaY;

    if (Math.abs(dx) < 8) return;
    if (Math.abs(dx) < Math.abs(dy) * 1.1) return;

    const now = performance.now();
    const dt = now - wheelRef.current.lastT;
    wheelRef.current.lastT = now;

    if (dt > 120) wheelRef.current.acc = 0;
    wheelRef.current.acc += dx;

    if (Math.abs(wheelRef.current.acc) < WHEEL_TRIGGER) return;

    e.preventDefault();
    suppressClickRef.current = true;

    if (wheelRef.current.acc > 0) goNext();
    else goPrev();

    wheelRef.current.acc = 0;
  };

  // ============================================================================
  // MASK DRAWING (for eraser + flux_fill)
  // ============================================================================
  const initMaskCanvas = useCallback(() => {
    const canvas = maskCanvasRef.current;
    if (!canvas) return;
    const parent = canvas.parentElement;
    if (!parent) return;

    canvas.width = parent.clientWidth;
    canvas.height = parent.clientHeight;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Reset zoom
    maskZoomRef.current = { scale: 1, x: 0, y: 0 };
    applyMaskZoom();
  }, []);

  const applyMaskZoom = useCallback(() => {
    const { scale, x, y } = maskZoomRef.current;
    const transform = `translate(${x}px, ${y}px) scale(${scale})`;
    const underlay = maskOverlayRef.current?.querySelector(".ft-mask-underlay") as HTMLElement | null;
    const canvas = maskCanvasRef.current;
    if (underlay) underlay.style.transform = transform;
    if (canvas) canvas.style.transform = transform;
  }, []);

  useEffect(() => {
    if (ftMode === "mask") {
      // Small delay for DOM to render
      const t = setTimeout(initMaskCanvas, 50);
      return () => clearTimeout(t);
    }
  }, [ftMode, initMaskCanvas]);

  const drawOnMask = useCallback((x: number, y: number, isStart: boolean) => {
    const canvas = maskCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Account for zoom transform when computing canvas coordinates
    const overlay = maskOverlayRef.current;
    if (!overlay) return;
    const rect = overlay.getBoundingClientRect();
    const z = maskZoomRef.current;
    // Convert screen coords to unscaled canvas coords
    const cx = ((x - rect.left - z.x) / z.scale / overlay.clientWidth) * canvas.width;
    const cy = ((y - rect.top - z.y) / z.scale / overlay.clientHeight) * canvas.height;

    const radius = 20 / z.scale; // Scale-independent brush size

    if (isStart) {
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(80, 130, 255, 0.35)";
      ctx.fill();
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = "rgba(80, 130, 255, 0.6)";
      ctx.lineWidth = 1.5 / z.scale;
      ctx.stroke();
      ctx.setLineDash([]);
    } else {
      const last = maskLastPosRef.current;
      if (last) {
        ctx.beginPath();
        ctx.moveTo(last.x, last.y);
        ctx.lineTo(cx, cy);
        ctx.strokeStyle = "rgba(80, 130, 255, 0.35)";
        ctx.lineWidth = radius * 2;
        ctx.lineCap = "round";
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.setLineDash([4, 4]);
        ctx.strokeStyle = "rgba(80, 130, 255, 0.6)";
        ctx.lineWidth = 1.5 / z.scale;
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    maskLastPosRef.current = { x: cx, y: cy };
  }, []);

  const handleMaskPointerDown = useCallback((e: React.PointerEvent) => {
    setMaskDrawing(true);
    drawOnMask(e.clientX, e.clientY, true);
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  }, [drawOnMask]);

  const handleMaskPointerMove = useCallback((e: React.PointerEvent) => {
    // Update custom cursor position
    if (maskCursorRef.current) {
      maskCursorRef.current.style.left = `${e.clientX}px`;
      maskCursorRef.current.style.top = `${e.clientY}px`;
    }

    if (!maskDrawing) return;
    drawOnMask(e.clientX, e.clientY, false);
  }, [maskDrawing, drawOnMask]);

  const handleMaskPointerUp = useCallback(() => {
    setMaskDrawing(false);
    maskLastPosRef.current = null;
  }, []);

  // Extract mask as a black image with white selection for the API
  const extractMaskDataUrl = useCallback((): string | null => {
    const canvas = maskCanvasRef.current;
    if (!canvas) return null;

    const w = canvas.width;
    const h = canvas.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    // Read the drawn pixels
    const imageData = ctx.getImageData(0, 0, w, h);
    const pixels = imageData.data;

    // Create a new canvas for the black/white mask
    const maskCanvas = document.createElement("canvas");
    maskCanvas.width = w;
    maskCanvas.height = h;
    const maskCtx = maskCanvas.getContext("2d")!;

    // Fill black
    maskCtx.fillStyle = "#000000";
    maskCtx.fillRect(0, 0, w, h);

    // Where we drew (any non-zero alpha), paint white
    const maskData = maskCtx.getImageData(0, 0, w, h);
    const mp = maskData.data;
    for (let i = 0; i < pixels.length; i += 4) {
      if (pixels[i + 3] > 10) {
        // Any drawn pixel
        mp[i] = 255;
        mp[i + 1] = 255;
        mp[i + 2] = 255;
        mp[i + 3] = 255;
      }
    }
    maskCtx.putImageData(maskData, 0, 0);

    return maskCanvas.toDataURL("image/png");
  }, []);

  // ============================================================================
  // FINGERTIPS ACTIONS
  // ============================================================================
  const handleFtModel = useCallback(async (modelKey: FtModelKey) => {
    if (!onFingertipsGenerate || !safeStillUrl) return;

    setFtActiveModel(modelKey);
    setFtError(null);

    // Models that need a mask → enter mask mode
    if (MASK_MODELS.has(modelKey)) {
      setFtMode("mask");
      return;
    }

    // Models that need a prompt → enter prompt mode
    if (PROMPT_MODELS.has(modelKey)) {
      setFtMode("prompt");
      return;
    }

    // Direct execution models (no extra input needed)
    setFtProcessing(true);
    try {
      let inputs: Record<string, any> = { image: safeStillUrl };

      if (modelKey === "upscale") {
        // crystal-upscaler: send original image, scale_factor 2
        inputs.image = safeStillUrl;
        inputs.scale_factor = 2;
      } else if (modelKey === "expand") {
        inputs.image = safeStillUrl;

        // Detect actual image dimensions to determine real current aspect ratio
        // (avoids stale currentAspect after previous expand)
        let realAspect = currentAspect || "9:16";
        try {
          const dims = await new Promise<{ w: number; h: number }>((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
            img.onerror = reject;
            img.src = safeStillUrl;
          });
          const ratio = dims.w / dims.h;
          // Map to nearest standard ratio
          if (Math.abs(ratio - 9 / 16) < 0.08) realAspect = "9:16";
          else if (Math.abs(ratio - 16 / 9) < 0.08) realAspect = "16:9";
          else if (Math.abs(ratio - 3 / 4) < 0.08) realAspect = "3:4";
          else if (Math.abs(ratio - 4 / 3) < 0.08) realAspect = "4:3";
          else if (Math.abs(ratio - 2 / 3) < 0.08) realAspect = "2:3";
          else if (Math.abs(ratio - 3 / 2) < 0.08) realAspect = "3:2";
          else if (Math.abs(ratio - 1) < 0.08) realAspect = "1:1";
          // else keep currentAspect fallback
        } catch {
          // fallback to currentAspect
        }

        // Expand: grow canvas by ~40% in the shorter dimension
        // Use canvas_size approach for reliable repeated expansions
        const aspect = realAspect;
        if (aspect === "9:16" || aspect === "9_16") {
          inputs.aspect_ratio = "16:9";
        } else if (aspect === "16:9" || aspect === "16_9") {
          inputs.aspect_ratio = "9:16";
        } else if (aspect === "3:4" || aspect === "3_4") {
          inputs.aspect_ratio = "4:3";
        } else if (aspect === "4:3" || aspect === "4_3") {
          inputs.aspect_ratio = "3:4";
        } else if (aspect === "2:3" || aspect === "2_3") {
          inputs.aspect_ratio = "3:2";
        } else if (aspect === "3:2" || aspect === "3_2") {
          inputs.aspect_ratio = "2:3";
        } else {
          // 1:1 or unknown → expand to 4:3
          inputs.aspect_ratio = "4:3";
        }
      }

      const result = await onFingertipsGenerate({ modelKey, inputs });
      if (result?.output_url || result?.output) {
        exitFingertips();
      } else if (result?.error) {
        setFtError(result.error);
      }
    } catch (err: any) {
      setFtError(err?.message || "Generation failed");
    } finally {
      setFtProcessing(false);
    }
  }, [onFingertipsGenerate, safeStillUrl, currentAspect, exitFingertips]);

  // Send mask-based model (eraser / flux_fill)
  const handleMaskSubmit = useCallback(async () => {
    if (!onFingertipsGenerate || !safeStillUrl || !ftActiveModel) return;

    const maskDataUrl = extractMaskDataUrl();
    if (!maskDataUrl) {
      setFtError("Draw a selection on the image first");
      return;
    }

    setFtProcessing(true);
    setFtError(null);

    try {
      const inputs: Record<string, any> = { image: safeStillUrl };

      if (ftActiveModel === "eraser") {
        inputs.mask_image = maskDataUrl;
      } else if (ftActiveModel === "flux_fill") {
        inputs.mask = maskDataUrl;
        inputs.prompt = ftPrompt || "";
      }

      const result = await onFingertipsGenerate({ modelKey: ftActiveModel, inputs });
      if (result?.output_url || result?.output) {
        exitFingertips();
      } else if (result?.error) {
        setFtError(result.error);
      }
    } catch (err: any) {
      setFtError(err?.message || "Generation failed");
    } finally {
      setFtProcessing(false);
    }
  }, [onFingertipsGenerate, safeStillUrl, ftActiveModel, ftPrompt, extractMaskDataUrl, exitFingertips]);

  // Send prompt-based model (flux_fill needs mask too, so from mask mode we go to prompt)
  const handlePromptSubmit = useCallback(async () => {
    if (!onFingertipsGenerate || !safeStillUrl || !ftActiveModel) return;

    // For flux_fill: after typing prompt, enter mask mode
    if (MASK_MODELS.has(ftActiveModel)) {
      setFtMode("mask");
      return;
    }

    setFtProcessing(true);
    setFtError(null);

    try {
      const inputs: Record<string, any> = { image: safeStillUrl, prompt: ftPrompt };
      const result = await onFingertipsGenerate({ modelKey: ftActiveModel, inputs });
      if (result?.output_url || result?.output) {
        exitFingertips();
      } else if (result?.error) {
        setFtError(result.error);
      }
    } catch (err: any) {
      setFtError(err?.message || "Generation failed");
    } finally {
      setFtProcessing(false);
    }
  }, [onFingertipsGenerate, safeStillUrl, ftActiveModel, ftPrompt, exitFingertips]);

  // flux_fill special flow: toolbar → prompt input → mask drawing → submit
  const handleFluxFill = useCallback(() => {
    setFtActiveModel("flux_fill");
    setFtError(null);
    setFtPrompt("");
    setFtMode("prompt");
  }, []);

  // ============================================================================
  // TWEAK BAR STATE
  // ============================================================================
  const trimmed = (tweakText || "").trim();
  const creditsOk = tweakCreditsOk !== false;
  const blockMsg = (tweakBlockReason || "Get more matchas to tweak.").trim();
  const canSend = !isEmpty && !!trimmed && !sending && creditsOk;

  const sendNow = () => {
    if (!canSend) return;
    onSendTweak(trimmed);
  };

  const isImage = media?.type === "image";
  const isBusy = !!sending || !!fingertipsSending || ftProcessing;

  // ============================================================================
  // UPLOAD BUTTON (Create mode, state 0)
  // ============================================================================
  const fileInputRef = useRef<HTMLInputElement>(null);

  const onFileInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        const t = (file.type || "").toLowerCase();
        if (t.startsWith("image/")) onDropUpload?.(file);
      }
      if (fileInputRef.current) fileInputRef.current.value = "";
    },
    [onDropUpload]
  );

  const showUploadBtn = isEmpty && !animateMode && !!onDropUpload;

  // ============================================================================
  // RENDER
  // ============================================================================
  return (
    <div className="studio-right">
      <div className="studio-right-surface">
        {isEmpty ? (
          showUploadBtn ? (
            <>
              <button
                type="button"
                className={`studio-upload-btn${rightUploading ? " studio-upload-btn--loading" : ""}`}
                disabled={!!rightUploading}
                onClick={() => fileInputRef.current?.click()}
              >
                {rightUploading ? "Uploading…" : "+ Upload image to edit"}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                style={{ display: "none" }}
                onChange={onFileInputChange}
              />
            </>
          ) : (
            <div className="studio-empty-text">New ideas don't exist, just recycle.</div>
          )
        ) : (
          <>
            <button
              type="button"
              className="studio-output-click"
              onClick={handleFrameClick}
              onPointerDown={ftMode === "mask" ? undefined : onPointerDown}
              onPointerMove={ftMode === "mask" ? undefined : onPointerMove}
              onPointerUp={ftMode === "mask" ? undefined : onPointerEnd}
              onPointerCancel={ftMode === "mask" ? undefined : onPointerEnd}
              onWheel={ftMode === "mask" ? undefined : onWheel}
              aria-label="Toggle zoom / Navigate / Swipe"
            >
              <div className={`studio-output-frame ${containMode ? "is-contain" : ""}`}>
                {media?.type === "video" ? (
                  <video
                    key={media.url}
                    className="studio-output-media"
                    src={media.url}
                    autoPlay
                    loop
                    muted
                    controls
                    draggable={false}
                    onDragStart={(e) => e.preventDefault()}
                  />
                ) : (
                  <StillImage key={media.url} url={media?.url || ""} />
                )}
              </div>
            </button>

            {/* MASK OVERLAY — Canva-style: full opacity image, scroll/pinch to zoom, click to draw */}
            {ftMode === "mask" && safeStillUrl && (
              <div
                className="ft-mask-overlay"
                ref={maskOverlayRef}
                onWheel={(e) => {
                  e.preventDefault();
                  const z = maskZoomRef.current;
                  const delta = e.deltaY > 0 ? 0.9 : 1.1;
                  const newScale = Math.max(0.5, Math.min(5, z.scale * delta));

                  // Zoom toward cursor position
                  const rect = maskOverlayRef.current!.getBoundingClientRect();
                  const mx = e.clientX - rect.left;
                  const my = e.clientY - rect.top;
                  z.x = mx - (mx - z.x) * (newScale / z.scale);
                  z.y = my - (my - z.y) * (newScale / z.scale);
                  z.scale = newScale;
                  applyMaskZoom();
                }}
              >
                <img
                  className="ft-mask-underlay"
                  src={safeStillUrl}
                  alt=""
                  draggable={false}
                />
                <canvas
                  ref={maskCanvasRef}
                  className="ft-mask-canvas"
                  onPointerDown={handleMaskPointerDown}
                  onPointerMove={handleMaskPointerMove}
                  onPointerUp={handleMaskPointerUp}
                  onPointerCancel={handleMaskPointerUp}
                />
                <div ref={maskCursorRef} className="ft-mask-cursor" />
              </div>
            )}

            {hasStills && (hasStillCarousel || !!currentMotion) && !ftMode && (
              <div className="studio-dots-row" aria-label="Media carousel">
                {currentMotion && (
                  <button
                    type="button"
                    className={`studio-dot ${showMotion ? "active" : ""} is-video`}
                    onClick={() => setShowMotion(true)}
                    aria-label="Show video"
                    title="Video"
                  />
                )}

                {stillItems.map((item, idx) => (
                  <button
                    key={item.id}
                    type="button"
                    className={`studio-dot ${!showMotion && idx === stillIndex ? "active" : ""}`}
                    onClick={() => {
                      setShowMotion(false);
                      setStillIndex(idx);
                    }}
                    aria-label={`Go to image ${idx + 1}`}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* ============================================================================
          BOTTOM BAR — switches between normal tweak bar and fingertips toolbar
          ============================================================================ */}

      {/* NORMAL TWEAK BAR (shown when NOT in fingertips mode) */}
      {!isEmpty && !ftMode && (
        <div className="studio-feedback-bar">
          <input
            className="studio-feedback-input--compact"
            placeholder="Double click or type to edit "
            value={tweakText}
            onChange={(e) => setTweakText(e.target.value)}
            disabled={!!sending || !creditsOk}
            onKeyDown={(e) => {
              if (e.key === "Enter" && canSend) sendNow();
            }}
          />

          <div className="studio-feedback-actions">
            <button
              type="button"
              className="studio-action-btn"
              onClick={() => {
                if (!safeStillUrl) return;
                onSetScene?.({ url: safeStillUrl, clearInspiration: true });
              }}
              disabled={isEmpty || !!sending || !onSetScene || !safeStillUrl}
              title={!onSetScene ? "Set Scene not available" : undefined}
            >
              Set Scene
            </button>

            <span className="studio-action-separator" aria-hidden="true">
              |
            </span>

            <button
              type="button"
              className={`studio-action-btn${isLiked ? " is-on" : ""}`}
              onClick={() => onLike?.()}
              disabled={isEmpty || likeDisabled}
            >
              {isLiked ? "Liked" : "Like"}
            </button>

            <span className="studio-action-separator" aria-hidden="true">
              |
            </span>

            <button
              type="button"
              className="studio-action-btn"
              onClick={() => onDownload?.()}
              disabled={isEmpty || downloadDisabled}
            >
              Download
            </button>

            <span className="studio-action-separator" aria-hidden="true">
              |
            </span>

            <button
              type="button"
              className="studio-action-btn"
              onClick={sendNow}
              disabled={!canSend}
              title={!creditsOk ? blockMsg : undefined}
            >
              {sending ? "Tweaking…" : "Tweak"}
            </button>
          </div>

          {!creditsOk && <div className="studio-feedback-error">{blockMsg}</div>}
          {!!error && <div className="studio-feedback-error">{error}</div>}
        </div>
      )}

      {/* FINGERTIPS TOOLBAR (shown on double-click) */}
      {!isEmpty && ftMode === "toolbar" && (
        <div className="studio-fingertips-bar">
          {([
            { key: "remove_bg" as FtModelKey, label: "Remove BG", sep: false },
            { key: "upscale" as FtModelKey, label: "Enhance", sep: false },
            { key: "expand" as FtModelKey, label: "Expand", sep: false },
            { key: "vectorize" as FtModelKey, label: "Vectorize", sep: false },
            { key: "flux_fill" as FtModelKey, label: "Draw", sep: true },
            { key: "eraser" as FtModelKey, label: "Erase", sep: false },
          ]).map((item, idx) => (
            <React.Fragment key={item.key}>
              {item.sep && (
                <span
                  className={`ft-btn-separator ${ftBtnVisible ? "is-visible" : ""}`}
                  style={{ transitionDelay: ftBtnVisible ? `${FT_INITIAL_DELAY + idx * FT_STAGGER}ms` : "0ms" }}
                  aria-hidden="true"
                >|</span>
              )}
              <button
                type="button"
                className={`ft-btn ${ftBtnVisible ? "is-visible" : ""}`}
                style={{ transitionDelay: ftBtnVisible ? `${FT_INITIAL_DELAY + idx * FT_STAGGER}ms` : "0ms" }}
                onClick={() => {
                  if (item.key === "flux_fill") {
                    handleFluxFill();
                  } else {
                    handleFtModel(item.key);
                  }
                }}
                disabled={isBusy}
              >
                {ftProcessing && ftActiveModel === item.key ? "Processing…" : item.label}
              </button>
            </React.Fragment>
          ))}

          <span style={{ flex: "1 1 auto" }} />

          <button
            type="button"
            className={`ft-btn ${ftBtnVisible ? "is-visible" : ""}`}
            style={{ transitionDelay: ftBtnVisible ? `${FT_INITIAL_DELAY + 6 * FT_STAGGER}ms` : "0ms" }}
            onClick={exitFingertips}
          >
            Back
          </button>

          {ftError && <div className="ft-error">{ftError}</div>}
        </div>
      )}

      {/* FINGERTIPS PROMPT MODE (for Fill Gen — type prompt, then draw mask) */}
      {!isEmpty && ftMode === "prompt" && (
        <div className="studio-fingertips-bar">
          <button
            type="button"
            className={`ft-btn ${ftBtnVisible ? "is-visible" : ""}`}
            style={{ transitionDelay: ftBtnVisible ? `${FT_INITIAL_DELAY}ms` : "0ms" }}
            onClick={() => {
              setFtMode("toolbar");
              setFtActiveModel(null);
              setFtPrompt("");
            }}
          >
            Back
          </button>

          <input
            className={`ft-prompt-input ${ftBtnVisible ? "is-visible" : ""}`}
            style={{ transitionDelay: ftBtnVisible ? `${FT_INITIAL_DELAY + FT_STAGGER}ms` : "0ms" }}
            placeholder="Describe what to generate in the selection…"
            value={ftPrompt}
            onChange={(e) => setFtPrompt(e.target.value)}
            disabled={isBusy}
            onKeyDown={(e) => {
              if (e.key === "Enter" && ftPrompt.trim()) handlePromptSubmit();
            }}
            autoFocus
          />

          <button
            type="button"
            className={`ft-btn is-underline ${ftBtnVisible ? "is-visible" : ""}`}
            style={{ transitionDelay: ftBtnVisible ? `${FT_INITIAL_DELAY + 2 * FT_STAGGER}ms` : "0ms" }}
            onClick={handlePromptSubmit}
            disabled={isBusy || !ftPrompt.trim()}
          >
            {ftProcessing ? "Processing…" : "Tweak"}
          </button>

          {ftError && <div className="ft-error">{ftError}</div>}
        </div>
      )}

      {/* FINGERTIPS MASK MODE (draw selection, then submit) */}
      {!isEmpty && ftMode === "mask" && (
        <div className="studio-fingertips-bar">
          <button
            type="button"
            className={`ft-btn ${ftBtnVisible ? "is-visible" : ""}`}
            style={{ transitionDelay: ftBtnVisible ? `${FT_INITIAL_DELAY}ms` : "0ms" }}
            onClick={() => {
              if (ftActiveModel === "flux_fill") {
                setFtMode("prompt");
              } else {
                setFtMode("toolbar");
                setFtActiveModel(null);
              }
            }}
          >
            Back
          </button>

          <span
            className={`ft-btn ${ftBtnVisible ? "is-visible" : ""}`}
            style={{
              transitionDelay: ftBtnVisible ? `${FT_INITIAL_DELAY + FT_STAGGER}ms` : "0ms",
              cursor: "default",
              opacity: ftBtnVisible ? 0.5 : 0,
            }}
          >
            Draw on the area to {ftActiveModel === "eraser" ? "erase" : "fill"}
          </span>

          <span style={{ flex: "1 1 auto" }} />

          <button
            type="button"
            className={`ft-btn is-underline ${ftBtnVisible ? "is-visible" : ""}`}
            style={{ transitionDelay: ftBtnVisible ? `${FT_INITIAL_DELAY + 2 * FT_STAGGER}ms` : "0ms" }}
            onClick={handleMaskSubmit}
            disabled={isBusy}
          >
            {ftProcessing ? "Processing…" : "Apply"}
          </button>

          {ftError && <div className="ft-error">{ftError}</div>}
        </div>
      )}
    </div>
  );
}
