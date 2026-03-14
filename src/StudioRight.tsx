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
  const [maskPanning, setMaskPanning] = useState(false);
  const maskPanStartRef = useRef<{ x: number; y: number; zx: number; zy: number } | null>(null);

  // Exit fingertips
  const exitFingertips = useCallback(() => {
    setFtMode(null);
    setFtActiveModel(null);
    setFtPrompt("");
    setFtError(null);
    setFtBtnVisible(false);
    setFtProcessing(false);
    setEraseAnimating(false);
    setCursorInZone(false);
    lassoPointsRef.current = [];
    closedPathRef.current = null;
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
  // MASK DRAWING — Lasso/path selection tool
  // ============================================================================
  // Store real image dimensions so the mask matches the source image pixel-for-pixel
  const maskImgDimsRef = useRef<{ w: number; h: number }>({ w: 0, h: 0 });
  // Lasso path points (in overlay-space coordinates)
  const lassoPointsRef = useRef<{ x: number; y: number }[]>([]);
  // Single closed path (only ONE contour allowed)
  const closedPathRef = useRef<{ x: number; y: number }[] | null>(null);
  // SVG overlay ref for rendering the lasso path
  const lassoSvgRef = useRef<SVGSVGElement | null>(null);
  // Marching ants animation ref
  const marchingAntsRef = useRef<number | null>(null);
  // Erase animation state
  const [eraseAnimating, setEraseAnimating] = useState(false);
  // SVG path data for the erase animation clip
  const eraseClipPathRef = useRef<string>("");
  // Cursor visibility state
  const [cursorInZone, setCursorInZone] = useState(false);

  // Smooth a set of raw points into a nice curved/angular path using Catmull-Rom
  const smoothPoints = useCallback((pts: { x: number; y: number }[], tension = 0.4): { x: number; y: number }[] => {
    if (pts.length < 3) return pts;
    const result: { x: number; y: number }[] = [];
    for (let i = 0; i < pts.length; i++) {
      const p0 = pts[(i - 1 + pts.length) % pts.length];
      const p1 = pts[i];
      const p2 = pts[(i + 1) % pts.length];
      const p3 = pts[(i + 2) % pts.length];
      const segments = 6;
      for (let t = 0; t < segments; t++) {
        const s = t / segments;
        const s2 = s * s;
        const s3 = s2 * s;
        const x = 0.5 * ((2 * p1.x) + (-p0.x + p2.x) * s * tension +
          (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * s2 * tension +
          (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * s3 * tension);
        const y = 0.5 * ((2 * p1.y) + (-p0.y + p2.y) * s * tension +
          (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * s2 * tension +
          (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * s3 * tension);
        result.push({ x, y });
      }
    }
    return result;
  }, []);

  // Simplify points by removing those too close together (Douglas-Peucker lite)
  const simplifyPoints = useCallback((pts: { x: number; y: number }[], minDist = 4): { x: number; y: number }[] => {
    if (pts.length < 2) return pts;
    const result = [pts[0]];
    for (let i = 1; i < pts.length; i++) {
      const last = result[result.length - 1];
      const dx = pts[i].x - last.x;
      const dy = pts[i].y - last.y;
      if (dx * dx + dy * dy >= minDist * minDist) result.push(pts[i]);
    }
    return result;
  }, []);

  // Convert screen coordinates to image-space coordinates
  const screenToImageCoords = useCallback((clientX: number, clientY: number): { x: number; y: number } | null => {
    const overlay = maskOverlayRef.current;
    if (!overlay) return null;
    const rect = overlay.getBoundingClientRect();
    const z = maskZoomRef.current;
    const x = (clientX - rect.left - z.x) / z.scale;
    const y = (clientY - rect.top - z.y) / z.scale;
    return { x, y };
  }, []);

  // Build SVG path data from points (in % of overlay)
  const buildSvgPath = useCallback((pts: { x: number; y: number }[], closed: boolean): string => {
    if (pts.length < 2) return "";
    const smoothed = smoothPoints(simplifyPoints(pts, 3));
    if (smoothed.length < 2) return "";
    let d = `M ${smoothed[0].x} ${smoothed[0].y}`;
    for (let i = 1; i < smoothed.length; i++) {
      d += ` L ${smoothed[i].x} ${smoothed[i].y}`;
    }
    if (closed) d += " Z";
    return d;
  }, [smoothPoints, simplifyPoints]);

  // Render lasso path into the SVG overlay — shows fill WHILE drawing
  const renderLassoPaths = useCallback(() => {
    const svg = lassoSvgRef.current;
    if (!svg) return;

    const existing = svg.querySelectorAll(".lasso-path-group");
    existing.forEach((el) => el.remove());

    const overlay = maskOverlayRef.current;
    if (!overlay) return;

    // Render closed path (completed)
    const closed = closedPathRef.current;
    if (closed && closed.length > 2) {
      const d = buildSvgPath(closed, true);
      if (d) {
        const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
        g.classList.add("lasso-path-group");

        const fill = document.createElementNS("http://www.w3.org/2000/svg", "path");
        fill.setAttribute("d", d);
        fill.setAttribute("class", "lasso-fill");
        g.appendChild(fill);

        const stroke = document.createElementNS("http://www.w3.org/2000/svg", "path");
        stroke.setAttribute("d", d);
        stroke.setAttribute("class", "lasso-stroke");
        g.appendChild(stroke);

        svg.appendChild(g);
      }
    }

    // Render current drawing path — always show fill (closed) so user sees the area
    const currentPoints = lassoPointsRef.current;
    if (currentPoints.length > 1) {
      const isClosed = currentPoints.length >= 3;
      const d = buildSvgPath(currentPoints, isClosed);
      if (d) {
        const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
        g.classList.add("lasso-path-group");

        // Show fill while drawing so user can see the selected area
        if (isClosed) {
          const fill = document.createElementNS("http://www.w3.org/2000/svg", "path");
          fill.setAttribute("d", d);
          fill.setAttribute("class", "lasso-fill");
          g.appendChild(fill);
        }

        const stroke = document.createElementNS("http://www.w3.org/2000/svg", "path");
        stroke.setAttribute("d", d);
        stroke.setAttribute("class", "lasso-stroke lasso-stroke--drawing");
        g.appendChild(stroke);

        svg.appendChild(g);
      }
    }
  }, [buildSvgPath]);

  const initMaskCanvas = useCallback(() => {
    const canvas = maskCanvasRef.current;
    if (!canvas) return;

    // Load real image dimensions
    if (safeStillUrl) {
      const img = new Image();
      img.onload = () => {
        maskImgDimsRef.current = { w: img.naturalWidth, h: img.naturalHeight };
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext("2d");
        if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
      };
      img.onerror = () => {
        const parent = canvas.parentElement;
        if (!parent) return;
        canvas.width = parent.clientWidth;
        canvas.height = parent.clientHeight;
        maskImgDimsRef.current = { w: canvas.width, h: canvas.height };
      };
      img.src = safeStillUrl;
    }

    // Reset zoom and lasso state
    maskZoomRef.current = { scale: 1, x: 0, y: 0 };
    lassoPointsRef.current = [];
    closedPathRef.current = null;
    applyMaskZoom();
  }, [safeStillUrl]);

  const applyMaskZoom = useCallback(() => {
    const { scale, x, y } = maskZoomRef.current;
    const transform = `translate(${x}px, ${y}px) scale(${scale})`;
    const underlay = maskOverlayRef.current?.querySelector(".ft-mask-underlay") as HTMLElement | null;
    const canvas = maskCanvasRef.current;
    const svg = lassoSvgRef.current;
    const eraseSvg = maskOverlayRef.current?.querySelector(".ft-erase-svg") as HTMLElement | null;
    if (underlay) underlay.style.transform = transform;
    if (canvas) canvas.style.transform = transform;
    if (svg) svg.style.transform = transform;
    if (eraseSvg) eraseSvg.style.transform = transform;
  }, []);

  useEffect(() => {
    if (ftMode === "mask") {
      const t = setTimeout(initMaskCanvas, 50);
      return () => clearTimeout(t);
    }
  }, [ftMode, initMaskCanvas]);

  // Prevent page scroll/zoom when mask overlay is active (native listener with passive: false)
  useEffect(() => {
    if (ftMode !== "mask") return;
    const overlay = maskOverlayRef.current;
    if (!overlay) return;
    const wheelHandler = (e: WheelEvent) => { e.preventDefault(); };
    const touchHandler = (e: TouchEvent) => { if (e.touches.length > 1) e.preventDefault(); };
    // Safari trackpad pinch via non-standard gesture events
    const gestureHandler = (e: Event) => {
      e.preventDefault();
      const ge = e as any;
      if (ge.scale != null) {
        const z = maskZoomRef.current;
        const newScale = Math.max(0.5, Math.min(5, z.scale * ge.scale));
        z.scale = newScale;
        applyMaskZoom();
      }
    };
    overlay.addEventListener("wheel", wheelHandler, { passive: false });
    overlay.addEventListener("touchmove", touchHandler, { passive: false });
    overlay.addEventListener("gesturestart", gestureHandler as EventListener, { passive: false });
    overlay.addEventListener("gesturechange", gestureHandler as EventListener, { passive: false });
    return () => {
      overlay.removeEventListener("wheel", wheelHandler);
      overlay.removeEventListener("touchmove", touchHandler);
      overlay.removeEventListener("gesturestart", gestureHandler as EventListener);
      overlay.removeEventListener("gesturechange", gestureHandler as EventListener);
    };
  }, [ftMode, applyMaskZoom]);

  // Start marching ants animation
  useEffect(() => {
    if (ftMode !== "mask") {
      if (marchingAntsRef.current) cancelAnimationFrame(marchingAntsRef.current);
      return;
    }
    let offset = 0;
    const animate = () => {
      offset = (offset + 0.3) % 200;
      const strokes = document.querySelectorAll(".lasso-stroke");
      strokes.forEach((s) => (s as SVGPathElement).style.strokeDashoffset = `${offset}`);
      marchingAntsRef.current = requestAnimationFrame(animate);
    };
    marchingAntsRef.current = requestAnimationFrame(animate);
    return () => {
      if (marchingAntsRef.current) cancelAnimationFrame(marchingAntsRef.current);
    };
  }, [ftMode]);

  // Spacebar = pan mode
  useEffect(() => {
    if (ftMode !== "mask") return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Space" && !e.repeat) {
        e.preventDefault();
        setMaskPanning(true);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        e.preventDefault();
        setMaskPanning(false);
        maskPanStartRef.current = null;
      }
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [ftMode]);

  const handleMaskPointerDown = useCallback((e: React.PointerEvent) => {
    const pt = screenToImageCoords(e.clientX, e.clientY);
    if (!pt) return;

    // Clear previous contour — only one allowed at a time
    closedPathRef.current = null;
    const canvas = maskCanvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext("2d");
      if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    renderLassoPaths();

    setMaskDrawing(true);
    lassoPointsRef.current = [pt];
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  }, [screenToImageCoords, renderLassoPaths]);

  const handleMaskPointerMove = useCallback((e: React.PointerEvent) => {
    // Update custom cursor position
    if (maskCursorRef.current) {
      maskCursorRef.current.style.left = `${e.clientX}px`;
      maskCursorRef.current.style.top = `${e.clientY}px`;
    }

    if (!maskDrawing) return;
    const pt = screenToImageCoords(e.clientX, e.clientY);
    if (!pt) return;
    lassoPointsRef.current.push(pt);
    renderLassoPaths();
  }, [maskDrawing, screenToImageCoords, renderLassoPaths]);

  const handleMaskPointerUp = useCallback(() => {
    if (!maskDrawing) return;
    setMaskDrawing(false);

    const pts = lassoPointsRef.current;
    if (pts.length >= 3) {
      // Close the path — add it to completed paths
      closedPathRef.current = [...pts];

      // Render the closed path onto the hidden mask canvas with feathered edges
      const canvas = maskCanvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext("2d");
        if (ctx) {
          const overlay = maskOverlayRef.current;
          if (overlay) {
            const smoothed = smoothPoints(simplifyPoints(pts, 3));
            // Convert overlay coords to canvas (image) coords
            const scaleX = canvas.width / overlay.clientWidth;
            const scaleY = canvas.height / overlay.clientHeight;

            ctx.save();
            ctx.beginPath();
            if (smoothed.length > 0) {
              ctx.moveTo(smoothed[0].x * scaleX, smoothed[0].y * scaleY);
              for (let i = 1; i < smoothed.length; i++) {
                ctx.lineTo(smoothed[i].x * scaleX, smoothed[i].y * scaleY);
              }
            }
            ctx.closePath();

            // Feathered fill: use a slight blur for soft edges
            ctx.filter = "blur(4px)";
            ctx.fillStyle = "rgba(80, 130, 255, 0.85)";
            ctx.fill();
            ctx.filter = "none";
            ctx.restore();
          }
        }
      }
    }
    lassoPointsRef.current = [];
    renderLassoPaths();
  }, [maskDrawing, smoothPoints, simplifyPoints, renderLassoPaths]);

  // Extract mask as a black image with white selection for the API
  const extractMaskDataUrl = useCallback((): string | null => {
    const canvas = maskCanvasRef.current;
    if (!canvas) return null;

    const w = canvas.width;
    const h = canvas.height;
    if (w === 0 || h === 0) return null;

    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    // Read the drawn pixels
    const imageData = ctx.getImageData(0, 0, w, h);
    const pixels = imageData.data;

    // Check if anything was actually drawn
    let hasDrawn = false;
    for (let i = 3; i < pixels.length; i += 4) {
      if (pixels[i] > 5) { hasDrawn = true; break; }
    }
    if (!hasDrawn) return null;

    // Create a new canvas for the black/white mask
    const maskCanvas = document.createElement("canvas");
    maskCanvas.width = w;
    maskCanvas.height = h;
    const maskCtx = maskCanvas.getContext("2d")!;

    // Fill entire canvas with solid black (fully opaque)
    maskCtx.fillStyle = "#000000";
    maskCtx.fillRect(0, 0, w, h);

    // Where we drew (any non-zero alpha), paint solid white
    const maskData = maskCtx.getImageData(0, 0, w, h);
    const mp = maskData.data;
    for (let i = 0; i < pixels.length; i += 4) {
      if (pixels[i + 3] > 5) {
        mp[i] = 255;     // R
        mp[i + 1] = 255; // G
        mp[i + 2] = 255; // B
        mp[i + 3] = 255; // A — fully opaque
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
      setFtError("Draw a selection on the area first");
      return;
    }

    // Store contour path for clip animation, then start looping animation
    const contour = closedPathRef.current;
    if (contour && contour.length > 2) {
      const smoothed = smoothPoints(simplifyPoints(contour, 3));
      eraseClipPathRef.current = buildSvgPath(smoothed, true) || "";
    }
    setEraseAnimating(true);
    setFtProcessing(true);
    setFtError(null);

    try {
      const inputs: Record<string, any> = { image: safeStillUrl };

      if (ftActiveModel === "eraser") {
        inputs.mask_image = maskDataUrl;
      } else if (ftActiveModel === "flux_fill") {
        inputs.mask = maskDataUrl;
        inputs.prompt = ftPrompt || "";
        inputs.mask_type = "manual";
        inputs.sync = true;
        inputs.preserve_alpha = true;
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
      setEraseAnimating(false);
    }
  }, [onFingertipsGenerate, safeStillUrl, ftActiveModel, ftPrompt, extractMaskDataUrl, exitFingertips, smoothPoints, simplifyPoints, buildSvgPath]);

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

            {/* MASK OVERLAY — scroll to zoom, Space+drag to pan, click to draw lasso */}
            {ftMode === "mask" && safeStillUrl && (
              <div
                className={`ft-mask-overlay${maskPanning ? " is-panning" : ""}${cursorInZone ? " cursor-in" : " cursor-out"}`}
                ref={maskOverlayRef}
                onPointerEnter={(e) => {
                  setCursorInZone(true);
                  if (maskCursorRef.current) {
                    maskCursorRef.current.style.left = `${e.clientX}px`;
                    maskCursorRef.current.style.top = `${e.clientY}px`;
                  }
                }}
                onPointerLeave={() => setCursorInZone(false)}
                onWheel={(e) => {
                  // NOTE: actual preventDefault is handled via native listener below
                  const z = maskZoomRef.current;

                  // Trackpad pinch: browser sends ctrlKey + deltaY
                  if (e.ctrlKey) {
                    const pinchDelta = e.deltaY > 0 ? 0.95 : 1.05;
                    const newScale = Math.max(0.5, Math.min(5, z.scale * pinchDelta));
                    const rect = maskOverlayRef.current!.getBoundingClientRect();
                    const mx = e.clientX - rect.left;
                    const my = e.clientY - rect.top;
                    z.x = mx - (mx - z.x) * (newScale / z.scale);
                    z.y = my - (my - z.y) * (newScale / z.scale);
                    z.scale = newScale;
                    applyMaskZoom();
                    return;
                  }

                  // Shift+scroll or horizontal scroll = pan
                  if (e.shiftKey || (Math.abs(e.deltaX) > Math.abs(e.deltaY) * 0.5 && Math.abs(e.deltaX) > 2)) {
                    z.x -= e.deltaX || e.deltaY;
                    z.y -= e.shiftKey ? e.deltaY : 0;
                    applyMaskZoom();
                    return;
                  }

                  // Scroll = zoom toward cursor
                  const delta = e.deltaY > 0 ? 0.92 : 1.08;
                  const newScale = Math.max(0.5, Math.min(5, z.scale * delta));

                  const rect = maskOverlayRef.current!.getBoundingClientRect();
                  const mx = e.clientX - rect.left;
                  const my = e.clientY - rect.top;
                  z.x = mx - (mx - z.x) * (newScale / z.scale);
                  z.y = my - (my - z.y) * (newScale / z.scale);
                  z.scale = newScale;
                  applyMaskZoom();
                }}
                onContextMenu={(e) => {
                  // Right-click = reset view
                  e.preventDefault();
                  maskZoomRef.current = { scale: 1, x: 0, y: 0 };
                  applyMaskZoom();
                }}
              >
                <img
                  className="ft-mask-underlay"
                  src={safeStillUrl}
                  alt=""
                  draggable={false}
                />
                {/* Hidden canvas for mask data extraction */}
                <canvas
                  ref={maskCanvasRef}
                  className="ft-mask-canvas"
                  style={{ opacity: 0, pointerEvents: "none" }}
                />
                {/* SVG overlay for lasso path rendering */}
                <svg
                  ref={lassoSvgRef}
                  className="ft-mask-svg"
                  onPointerDown={(e) => {
                    // Spacebar held = pan mode (checked via keydown listener)
                    if (maskPanning) {
                      e.preventDefault();
                      maskPanStartRef.current = {
                        x: e.clientX,
                        y: e.clientY,
                        zx: maskZoomRef.current.x,
                        zy: maskZoomRef.current.y,
                      };
                      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
                      return;
                    }
                    handleMaskPointerDown(e);
                  }}
                  onPointerMove={(e) => {
                    if (maskPanning && maskPanStartRef.current) {
                      const ps = maskPanStartRef.current;
                      const z = maskZoomRef.current;
                      z.x = ps.zx + (e.clientX - ps.x);
                      z.y = ps.zy + (e.clientY - ps.y);
                      applyMaskZoom();
                      return;
                    }
                    handleMaskPointerMove(e);
                  }}
                  onPointerUp={(e) => {
                    if (maskPanning) {
                      maskPanStartRef.current = null;
                      return;
                    }
                    handleMaskPointerUp();
                  }}
                  onPointerCancel={() => {
                    if (maskPanning) {
                      maskPanStartRef.current = null;
                      return;
                    }
                    handleMaskPointerUp();
                  }}
                />

                {/* Erase animation — looping shimmer inside the drawn contour */}
                {eraseAnimating && eraseClipPathRef.current && (
                  <svg className="ft-erase-svg">
                    <defs>
                      <clipPath id="erase-clip">
                        <path d={eraseClipPathRef.current} />
                      </clipPath>
                    </defs>
                    <rect
                      x="0" y="0"
                      width="100%"
                      height="100%"
                      clipPath="url(#erase-clip)"
                      className="ft-erase-fill"
                    />
                  </svg>
                )}

                <div
                  ref={maskCursorRef}
                  className={`ft-mask-cursor${maskPanning ? " is-panning" : ""}${cursorInZone ? " is-in" : " is-out"}`}
                />

                <div className="ft-mask-hint">
                  Scroll to zoom · Space+drag to pan · Right-click to reset
                </div>
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
            /* unhide from here: Remove BG */
            // { key: "remove_bg" as FtModelKey, label: "Remove BG", sep: false },
            /* unhide from here: Enhance */
            // { key: "upscale" as FtModelKey, label: "Enhance", sep: false },
            { key: "expand" as FtModelKey, label: "Expand", sep: false },
            /* unhide from here: Vectorize */
            // { key: "vectorize" as FtModelKey, label: "Vectorize", sep: false },
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

          {/* unhide from here: Set Scene, Recreate, Animate buttons + separator */}
          {/*
          <span
            className={`ft-btn-separator ${ftBtnVisible ? "is-visible" : ""}`}
            style={{ transitionDelay: ftBtnVisible ? `${FT_INITIAL_DELAY + 7 * FT_STAGGER}ms` : "0ms" }}
            aria-hidden="true"
          >|</span>

          {!!onSetScene && safeStillUrl && (
            <button
              type="button"
              className={`ft-btn ${ftBtnVisible ? "is-visible" : ""}`}
              style={{ transitionDelay: ftBtnVisible ? `${FT_INITIAL_DELAY + 7 * FT_STAGGER}ms` : "0ms" }}
              onClick={() => {
                onSetScene({ url: safeStillUrl, clearInspiration: true });
                exitFingertips();
              }}
              disabled={isBusy}
            >
              Set Scene
            </button>
          )}

          {!!props.onRecreate && (
            <button
              type="button"
              className={`ft-btn ${ftBtnVisible ? "is-visible" : ""}`}
              style={{ transitionDelay: ftBtnVisible ? `${FT_INITIAL_DELAY + 8 * FT_STAGGER}ms` : "0ms" }}
              onClick={() => {
                props.onRecreate?.({ kind: "still", stillIndex });
                exitFingertips();
              }}
              disabled={isBusy}
            >
              Recreate
            </button>
          )}

          {!!props.onRecreate && isImage && (
            <button
              type="button"
              className={`ft-btn ${ftBtnVisible ? "is-visible" : ""}`}
              style={{ transitionDelay: ftBtnVisible ? `${FT_INITIAL_DELAY + 9 * FT_STAGGER}ms` : "0ms" }}
              onClick={() => {
                props.onRecreate?.({ kind: "motion", stillIndex });
                exitFingertips();
              }}
              disabled={isBusy}
            >
              Animate
            </button>
          )}
          */}

          <span style={{ flex: "1 1 auto" }} />

          <button
            type="button"
            className={`ft-btn ${ftBtnVisible ? "is-visible" : ""}`}
            style={{ transitionDelay: ftBtnVisible ? `${FT_INITIAL_DELAY + 10 * FT_STAGGER}ms` : "0ms" }}
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
            {ftActiveModel === "eraser" ? "Draw around the area to erase" : "Draw around the area to fill"}
          </span>

          <button
            type="button"
            className={`ft-btn ${ftBtnVisible ? "is-visible" : ""}`}
            style={{ transitionDelay: ftBtnVisible ? `${FT_INITIAL_DELAY + 2 * FT_STAGGER}ms` : "0ms" }}
            onClick={() => {
              // Clear all lasso paths + canvas
              closedPathRef.current = null;
              lassoPointsRef.current = [];
              renderLassoPaths();
              const canvas = maskCanvasRef.current;
              if (canvas) {
                const ctx = canvas.getContext("2d");
                if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
              }
            }}
          >
            Clear
          </button>

          <span style={{ flex: "1 1 auto" }} />

          <button
            type="button"
            className={`ft-btn ${ftBtnVisible ? "is-visible" : ""}`}
            style={{ transitionDelay: ftBtnVisible ? `${FT_INITIAL_DELAY + 3 * FT_STAGGER}ms` : "0ms" }}
            onClick={handleMaskSubmit}
            disabled={isBusy}
          >
            {ftProcessing ? "Processing…" : ftActiveModel === "eraser" ? "Erase" : "Apply"}
          </button>

          {ftError && <div className="ft-error">{ftError}</div>}
        </div>
      )}
    </div>
  );
}
