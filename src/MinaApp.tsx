// src/MinaApp.tsx
// ============================================================================
// [PART 1 START] Imports & environment
// ============================================================================
import React, { useEffect, useLayoutEffect, useState, useRef } from "react";
import { supabase } from "./lib/supabaseClient";
const API_BASE_URL =
  import.meta.env.VITE_MINA_API_BASE_URL ||
  "https://mina-editorial-ai-api.onrender.com";

const TOPUP_URL =
  import.meta.env.VITE_MINA_TOPUP_URL ||
  "https://www.faltastudio.com/checkouts/cn/hWN6EhbqQW5KrdIuBO3j5HKV/en-ae?_r=AQAB9NY_ccOV_da3y7VmTxJU-dDoLEOCdhP9sg2YlvDwLQQ";
// ============================================================================
// [PART 1 END]
// ============================================================================

// ============================================================================
// [PART 2 START] Types
// ============================================================================
type HealthState = {
  ok: boolean;
  message?: string;
};

type CreditsMeta = {
  imageCost: number;
  motionCost: number;
};

type CreditsState = {
  balance: number;
  meta?: CreditsMeta;
};

type EditorialResponse = {
  ok: boolean;
  prompt?: string;
  imageUrl?: string;
  imageUrls?: string[];
  generationId?: string;
  sessionId?: string;
  credits?: {
    balance: number;
    cost?: number;
  };
};

type MotionSuggestResponse = {
  ok: boolean;
  suggestion?: string;
};

type MotionResponse = {
  ok: boolean;
  prompt?: string;
  videoUrl?: string;
  generationId?: string;
  sessionId?: string;
  credits?: {
    balance: number;
    cost?: number;
  };
};

type GenerationRecord = {
  id: string;
  type: string;
  sessionId: string;
  customerId: string;
  platform: string;
  prompt: string;
  outputUrl: string;
  createdAt: string;
  meta?: {
    tone?: string;
    platform?: string;
    minaVisionEnabled?: boolean;
    stylePresetKey?: string;
    productImageUrl?: string;
    styleImageUrls?: string[];
    aspectRatio?: string;
    [key: string]: unknown;
  } | null;
};

type FeedbackRecord = {
  id: string;
  customerId: string;
  resultType: string;
  platform: string;
  prompt: string;
  comment: string;
  imageUrl?: string;
  videoUrl?: string;
  createdAt: string;
};

type HistoryResponse = {
  ok: boolean;
  customerId: string;
  credits: {
    balance: number;
    history?: {
      id: string;
      amount: number;
      reason: string;
      createdAt: string;
    }[];
  };
  generations: GenerationRecord[];
  feedbacks: FeedbackRecord[];
};

type StillItem = {
  id: string;
  url: string;
  createdAt: string;
  prompt: string;
  aspectRatio?: string;
};

type MotionItem = {
  id: string;
  url: string;
  createdAt: string;
  prompt: string;
};

type CustomStyleImage = {
  id: string;
  url: string; // blob url for UI
  file: File;
};

type CustomStylePreset = {
  key: string; // "custom-..."
  label: string; // editable name
  thumbDataUrl: string; // persisted
};

type UploadKind = "file" | "url";

type UploadItem = {
  id: string;
  kind: UploadKind;
  url: string; // blob: or http(s)
  file?: File; // only for kind=file
};

type UploadPanelKey = "product" | "logo" | "inspiration";

type AspectKey = "9-16" | "3-4" | "2-3" | "1-1";

type AspectOption = {
  key: AspectKey;
  ratio: string;
  label: string;
  subtitle: string;
  platformKey: string;
};

type MinaAppProps = {
  initialCustomerId?: string;
};
// ============================================================================
// [PART 2 END]
// ============================================================================

// ============================================================================
// [PART 3 START] Constants & helpers
// ============================================================================
const ASPECT_OPTIONS: AspectOption[] = [
  { key: "9-16", ratio: "9:16", label: "9:16", subtitle: "Tiktok/Reel", platformKey: "tiktok" },
  { key: "3-4", ratio: "3:4", label: "3:4", subtitle: "Post", platformKey: "instagram-post" },
  { key: "2-3", ratio: "2:3", label: "2:3", subtitle: "Printing", platformKey: "print" },
  { key: "1-1", ratio: "1:1", label: "1:1", subtitle: "Square", platformKey: "square" },
];

const ASPECT_ICON_URLS: Record<AspectKey, string> = {
  "9-16":
    "https://cdn.shopify.com/s/files/1/0678/9254/3571/files/tiktokreels_icon_e116174c-afc7-4174-9cf0-f24a07c8517b.svg?v=1765425956",
  "3-4":
    "https://cdn.shopify.com/s/files/1/0678/9254/3571/files/post_icon_f646fcb5-03be-4cf5-b25c-b1ec38f6794e.svg?v=1765425956",
  "2-3":
    "https://cdn.shopify.com/s/files/1/0678/9254/3571/files/Printing_icon_c7252c7d-863e-4efb-89c4-669261119d61.svg?v=1765425956",
  "1-1":
    "https://cdn.shopify.com/s/files/1/0678/9254/3571/files/square_icon_901d47a8-44a8-4ab9-b412-2224e97fd9d9.svg?v=1765425956",
};

// Map our UI ratios to Replicate-safe values
const REPLICATE_ASPECT_RATIO_MAP: Record<string, string> = {
  "9:16": "9:16",
  "3:4": "3:4",
  "2:3": "2:3",
  "1:1": "1:1",
};

const STYLE_PRESETS = [
  {
    key: "vintage",
    label: "Vintage",
    thumb:
      "https://cdn.shopify.com/s/files/1/0678/9254/3571/files/Vintage_1.png?v=1765457775",
  },
  {
    key: "gradient",
    label: "Gradient",
    thumb:
      "https://cdn.shopify.com/s/files/1/0678/9254/3571/files/Gradient.png?v=1765457775",
  },
  {
    key: "back-light",
    label: "Back light",
    thumb:
      "https://cdn.shopify.com/s/files/1/0678/9254/3571/files/Backlight.png?v=1765457775",
  },
] as const;

const PANEL_LIMITS: Record<UploadPanelKey, number> = {
  product: 1,
  logo: 1,
  inspiration: 4,
};

const CUSTOM_STYLES_LS_KEY = "minaCustomStyles_v1";

function classNames(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

function getInitialCustomerId(initialCustomerId?: string): string {
  try {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const fromUrl = params.get("customerId");
      if (fromUrl && fromUrl.trim().length > 0) return fromUrl.trim();

      const stored = window.localStorage.getItem("minaCustomerId");
      if (stored && stored.trim().length > 0) return stored.trim();
    }
  } catch {
    // ignore
  }
  if (initialCustomerId && initialCustomerId.trim().length > 0) return initialCustomerId.trim();
  return "anonymous";
}

function persistCustomerId(id: string) {
  try {
    if (typeof window !== "undefined") window.localStorage.setItem("minaCustomerId", id);
  } catch {
    // ignore
  }
}

function formatTime(ts?: string | null) {
  if (!ts) return "";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return ts;
  return d.toLocaleString();
}

function safeIsHttpUrl(url: string) {
  return /^https?:\/\//i.test(url);
}

function looksLikeImageUrl(url: string) {
  const u = url.trim();
  if (!safeIsHttpUrl(u)) return false;
  return /\.(png|jpg|jpeg|webp|gif|avif)(\?.*)?$/i.test(u) || u.includes("cdn.shopify.com");
}

async function fileToDataUrl(file: File): Promise<string> {
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.onload = () => resolve(String(reader.result || ""));
    reader.readAsDataURL(file);
  });
}

function loadCustomStyles(): CustomStylePreset[] {
  try {
    const raw = window.localStorage.getItem(CUSTOM_STYLES_LS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as CustomStylePreset[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x) => x && typeof x.key === "string" && typeof x.label === "string" && typeof x.thumbDataUrl === "string");
  } catch {
    return [];
  }
}

function saveCustomStyles(styles: CustomStylePreset[]) {
  try {
    window.localStorage.setItem(CUSTOM_STYLES_LS_KEY, JSON.stringify(styles));
  } catch {
    // ignore
  }
}
// ============================================================================
// [PART 3 END]
// ============================================================================
// ==============================================
// PART UI HELPERS (pills/panels)
// ==============================================
type PanelKey = "product" | "logo" | "inspiration" | "style" | null;
type UploadPanelKey = "product" | "logo" | "inspiration";

type UploadItem = {
  id: string;
  url: string; // blob:... or https://...
  kind: "file" | "url";
  file?: File;
};

type CustomStyle = {
  id: string; // custom-...
  key: string; // used as stylePresetKey
  label: string;
  thumbUrl: string; // dataURL or https
  createdAt: string;
};

function isHttpUrl(url: string) {
  return /^https?:\/\//i.test(url);
}

function extractFirstHttpUrl(text: string) {
  const m = text.match(/https?:\/\/[^\s)]+/i);
  return m ? m[0] : null;
}

async function fileToDataUrl(file: File): Promise<string> {
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("FileReader failed"));
    reader.onload = () => resolve(String(reader.result || ""));
    reader.readAsDataURL(file);
  });
}

/**
 * Smooth open/close without "display:none" jumps.
 * (Your CSS can style inside; TSX handles the height animation.)
 */
const Collapse: React.FC<{
  open: boolean;
  delayMs?: number;
  children: React.ReactNode;
}> = ({ open, delayMs = 0, children }) => {
  const innerRef = useRef<HTMLDivElement | null>(null);
  const [mounted, setMounted] = useState(open);
  const [height, setHeight] = useState<number | "auto">(open ? "auto" : 0);

  // mount immediately when opening
  useEffect(() => {
    if (open) setMounted(true);
  }, [open]);

  useLayoutEffect(() => {
    const el = innerRef.current;
    if (!el) return;

    const D = 280;

    if (open) {
      // from 0 -> content height -> auto
      const h = el.scrollHeight;
      setHeight(h);

      const t = window.setTimeout(() => {
        setHeight("auto");
      }, D + delayMs);

      return () => window.clearTimeout(t);
    }

    // closing: from auto -> measured -> 0, then unmount
    const current = el.scrollHeight;
    setHeight(current);

    const raf = requestAnimationFrame(() => setHeight(0));
    const t = window.setTimeout(() => setMounted(false), D);

    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(t);
    };
  }, [open, delayMs]);

  if (!mounted) return null;

  return (
    <div
      style={{
        overflow: "hidden",
        height: open ? height : height,
        opacity: open ? 1 : 0,
        transform: open ? "translateY(0)" : "translateY(-6px)",
        transition:
          "height 280ms ease, opacity 280ms ease, transform 280ms ease",
        transitionDelay: open ? `${delayMs}ms` : "0ms",
      }}
    >
      <div ref={innerRef}>{children}</div>
    </div>
  );
};

// ============================================================================
// [PART 4 START] Component
// ============================================================================
const MinaApp: React.FC<MinaAppProps> = ({ initialCustomerId }) => {
  // -------------------------
  // 4.1 Global tab + customer
  // -------------------------
  const [activeTab, setActiveTab] = useState<"studio" | "profile">("studio");
  const [customerId, setCustomerId] = useState<string>(() => getInitialCustomerId(initialCustomerId));
  const [customerIdInput, setCustomerIdInput] = useState<string>(customerId);

  // -------------------------
  // 4.2 Health / credits / session
  // -------------------------
  const [health, setHealth] = useState<HealthState | null>(null);
  const [checkingHealth, setCheckingHealth] = useState(false);

  const [credits, setCredits] = useState<CreditsState | null>(null);
  const [creditsLoading, setCreditsLoading] = useState(false);

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionTitle, setSessionTitle] = useState("Mina Studio session");

  // -------------------------
  // 4.3 Studio – brief + steps
  // -------------------------
  const [brief, setBrief] = useState("");
  const [tone] = useState("Poetic");
  const [, setPlatform] = useState("tiktok");
  const [aspectIndex, setAspectIndex] = useState(0);

  // NEW: upload panels (product/logo/inspiration)
  const [openPanel, setOpenPanel] = useState<UploadPanelKey | null>(null);

  const [productItems, setProductItems] = useState<UploadItem[]>([]);
  const [logoItems, setLogoItems] = useState<UploadItem[]>([]);
  const [inspirationItems, setInspirationItems] = useState<UploadItem[]>([]);
  // Style step toggle (by Style pill)
  const [styleStepOpen, setStyleStepOpen] = useState(false);
  // Style preset (UI key; built-ins or custom-*)
  const [stylePresetKey, setStylePresetKey] = useState<string>("vintage");
  // Vision toggle (Input 3) — ALWAYS visible
  const [minaVisionEnabled, setMinaVisionEnabled] = useState(true);
  // Stills
  const [stillItems, setStillItems] = useState<StillItem[]>([]);
  const [stillIndex, setStillIndex] = useState(0);
  const [stillGenerating, setStillGenerating] = useState(false);
  const [stillError, setStillError] = useState<string | null>(null);
  const [lastStillPrompt, setLastStillPrompt] = useState<string>("");

  // Motion
  const [motionItems, setMotionItems] = useState<MotionItem[]>([]);
  const [motionIndex, setMotionIndex] = useState(0);
  const [motionDescription, setMotionDescription] = useState("");
  const [motionSuggestLoading, setMotionSuggestLoading] = useState(false);
  const [motionSuggestError, setMotionSuggestError] = useState<string | null>(null);
  const [motionGenerating, setMotionGenerating] = useState(false);
  const [motionError, setMotionError] = useState<string | null>(null);

  // Feedback
  const [feedbackText, setFeedbackText] = useState("");
  const [feedbackSending, setFeedbackSending] = useState(false);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);
// Panels (only one open at a time)
const [activePanel, setActivePanel] = useState<PanelKey>(null);

// Stage 0 = only textarea
// Stage 1 = pills fade in (stagger)
// Stage 2 = panels area available
// Stage 3 = vision + create available
const [uiStage, setUiStage] = useState<0 | 1 | 2 | 3>(0);

// Global drag overlay (whole page)
const [globalDragging, setGlobalDragging] = useState(false);
const dragDepthRef = useRef(0);

// Upload buckets
const [uploads, setUploads] = useState<Record<UploadPanelKey, UploadItem[]>>({
  product: [],
  logo: [],
  inspiration: [],
});

// Style selection (hover selects too)
const [stylePresetKey, setStylePresetKey] = useState<string>("vintage");
const [minaVisionEnabled, setMinaVisionEnabled] = useState(true);

// Inline rename for styles (no new panel)
const [styleLabelOverrides, setStyleLabelOverrides] = useState<
  Record<string, string>
>(() => {
  try {
    const raw = window.localStorage.getItem("minaStyleLabelOverrides");
    return raw ? (JSON.parse(raw) as Record<string, string>) : {};
  } catch {
    return {};
  }
});

const [customStyles, setCustomStyles] = useState<CustomStyle[]>(() => {
  try {
    const raw = window.localStorage.getItem("minaCustomStyles");
    return raw ? (JSON.parse(raw) as CustomStyle[]) : [];
  } catch {
    return [];
  }
});

const [editingStyleKey, setEditingStyleKey] = useState<string | null>(null);
const [editingStyleValue, setEditingStyleValue] = useState<string>("");

  // -------------------------
  // 4.4 History (profile)
  // -------------------------
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historyGenerations, setHistoryGenerations] = useState<GenerationRecord[]>([]);
  const [historyFeedbacks, setHistoryFeedbacks] = useState<FeedbackRecord[]>([]);

  // -------------------------
  // 4.5 Upload refs / drag state
  // -------------------------
 const productInputRef = useRef<HTMLInputElement | null>(null);
const logoInputRef = useRef<HTMLInputElement | null>(null);
const inspirationInputRef = useRef<HTMLInputElement | null>(null);


  // -------------------------
  // 4.6 Brief helper hint ("Describe more")
  // -------------------------
  const [showDescribeMore, setShowDescribeMore] = useState(false);
  const describeMoreTimeoutRef = useRef<number | null>(null);

  // -------------------------
  // 4.7 Brief scroll ref
  // -------------------------
  const briefShellRef = useRef<HTMLDivElement | null>(null);

  // -------------------------
  // 4.8 Custom style modal + custom saved styles
  // -------------------------
  const [customStylePanelOpen, setCustomStylePanelOpen] = useState(false);
  const [customStyleImages, setCustomStyleImages] = useState<CustomStyleImage[]>([]);
  const [customStyleHeroId, setCustomStyleHeroId] = useState<string | null>(null);
  const [customStyleHeroThumb, setCustomStyleHeroThumb] = useState<string | null>(null);
  const [customStyleTraining, setCustomStyleTraining] = useState(false);
  const [customStyleError, setCustomStyleError] = useState<string | null>(null);
  const customStyleInputRef = useRef<HTMLInputElement | null>(null);

  const [customPresets, setCustomPresets] = useState<CustomStylePreset[]>(() => {
    if (typeof window === "undefined") return [];
    return loadCustomStyles();
  });

  // ========================================================================
  // [PART 5 START] Derived values (the “rules” you requested)
  // ========================================================================
  const briefLength = brief.trim().length;
  const canCreateStill = briefLength >= 40 && !stillGenerating;
  
  const showPills = uiStage >= 1;
  const showPanels = uiStage >= 2;
  const showControls = uiStage >= 3;
  
  const productCount = uploads.product.length;
  const logoCount = uploads.logo.length;
  const inspirationCount = uploads.inspiration.length;


  const currentAspect = ASPECT_OPTIONS[aspectIndex];
  const currentStill: StillItem | null = stillItems[stillIndex] || stillItems[0] || null;
  const currentMotion: MotionItem | null = motionItems[motionIndex] || motionItems[0] || null;

  const imageCost = credits?.meta?.imageCost ?? 1;
  const motionCost = credits?.meta?.motionCost ?? 5;

  // Input 1 hint visibility
  const briefHintVisible = showDescribeMore;

  // Upload panel target for full-page drag/drop / paste:
  const currentUploadTarget: UploadPanelKey = openPanel || "product";

  const productHasMedia = productItems.length > 0;
  const logoHasMedia = logoItems.length > 0;
  const inspirationHasMedia = inspirationItems.length > 0;

  // Compatibility: “productImageThumb / styleImageUrls” used by API payload
  // (NOTE: blob: urls won’t be sent to API — same behavior as before)
  const productImageThumb = productItems[0]?.url || null;
  const styleImageUrls = inspirationItems.map((x) => x.url).filter(safeIsHttpUrl);

  // Style key for API (avoid unknown custom keys)
  const stylePresetKeyForApi = stylePresetKey.startsWith("custom-")
    ? "custom-style"
    : stylePresetKey;

  // Pills auto-open product when they appear (your request)
  const pillsWereVisibleRef = useRef(false);
  useEffect(() => {
    if (showPills && !pillsWereVisibleRef.current) {
      pillsWereVisibleRef.current = true;
      setOpenPanel("product");
    }
    if (!showPills) {
      pillsWereVisibleRef.current = false;
      setOpenPanel(null);
      setStyleStepOpen(false);
    }
  }, [showPills]);

  // ========================================================================
  // [PART 5 END]
  // ========================================================================
// ============================================
// PART UI STAGING (premium reveal / no jumping)
// ============================================
useEffect(() => {
  // Persist style storage
  try {
    window.localStorage.setItem(
      "minaStyleLabelOverrides",
      JSON.stringify(styleLabelOverrides)
    );
  } catch {
    // ignore
  }
}, [styleLabelOverrides]);

useEffect(() => {
  try {
    window.localStorage.setItem("minaCustomStyles", JSON.stringify(customStyles));
  } catch {
    // ignore
  }
}, [customStyles]);

useEffect(() => {
  // Stage 0: only textarea
  if (briefLength <= 0) {
    setUiStage(0);
    setActivePanel(null);
    setGlobalDragging(false);
    dragDepthRef.current = 0;
    return;
  }

  // First time you type: open Product by default
  setUiStage(1);
  setActivePanel((prev) => prev ?? "product");

  const t2 = window.setTimeout(() => setUiStage(2), 140);
  const t3 = window.setTimeout(() => setUiStage(3), 280);

  return () => {
    window.clearTimeout(t2);
    window.clearTimeout(t3);
  };
}, [briefLength]);

  // ========================================================================
  // [PART 6 START] Effects – persist customer + bootstrap
  // ========================================================================
  useEffect(() => {
    setCustomerIdInput(customerId);
    persistCustomerId(customerId);
  }, [customerId]);

  useEffect(() => {
    if (!API_BASE_URL || !customerId) return;

    const bootstrap = async () => {
      await handleCheckHealth();
      await fetchCredits();
      await ensureSession();
      await fetchHistory();
    };

    void bootstrap();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId]);

  // clear "describe more" timer on unmount
  useEffect(() => {
    return () => {
      if (describeMoreTimeoutRef.current !== null) {
        window.clearTimeout(describeMoreTimeoutRef.current);
      }
    };
  }, []);

  // revoke blob urls on unmount
  useEffect(() => {
    return () => {
      const revokeIfBlob = (u?: string) => {
        if (u && u.startsWith("blob:")) URL.revokeObjectURL(u);
      };

      productItems.forEach((x) => revokeIfBlob(x.url));
      logoItems.forEach((x) => revokeIfBlob(x.url));
      inspirationItems.forEach((x) => revokeIfBlob(x.url));

      if (customStyleHeroThumb && customStyleHeroThumb.startsWith("blob:")) {
        URL.revokeObjectURL(customStyleHeroThumb);
      }
      customStyleImages.forEach((img) => {
        if (img.url.startsWith("blob:")) URL.revokeObjectURL(img.url);
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Full-page paste support (image files or https image links)
  useEffect(() => {
    const onPaste = async (e: ClipboardEvent) => {
      if (!showPills) return;

      try {
        const items = e.clipboardData?.items;
        if (items && items.length) {
          // Try image file paste
          for (const it of Array.from(items)) {
            if (it.kind === "file") {
              const file = it.getAsFile();
              if (file && file.type.startsWith("image/")) {
                addFilesToPanel(currentUploadTarget, [file]);
                return;
              }
            }
          }
        }

        // Try text paste (URL)
        const text = e.clipboardData?.getData("text") || "";
        const trimmed = text.trim();
        if (looksLikeImageUrl(trimmed)) {
          addUrlToPanel(currentUploadTarget, trimmed);
        }
      } catch {
        // ignore
      }
    };

    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showPills, currentUploadTarget, productItems, logoItems, inspirationItems]);
  // ========================================================================
  // [PART 6 END]
  // ========================================================================

  // ========================================================================
  // [PART 7 START] API helpers
  // ========================================================================
  const handleCheckHealth = async () => {
    if (!API_BASE_URL) return;
    try {
      setCheckingHealth(true);
      const res = await fetch(`${API_BASE_URL}/health`);
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; message?: string };
      setHealth({ ok: json.ok ?? false, message: json.message ?? "" });
    } catch (err: any) {
      setHealth({ ok: false, message: err?.message || "Unable to reach Mina." });
    } finally {
      setCheckingHealth(false);
    }
  };

  const fetchCredits = async () => {
    if (!API_BASE_URL || !customerId) return;
    try {
      setCreditsLoading(true);
      const params = new URLSearchParams({ customerId });
      const res = await fetch(`${API_BASE_URL}/credits/balance?${params}`);
      if (!res.ok) return;
      const json = (await res.json()) as { balance: number; meta?: { imageCost: number; motionCost: number } };
      setCredits({ balance: json.balance, meta: json.meta });
    } catch {
      // silent
    } finally {
      setCreditsLoading(false);
    }
  };

  const ensureSession = async (): Promise<string | null> => {
    if (sessionId) return sessionId;
    if (!API_BASE_URL || !customerId) return null;

    try {
      const res = await fetch(`${API_BASE_URL}/sessions/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId,
          platform: currentAspect.platformKey,
          title: sessionTitle,
        }),
      });

      if (!res.ok) return null;
      const json = (await res.json()) as { ok: boolean; session?: { id: string; title?: string } };
      if (json.ok && json.session?.id) {
        setSessionId(json.session.id);
        setSessionTitle(json.session.title || sessionTitle);
        return json.session.id;
      }
    } catch {
      // ignore
    }
    return null;
  };

  const fetchHistory = async () => {
    if (!API_BASE_URL || !customerId) return;
    try {
      setHistoryLoading(true);
      const res = await fetch(`${API_BASE_URL}/history/customer/${encodeURIComponent(customerId)}`);
      if (!res.ok) throw new Error(`Status ${res.status}`);
      const json = (await res.json()) as HistoryResponse;
      if (!json.ok) throw new Error("History error");

      setCredits((prev) => ({ balance: json.credits.balance, meta: prev?.meta }));
      setHistoryGenerations(json.generations || []);
      setHistoryFeedbacks(json.feedbacks || []);
    } catch (err: any) {
      setHistoryError(err?.message || "Unable to load history.");
    } finally {
      setHistoryLoading(false);
    }
  };
  // ========================================================================
  // [PART 7 END]
  // ========================================================================

  // ========================================================================
  // [PART 8 START] Upload logic (product/logo/inspiration)
  // ========================================================================
  const revokeIfBlob = (u?: string) => {
    if (u && u.startsWith("blob:")) URL.revokeObjectURL(u);
  };

  const setPanelItems = (panel: UploadPanelKey, next: UploadItem[]) => {
    if (panel === "product") setProductItems(next);
    if (panel === "logo") setLogoItems(next);
    if (panel === "inspiration") setInspirationItems(next);
  };

  const getPanelItems = (panel: UploadPanelKey) => {
    if (panel === "product") return productItems;
    if (panel === "logo") return logoItems;
    return inspirationItems;
  };

  const addFilesToPanel = (panel: UploadPanelKey, files: File[]) => {
    if (!files.length) return;

    const limit = PANEL_LIMITS[panel];
    const current = getPanelItems(panel);

    const onlyImages = files.filter((f) => f.type.startsWith("image/"));
    if (!onlyImages.length) return;

    const now = Date.now();
    const newItems: UploadItem[] = onlyImages.map((file, idx) => ({
      id: `${panel}_${now}_${idx}_${file.name}`,
      kind: "file",
      url: URL.createObjectURL(file),
      file,
    }));

    if (limit === 1) {
      // replace
      current.forEach((x) => revokeIfBlob(x.url));
      setPanelItems(panel, [newItems[0]]);
      return;
    }

    const remaining = Math.max(0, limit - current.length);
    const toAdd = newItems.slice(0, remaining);
    setPanelItems(panel, [...current, ...toAdd]);
  };

  const addUrlToPanel = (panel: UploadPanelKey, url: string) => {
    const u = url.trim();
    if (!safeIsHttpUrl(u)) return;

    const limit = PANEL_LIMITS[panel];
    const current = getPanelItems(panel);

    const item: UploadItem = {
      id: `${panel}_url_${Date.now()}`,
      kind: "url",
      url: u,
    };

    if (limit === 1) {
      // replace
      current.forEach((x) => revokeIfBlob(x.url));
      setPanelItems(panel, [item]);
      return;
    }

    if (current.length >= limit) return;
    setPanelItems(panel, [...current, item]);
  };

  const removePanelItem = (panel: UploadPanelKey, id: string) => {
    const current = getPanelItems(panel);
    const next = current.filter((x) => x.id !== id);
    const removed = current.find((x) => x.id === id);
    if (removed) revokeIfBlob(removed.url);
    setPanelItems(panel, next);
  };

  const reorderPanelItems = (panel: UploadPanelKey, fromIndex: number, toIndex: number) => {
    const current = [...getPanelItems(panel)];
    if (fromIndex < 0 || toIndex < 0 || fromIndex >= current.length || toIndex >= current.length) return;
    const [moved] = current.splice(fromIndex, 1);
    current.splice(toIndex, 0, moved);
    setPanelItems(panel, current);
  };

  // Thumb drag for reorder (within same panel)
  const dragThumbRef = useRef<{ panel: UploadPanelKey; index: number } | null>(null);

  const openFilePickerForPanel = (panel: UploadPanelKey) => {
    if (panel === "product") productInputRef.current?.click();
    if (panel === "logo") logoInputRef.current?.click();
    if (panel === "inspiration") inspirationInputRef.current?.click();
  };

  const promptPasteLinkForPanel = (panel: UploadPanelKey) => {
    const txt = window.prompt("Paste an image URL (https://...)", "");
    if (!txt) return;
    if (!looksLikeImageUrl(txt)) return;
    addUrlToPanel(panel, txt);
  };

  const handleProductFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files && e.target.files[0];
    if (file) addFilesToPanel("product", [file]);
    e.target.value = "";
  };

  const handleLogoFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files && e.target.files[0];
    if (file) addFilesToPanel("logo", [file]);
    e.target.value = "";
  };

  const handleInspirationFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files ? Array.from(e.target.files) : [];
    if (files.length) addFilesToPanel("inspiration", files);
    e.target.value = "";
  };
  // ========================================================================
  // [PART 8 END]
  // ========================================================================

  // ========================================================================
  // [PART 9 START] Stills (editorial)
  // ========================================================================
  const handleGenerateStill = async () => {
    const trimmed = brief.trim();
    if (trimmed.length < 40) return;

    if (!API_BASE_URL) {
      setStillError("Missing API base URL (VITE_MINA_API_BASE_URL).");
      return;
    }
      const productUrl = uploads.product[0]?.url;
      if (productUrl && isHttpUrl(productUrl)) {
        payload.productImageUrl = productUrl;
      }
      
      const inspirationUrls = uploads.inspiration
        .map((u) => u.url)
        .filter((u) => isHttpUrl(u))
        .slice(0, 4);
      
      if (inspirationUrls.length) {
        payload.styleImageUrls = inspirationUrls;
      }

    const sid = await ensureSession();
    if (!sid) {
      setStillError("Could not start Mina session.");
      return;
    }

    try {
      setStillGenerating(true);
      setStillError(null);

      const safeAspectRatio = REPLICATE_ASPECT_RATIO_MAP[currentAspect.ratio] || "1:1";

      const payload: {
        customerId: string;
        sessionId: string;
        brief: string;
        tone: string;
        platform: string;
        minaVisionEnabled: boolean;
        stylePresetKey: string;
        aspectRatio: string;
        productImageUrl?: string;
        styleImageUrls?: string[];
      } = {
        customerId,
        sessionId: sid,
        brief: trimmed,
        tone,
        platform: currentAspect.platformKey,
        minaVisionEnabled,
        stylePresetKey: stylePresetKeyForApi,
        aspectRatio: safeAspectRatio,
      };

      // Only forward if product image is a real http(s) URL
      if (productImageThumb && safeIsHttpUrl(productImageThumb)) {
        payload.productImageUrl = productImageThumb;
      }

      // Inspiration: forward ONLY http(s) urls
      if (styleImageUrls.length) {
        payload.styleImageUrls = styleImageUrls.slice(0, 4);
      }

      const res = await fetch(`${API_BASE_URL}/editorial/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => null);
        const msg =
          errJson?.message || `Error ${res.status}: Failed to generate editorial still.`;
        throw new Error(msg);
      }

      const data = (await res.json()) as EditorialResponse;
      const url = data.imageUrl || data.imageUrls?.[0];
      if (!url) throw new Error("No image URL in Mina response.");

      const item: StillItem = {
        id: data.generationId || `still_${Date.now()}`,
        url,
        createdAt: new Date().toISOString(),
        prompt: data.prompt || trimmed,
        aspectRatio: currentAspect.ratio,
      };

      setStillItems((prev) => [...prev, item]);
      setStillIndex((prev) => prev + 1);
      setLastStillPrompt(item.prompt);

      if (data.credits?.balance !== undefined) {
        setCredits((prev) => ({
          balance: data.credits!.balance,
          meta: prev?.meta,
        }));
      }
    } catch (err: any) {
      setStillError(err?.message || "Unexpected error generating still.");
    } finally {
      setStillGenerating(false);
    }
  };
  // ========================================================================
  // [PART 9 END]
  // ========================================================================

  // ========================================================================
  // [PART 10 START] Motion (suggest + generate)
  // ========================================================================
  const handleSuggestMotion = async () => {
    if (!API_BASE_URL || !currentStill) return;

    try {
      setMotionSuggestLoading(true);
      setMotionSuggestError(null);
      const res = await fetch(`${API_BASE_URL}/motion/suggest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId,
          referenceImageUrl: currentStill.url,
          tone,
          platform: currentAspect.platformKey,
          minaVisionEnabled,
          stylePresetKey: stylePresetKeyForApi,
        }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => null);
        const msg = errJson?.message || `Error ${res.status}: Failed to suggest motion.`;
        throw new Error(msg);
      }

      const data = (await res.json()) as MotionSuggestResponse;
      if (data.suggestion) setMotionDescription(data.suggestion);
    } catch (err: any) {
      setMotionSuggestError(err?.message || "Unexpected error suggesting motion.");
    } finally {
      setMotionSuggestLoading(false);
    }
  };

  const handleGenerateMotion = async () => {
    if (!API_BASE_URL || !currentStill || !motionDescription.trim()) return;

    const sid = await ensureSession();
    if (!sid) {
      setMotionError("Could not start Mina session.");
      return;
    }

    try {
      setMotionGenerating(true);
      setMotionError(null);

      const res = await fetch(`${API_BASE_URL}/motion/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId,
          sessionId: sid,
          lastImageUrl: currentStill.url,
          motionDescription: motionDescription.trim(),
          tone,
          platform: currentAspect.platformKey,
          minaVisionEnabled,
          stylePresetKey: stylePresetKeyForApi,
        }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => null);
        const msg = errJson?.message || `Error ${res.status}: Failed to generate motion.`;
        throw new Error(msg);
      }

      const data = (await res.json()) as MotionResponse;
      const url = data.videoUrl;
      if (!url) throw new Error("No video URL in Mina response.");

      const item: MotionItem = {
        id: data.generationId || `motion_${Date.now()}`,
        url,
        createdAt: new Date().toISOString(),
        prompt: data.prompt || motionDescription.trim(),
      };

      setMotionItems((prev) => [...prev, item]);
      setMotionIndex((prev) => prev + 1);

      if (data.credits?.balance !== undefined) {
        setCredits((prev) => ({
          balance: data.credits!.balance,
          meta: prev?.meta,
        }));
      }
    } catch (err: any) {
      setMotionError(err?.message || "Unexpected error generating motion.");
    } finally {
      setMotionGenerating(false);
    }
  };
  // ========================================================================
  // [PART 10 END]
  // ========================================================================

  // ========================================================================
  // [PART 11 START] Feedback / like / download
  // ========================================================================
  const handleLikeCurrentStill = async () => {
    if (!API_BASE_URL || !currentStill) return;

    try {
      await fetch(`${API_BASE_URL}/feedback/like`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId,
          resultType: "image",
          platform: currentAspect.platformKey,
          prompt: currentStill.prompt || lastStillPrompt || brief,
          comment: "",
          imageUrl: currentStill.url,
          videoUrl: "",
          sessionId,
        }),
      });
    } catch {
      // non-blocking
    }
  };

  const handleSubmitFeedback = async () => {
    if (!API_BASE_URL || !feedbackText.trim()) return;
    const comment = feedbackText.trim();

    const targetVideo = currentMotion?.url || "";
    const targetImage = currentStill?.url || "";

    try {
      setFeedbackSending(true);
      setFeedbackError(null);

      await fetch(`${API_BASE_URL}/feedback/like`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId,
          resultType: targetVideo ? "motion" : "image",
          platform: currentAspect.platformKey,
          prompt: lastStillPrompt || brief,
          comment,
          imageUrl: targetImage,
          videoUrl: targetVideo,
          sessionId,
        }),
      });

      setFeedbackText("");
    } catch (err: any) {
      setFeedbackError(err?.message || "Failed to send feedback.");
    } finally {
      setFeedbackSending(false);
    }
  };

  const handleDownloadCurrentStill = () => {
    const target = currentMotion?.url || currentStill?.url;
    if (!target) return;

    const a = document.createElement("a");
    a.href = target;
    const safePrompt =
      (lastStillPrompt || brief || "Mina-image")
        .replace(/[^a-z0-9]+/gi, "-")
        .toLowerCase()
        .slice(0, 80) || "mina-image";
    a.download = `Mina-v3-${safePrompt}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };
  // ========================================================================
  // [PART 11 END]
  // ========================================================================

  // ==============================================
// 12. UI helpers – aspect + uploads + logout
// ==============================================
const handleCycleAspect = () => {
  setAspectIndex((prev) => {
    const next = (prev + 1) % ASPECT_OPTIONS.length;
    setPlatform(ASPECT_OPTIONS[next].platformKey);
    return next;
  });
};

const openPanel = (key: PanelKey) => {
  setActivePanel((prev) => {
    if (prev === key) return null; // toggle close
    return key;
  });
};

const hoverSelectPanel = (key: PanelKey) => {
  // Only do hover-select when UI is visible (avoid weird "ghost" opening)
  if (!showPills) return;
  setActivePanel(key);
};

const capForPanel = (panel: UploadPanelKey) => {
  if (panel === "inspiration") return 4;
  return 1; // product + logo
};

const addFilesToPanel = (panel: UploadPanelKey, files: FileList) => {
  const max = capForPanel(panel);
  const incoming = Array.from(files).filter((f) => f.type.startsWith("image/"));
  if (!incoming.length) return;

  setUploads((prev) => {
    const existing = prev[panel];
    const remaining = Math.max(0, max - existing.length);
    const slice = incoming.slice(0, remaining);

    // product/logo should replace (only 1)
    const base = panel === "inspiration" ? existing : [];

    const nextItems: UploadItem[] = slice.map((file) => ({
      id: `${panel}_${Date.now()}_${Math.random().toString(16).slice(2)}`,
      url: URL.createObjectURL(file),
      kind: "file",
      file,
    }));

    return {
      ...prev,
      [panel]: [...base, ...nextItems].slice(0, max),
    };
  });
};

const addUrlToPanel = (panel: UploadPanelKey, url: string) => {
  const max = capForPanel(panel);

  setUploads((prev) => {
    const existing = prev[panel];

    // product/logo should replace (only 1)
    const base = panel === "inspiration" ? existing : [];

    const next: UploadItem = {
      id: `${panel}_url_${Date.now()}_${Math.random().toString(16).slice(2)}`,
      url,
      kind: "url",
    };

    return {
      ...prev,
      [panel]: [...base, next].slice(0, max),
    };
  });
};

const removeUploadItem = (panel: UploadPanelKey, id: string) => {
  setUploads((prev) => {
    const item = prev[panel].find((x) => x.id === id);
    if (item?.kind === "file" && item.url.startsWith("blob:")) {
      try {
        URL.revokeObjectURL(item.url);
      } catch {
        // ignore
      }
    }
    return {
      ...prev,
      [panel]: prev[panel].filter((x) => x.id !== id),
    };
  });
};

const moveUploadItem = (panel: UploadPanelKey, from: number, to: number) => {
  setUploads((prev) => {
    const arr = [...prev[panel]];
    if (from < 0 || to < 0 || from >= arr.length || to >= arr.length) return prev;
    const [moved] = arr.splice(from, 1);
    arr.splice(to, 0, moved);
    return { ...prev, [panel]: arr };
  });
};

const triggerPick = (panel: UploadPanelKey) => {
  if (panel === "product") productInputRef.current?.click();
  if (panel === "logo") logoInputRef.current?.click();
  if (panel === "inspiration") inspirationInputRef.current?.click();
};

const handleFileInput = (panel: UploadPanelKey, e: React.ChangeEvent<HTMLInputElement>) => {
  const files = e.target.files;
  if (files && files.length) addFilesToPanel(panel, files);
  e.target.value = "";
};

// Whole-page drag/drop + paste (silent, no big text)
useEffect(() => {
  if (uiStage === 0) return;

  const targetPanel: UploadPanelKey =
    activePanel === "logo" ? "logo" : activePanel === "inspiration" ? "inspiration" : "product";

  const onDragEnter = (e: DragEvent) => {
    if (!e.dataTransfer) return;
    if (!Array.from(e.dataTransfer.types || []).includes("Files")) return;
    e.preventDefault();
    dragDepthRef.current += 1;
    setGlobalDragging(true);
  };

  const onDragOver = (e: DragEvent) => {
    if (!e.dataTransfer) return;
    if (!Array.from(e.dataTransfer.types || []).includes("Files")) return;
    e.preventDefault();
  };

  const onDragLeave = (e: DragEvent) => {
    if (!e.dataTransfer) return;
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) setGlobalDragging(false);
  };

  const onDrop = (e: DragEvent) => {
    if (!e.dataTransfer) return;
    if (!Array.from(e.dataTransfer.types || []).includes("Files")) return;
    e.preventDefault();
    dragDepthRef.current = 0;
    setGlobalDragging(false);

    const files = e.dataTransfer.files;
    if (files && files.length) addFilesToPanel(targetPanel, files);
  };

  const onPaste = (e: ClipboardEvent) => {
    if (!e.clipboardData) return;

    // image paste
    const items = Array.from(e.clipboardData.items || []);
    const imgItem = items.find((it) => it.type && it.type.startsWith("image/"));
    if (imgItem) {
      const file = imgItem.getAsFile();
      if (file) {
        e.preventDefault();
        const list = {
          0: file,
          length: 1,
          item: (i: number) => (i === 0 ? file : null),
        } as unknown as FileList;
        addFilesToPanel(targetPanel, list);
        return;
      }
    }

    // url paste (silent)
    const text = e.clipboardData.getData("text/plain") || "";
    const url = extractFirstHttpUrl(text);
    if (url && /\.(png|jpe?g|webp|gif|avif)(\?.*)?$/i.test(url)) {
      e.preventDefault();
      addUrlToPanel(targetPanel, url);
    }
  };

  window.addEventListener("dragenter", onDragEnter);
  window.addEventListener("dragover", onDragOver);
  window.addEventListener("dragleave", onDragLeave);
  window.addEventListener("drop", onDrop);
  window.addEventListener("paste", onPaste);

  return () => {
    window.removeEventListener("dragenter", onDragEnter);
    window.removeEventListener("dragover", onDragOver);
    window.removeEventListener("dragleave", onDragLeave);
    window.removeEventListener("drop", onDrop);
    window.removeEventListener("paste", onPaste);
  };
}, [uiStage, activePanel]);

// Style hover-select + inline rename
const getStyleLabel = (key: string, fallback: string) =>
  (styleLabelOverrides[key] || fallback).trim() || fallback;

const beginRenameStyle = (key: string, currentLabel: string) => {
  setEditingStyleKey(key);
  setEditingStyleValue(currentLabel);
};

const commitRenameStyle = () => {
  if (!editingStyleKey) return;
  const next = editingStyleValue.trim();
  setStyleLabelOverrides((prev) => ({
    ...prev,
    [editingStyleKey]: next,
  }));
  setEditingStyleKey(null);
  setEditingStyleValue("");
};

const cancelRenameStyle = () => {
  setEditingStyleKey(null);
  setEditingStyleValue("");
};

const deleteCustomStyle = (key: string) => {
  setCustomStyles((prev) => prev.filter((s) => s.key !== key));
  setStyleLabelOverrides((prev) => {
    const copy = { ...prev };
    delete copy[key];
    return copy;
  });
  // if deleting selected, fall back to vintage
  if (stylePresetKey === key) setStylePresetKey("vintage");
};


  const handleChangeCustomer = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = customerIdInput.trim();
    if (!trimmed) return;
    setCustomerId(trimmed);
    setSessionId(null);
    setStillItems([]);
    setMotionItems([]);
  };

  const handleSignOut = async () => {
    try {
      await supabase.auth.signOut();
    } finally {
      if (typeof window !== "undefined") window.location.reload();
    }
  };

  const handleAnimateHeaderClick = async () => {
    if (!motionDescription.trim()) await handleSuggestMotion();
    await handleGenerateMotion();
  };

  const handleBriefChange = (value: string) => {
    setBrief(value);

    if (describeMoreTimeoutRef.current !== null) {
      window.clearTimeout(describeMoreTimeoutRef.current);
      describeMoreTimeoutRef.current = null;
    }

    setShowDescribeMore(false);

    const trimmedLength = value.trim().length;
    if (trimmedLength > 0 && trimmedLength < 20) {
      describeMoreTimeoutRef.current = window.setTimeout(() => setShowDescribeMore(true), 1200);
    }
  };
  // ========================================================================
  // [PART 12 END]
  // ========================================================================

  // ========================================================================
  // [PART 13 START] Custom styles (saved list + rename + delete)
  // ========================================================================
  const handleOpenCustomStylePanel = () => {
    setCustomStylePanelOpen(true);
    setCustomStyleError(null);
  };

  const handleCloseCustomStylePanel = () => {
    setCustomStylePanelOpen(false);
  };

  const handleCustomStyleFiles = (files: FileList | null) => {
    if (!files) return;

    const remainingSlots = Math.max(0, 10 - customStyleImages.length);
    if (!remainingSlots) return;

    const nextFiles = Array.from(files).slice(0, remainingSlots);
    const now = Date.now();

    const newItems: CustomStyleImage[] = nextFiles.map((file, index) => ({
      id: `${now}_${index}_${file.name}`,
      url: URL.createObjectURL(file),
      file,
    }));

    setCustomStyleImages((prev) => {
      const merged = [...prev, ...newItems];
      let nextHeroId = customStyleHeroId;
      if (!nextHeroId && merged.length) nextHeroId = merged[0].id;

      setCustomStyleHeroId(nextHeroId || null);

      const heroImage = merged.find((img) => img.id === nextHeroId) || merged[0];
      if (heroImage) {
        setCustomStyleHeroThumb((prevThumb) => {
          if (prevThumb && prevThumb.startsWith("blob:")) URL.revokeObjectURL(prevThumb);
          return heroImage.url;
        });
      }
      return merged;
    });
  };

  const handleCustomStyleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    handleCustomStyleFiles(e.target.files);
    e.target.value = "";
  };

  const handleCustomStyleUploadClick = () => {
    customStyleInputRef.current?.click();
  };

  const handleSelectCustomStyleHero = (id: string) => {
    setCustomStyleHeroId(id);
    const img = customStyleImages.find((item) => item.id === id);
    if (img) {
      setCustomStyleHeroThumb((prevThumb) => {
        if (prevThumb && prevThumb.startsWith("blob:")) URL.revokeObjectURL(prevThumb);
        return img.url;
      });
    }
  };

  const handleTrainCustomStyle = async () => {
  if (!customStyleImages.length || !customStyleHeroId) return;

  try {
    setCustomStyleTraining(true);
    setCustomStyleError(null);

    const hero = customStyleImages.find((x) => x.id === customStyleHeroId);
    if (!hero?.file) throw new Error("Pick a hero image.");

    // Persistable thumb (dataURL)
    const thumbUrl = await fileToDataUrl(hero.file);

    const newKey = `custom-${Date.now()}`;
    const newStyle: CustomStyle = {
      id: newKey,
      key: newKey,
      label: `Style ${customStyles.length + 1}`,
      thumbUrl,
      createdAt: new Date().toISOString(),
    };

    setCustomStyles((prev) => [newStyle, ...prev]);
    setStylePresetKey(newKey);

    // close modal
    setCustomStylePanelOpen(false);
  } catch (err: any) {
    setCustomStyleError(err?.message || "Unable to create style right now.");
  } finally {
    setCustomStyleTraining(false);
  }
};


  const handleRenameCustomPreset = (key: string) => {
    const preset = customPresets.find((p) => p.key === key);
    if (!preset) return;
    const next = window.prompt("Rename style", preset.label);
    if (!next) return;

    const updated = customPresets.map((p) => (p.key === key ? { ...p, label: next.trim() || p.label } : p));
    setCustomPresets(updated);
    saveCustomStyles(updated);
  };

  const handleDeleteCustomPreset = (key: string) => {
    const preset = customPresets.find((p) => p.key === key);
    if (!preset) return;
    const ok = window.confirm(`Delete "${preset.label}"?`);
    if (!ok) return;

    const updated = customPresets.filter((p) => p.key !== key);
    setCustomPresets(updated);
    saveCustomStyles(updated);

    if (stylePresetKey === key) {
      setStylePresetKey("vintage");
    }
  };
  // ========================================================================
  // [PART 13 END]
  // ========================================================================

  // ========================================================================
  // [PART 14 START] Render – LEFT side (Input1 + pills + panels + style + Input3)
  // ========================================================================
  const renderUploadPanel = (panel: UploadPanelKey) => {
    const items = getPanelItems(panel);
    const limit = PANEL_LIMITS[panel];
    const title =
      panel === "product" ? "Add your product" : panel === "logo" ? "Add your logo" : "Add inspiration";

    const showAddSquare = items.length < limit;

    return (
      <div className="studio-step visible">
        <div className="studio-style-title" style={{ cursor: "default", textDecoration: "none" }}>
          {title}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
          <button type="button" className="link-button" onClick={() => openFilePickerForPanel(panel)}>
            Browse
          </button>
          <button type="button" className="link-button subtle" onClick={() => promptPasteLinkForPanel(panel)}>
            Paste https link
          </button>
          <span style={{ fontSize: 11, opacity: 0.55 }}>
            Drag & drop anywhere on the page (or paste an image).
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          {items.map((it, idx) => (
            <button
              key={it.id}
              type="button"
              title="Click to delete"
              style={{
                width: 64,
                height: 64,
                border: "1px solid rgba(8,10,0,0.16)",
                background: "rgba(8,10,0,0.04)",
                overflow: "hidden",
                padding: 0,
              }}
              onClick={() => removePanelItem(panel, it.id)}
              draggable={limit > 1}
              onDragStart={() => {
                dragThumbRef.current = { panel, index: idx };
              }}
              onDragOver={(e) => {
                if (limit <= 1) return;
                e.preventDefault();
              }}
              onDrop={(e) => {
                if (limit <= 1) return;
                e.preventDefault();
                const src = dragThumbRef.current;
                if (!src || src.panel !== panel) return;
                reorderPanelItems(panel, src.index, idx);
                dragThumbRef.current = null;
              }}
            >
              <img
                src={it.url}
                alt=""
                style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
              />
            </button>
          ))}

          {showAddSquare && (
            <button
              type="button"
              title="Add image"
              style={{
                width: 64,
                height: 64,
                border: "1px dashed rgba(8,10,0,0.35)",
                background: "rgba(8,10,0,0.02)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 18,
                fontWeight: 600,
              }}
              onClick={() => openFilePickerForPanel(panel)}
            >
              +
            </button>
          )}
        </div>
      </div>
    );
  };

  const renderStyleStep = () => {
    if (!showPills || !styleStepOpen) return null;

    return (
      <div className="studio-step visible">
        <button type="button" className="studio-style-title" onClick={() => setStyleStepOpen(false)}>
          Pick one editorial style
        </button>

        <div className="studio-style-row">
          {STYLE_PRESETS.map((preset) => (
            <button
              key={preset.key}
              type="button"
              className={classNames("studio-style-card", stylePresetKey === preset.key && "active")}
              onClick={() => setStylePresetKey(preset.key)}
            >
              <div className="studio-style-thumb">
                <img src={preset.thumb} alt="" />
              </div>
              <div className="studio-style-label">{preset.label}</div>
            </button>
          ))}

          {/* Custom saved presets */}
          {customPresets.map((p) => (
            <button
              key={p.key}
              type="button"
              className={classNames("studio-style-card", stylePresetKey === p.key && "active")}
              onClick={() => setStylePresetKey(p.key)}
              onDoubleClick={() => handleDeleteCustomPreset(p.key)} // your request: double click delete
              title="Double click to delete"
            >
              <div className="studio-style-thumb">
                <img src={p.thumbDataUrl} alt="" />
              </div>
              <div
                className="studio-style-label"
                onClick={(e) => {
                  e.stopPropagation();
                  handleRenameCustomPreset(p.key); // your request: click name to rename
                }}
                title="Click to rename"
              >
                {p.label}
              </div>
            </button>
          ))}

          {/* Create style */}
          <button
            type="button"
            className={classNames("studio-style-card", "add")}
            onClick={handleOpenCustomStylePanel}
          >
            <div className="studio-style-thumb">
              <span>+</span>
            </div>
            <div className="studio-style-label">Create style</div>
          </button>
        </div>
      </div>
    );
  };

  const renderInput3Always = () => {
    return (
      <div style={{ marginTop: 14 }}>
        <div className="studio-style-divider" />

        <button type="button" className="studio-vision-toggle" onClick={() => setMinaVisionEnabled((prev) => !prev)}>
          Mina Vision Intelligence:{" "}
          <span className="studio-vision-state">{minaVisionEnabled ? "ON" : "OFF"}</span>
        </button>

        <div className="studio-create-block">
          <button
            type="button"
            className={classNames("studio-create-link", !canCreateStill && "disabled")}
            disabled={!canCreateStill}
            onClick={handleGenerateStill}
          >
            {stillGenerating ? "Creating…" : "Create"}
          </button>
        </div>

        <div className="studio-credits-small">
          {creditsLoading ? (
            "Checking credits…"
          ) : credits ? (
            <>
              Credits: {credits.balance} (img −{imageCost} · motion −{motionCost})
            </>
          ) : null}
        </div>

        {stillError && <div className="error-text">{stillError}</div>}
      </div>
    );
  };

  const renderStudioLeft = () => {
  // pills are text-only (+ / ✓), except ratio pill keeps its icon
  const pillBaseStyle = (index: number): React.CSSProperties => ({
    transitionDelay: showPills ? `${index * 55}ms` : "0ms",
  });

  const plusOrTick = (n: number) => (n > 0 ? "✓" : "+");

  const allStyleCards: Array<{
    key: string;
    label: string;
    thumb: string;
    isCustom: boolean;
  }> = [
    ...STYLE_PRESETS.map((p) => ({
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

  return (
    <div className={classNames("studio-left", globalDragging && "drag-active")}>
      <div className="studio-left-main">
        {/* Input 1 */}
        <div className="studio-input1-block">
          {/* Pills slot (staggered + smooth) */}
          <div className="studio-pills-slot">
            <div className={classNames("studio-row", "studio-row--pills", "mina-slide", !showPills && "hidden")}>
              {/* Product */}
              <button
                type="button"
                className={classNames("studio-pill", activePanel === "product" && "active")}
                style={pillBaseStyle(0)}
                onMouseEnter={() => hoverSelectPanel("product")}
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
                onMouseEnter={() => hoverSelectPanel("logo")}
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
                onMouseEnter={() => hoverSelectPanel("inspiration")}
                onClick={() => openPanel("inspiration")}
              >
                <span className="studio-pill-main">Inspiration</span>
                <span aria-hidden="true">{plusOrTick(inspirationCount)}</span>
              </button>

              {/* Style (same system as others — NOT an extra step) */}
              <button
                type="button"
                className={classNames("studio-pill", activePanel === "style" && "active")}
                style={pillBaseStyle(3)}
                onMouseEnter={() => hoverSelectPanel("style")}
                onClick={() => openPanel("style")}
              >
                <span className="studio-pill-main">Style</span>
                <span aria-hidden="true">✓</span>
              </button>

              {/* Ratio (keeps icon) */}
              <button
                type="button"
                className={classNames("studio-pill", "studio-pill--aspect")}
                style={pillBaseStyle(4)}
                onClick={handleCycleAspect}
              >
                <span className="studio-pill-icon">
                  <img
                    src={ASPECT_ICON_URLS[currentAspect.key]}
                    alt=""
                  />
                </span>
                <span className="studio-pill-main">{currentAspect.label}</span>
                <span className="studio-pill-sub">{currentAspect.subtitle}</span>
              </button>
            </div>
          </div>

          {/* Textarea (state zero shows only this) */}
          <div className="studio-brief-block">
            <div
              className={classNames(
                "studio-brief-shell",
                briefHintVisible && "has-brief-hint"
              )}
              ref={briefShellRef}
              onScroll={handleBriefScroll}
            >
              <textarea
                className="studio-brief-input"
                placeholder="Describe how you want your still life image to look like"
                value={brief}
                onChange={(e) => handleBriefChange(e.target.value)}
                rows={4}
              />
              {briefHintVisible && (
                <div className="studio-brief-hint">Describe more</div>
              )}
            </div>
          </div>
        </div>

        {/* Panels (smooth open/close, no jumps) */}
        <div className={classNames("mina-slide", !showPanels && "hidden")}>
          <Collapse open={activePanel === "product"} delayMs={80}>
            <div className="studio-panel">
              <div className="studio-panel-title">Add your product</div>

              <button
                type="button"
                className="studio-plusbox"
                onClick={() => triggerPick("product")}
              >
                {uploads.product.length ? null : <span aria-hidden="true">+</span>}
              </button>

              {!!uploads.product.length && (
                <div className="studio-thumbs">
                  {uploads.product.map((it) => (
                    <button
                      key={it.id}
                      type="button"
                      className="studio-thumb"
                      onClick={() => removeUploadItem("product", it.id)}
                      title="Click to delete"
                    >
                      <img src={it.url} alt="" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          </Collapse>

          <Collapse open={activePanel === "logo"} delayMs={110}>
            <div className="studio-panel">
              <div className="studio-panel-title">Add your logo</div>

              <button
                type="button"
                className="studio-plusbox"
                onClick={() => triggerPick("logo")}
              >
                {uploads.logo.length ? null : <span aria-hidden="true">+</span>}
              </button>

              {!!uploads.logo.length && (
                <div className="studio-thumbs">
                  {uploads.logo.map((it) => (
                    <button
                      key={it.id}
                      type="button"
                      className="studio-thumb"
                      onClick={() => removeUploadItem("logo", it.id)}
                      title="Click to delete"
                    >
                      <img src={it.url} alt="" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          </Collapse>

          <Collapse open={activePanel === "inspiration"} delayMs={140}>
            <div className="studio-panel">
              <div className="studio-panel-title">Add inspiration</div>

              <button
                type="button"
                className="studio-plusbox"
                onClick={() => triggerPick("inspiration")}
              >
                {uploads.inspiration.length >= 4 ? null : <span aria-hidden="true">+</span>}
              </button>

              {!!uploads.inspiration.length && (
                <div className="studio-thumbs">
                  {uploads.inspiration.map((it, idx) => (
                    <button
                      key={it.id}
                      type="button"
                      className="studio-thumb"
                      draggable
                      onDragStart={() => {
                        // store index in dataset
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
                      <img src={it.url} alt="" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          </Collapse>

          <Collapse open={activePanel === "style"} delayMs={170}>
            <div className="studio-panel">
              <div className="studio-panel-title">Pick a style</div>

              <div className="studio-style-row">
                {allStyleCards.map((s) => (
                  <button
                    key={s.key}
                    type="button"
                    className={classNames(
                      "studio-style-card",
                      stylePresetKey === s.key && "active"
                    )}
                    onMouseEnter={() => setStylePresetKey(s.key)}
                    onClick={() => setStylePresetKey(s.key)}
                  >
                    <div className="studio-style-thumb">
                      <img src={s.thumb} alt="" />
                    </div>

                    {/* Inline rename (no new panel) */}
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
                          style={{ width: 90 }}
                        />
                      ) : (
                        s.label
                      )}
                    </div>
                  </button>
                ))}

                {/* Create style (opens modal) */}
                <button
                  type="button"
                  className={classNames("studio-style-card", "add")}
                  onMouseEnter={() => {}}
                  onClick={handleOpenCustomStylePanel}
                >
                  <div className="studio-style-thumb">
                    <span aria-hidden="true">+</span>
                  </div>
                  <div className="studio-style-label">Create style</div>
                </button>
              </div>
            </div>
          </Collapse>
        </div>

        {/* Input 3 (always after typing starts; smooth) */}
        <div className={classNames("mina-slide", !showControls && "hidden")}>
          <button
            type="button"
            className="studio-vision-toggle"
            onClick={() => setMinaVisionEnabled((prev) => !prev)}
          >
            Mina Vision Intelligence:{" "}
            <span className="studio-vision-state">
              {minaVisionEnabled ? "ON" : "OFF"}
            </span>
          </button>

          <div className="studio-create-block">
            <button
              type="button"
              className={classNames("studio-create-link", !canCreateStill && "disabled")}
              disabled={!canCreateStill}
              onClick={handleGenerateStill}
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

      {/* Profile button: bottom-left, no underline (CSS will handle) */}
      <button
        type="button"
        className="studio-profile-float"
        onClick={() => setActiveTab("profile")}
      >
        Profile
      </button>
    </div>
  );
};

  // ========================================================================
  // [PART 14 END]
  // ========================================================================

  // ========================================================================
  // [PART 15 START] Render – RIGHT side (unchanged logic)
  // ========================================================================
  const renderStudioRight = () => {
    const isEmpty = !currentStill && !currentMotion;

    if (isEmpty) {
      return (
        <div className="studio-right studio-right--full">
          <div className="studio-output-main studio-output-main--empty">
            <div className="studio-output-frame">
              <div className="output-placeholder">
                New ideas don’t actually exist, just recycle.
              </div>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="studio-right">
        <div className="studio-output-main">
          <button
            type="button"
            className="studio-output-click"
            onClick={handleDownloadCurrentStill}
            disabled={!currentStill && !currentMotion}
          >
            <div className="studio-output-frame">
              {currentMotion ? (
                <video
                  className="studio-output-media"
                  src={currentMotion.url}
                  autoPlay
                  loop
                  muted
                  controls
                />
              ) : currentStill ? (
                <img className="studio-output-media" src={currentStill.url} alt="" />
              ) : (
                <div className="output-placeholder">New ideas don’t actually exist, just recycle.</div>
              )}
            </div>
          </button>

          {stillItems.length > 1 && (
            <div className="studio-dots-row">
              {stillItems.map((item, idx) => (
                <button
                  key={item.id}
                  type="button"
                  className={classNames("studio-dot", idx === stillIndex && "active")}
                  onClick={() => setStillIndex(idx)}
                />
              ))}
            </div>
          )}

          <div className="studio-motion-helpers">
            <button
              type="button"
              className="link-button subtle"
              onClick={handleSuggestMotion}
              disabled={!currentStill || motionSuggestLoading}
            >
              {motionSuggestLoading ? "Thinking about motion…" : "Suggest motion"}
            </button>
            {motionSuggestError && <span className="error-text">{motionSuggestError}</span>}
            {motionError && <span className="error-text">{motionError}</span>}
          </div>

          {motionDescription && (
            <div className="studio-motion-description">
              {motionDescription}
              {" — "}
              <button
                type="button"
                className="link-button subtle"
                onClick={handleGenerateMotion}
                disabled={motionGenerating}
              >
                {motionGenerating ? "Animating…" : "Animate"}
              </button>
            </div>
          )}

          <div className="studio-feedback-row">
            <div className="studio-feedback-hint">
              Speak to me, tell me what you like and dislike about my generation
            </div>
            <input
              className="studio-feedback-input"
              placeholder="Type feedback..."
              value={feedbackText}
              onChange={(e) => setFeedbackText(e.target.value)}
            />
            <button
              type="button"
              className="link-button"
              onClick={handleSubmitFeedback}
              disabled={feedbackSending}
            >
              {feedbackSending ? "Sending…" : "Send"}
            </button>
          </div>

          {feedbackError && <div className="error-text">{feedbackError}</div>}
        </div>
      </div>
    );
  };
  // ========================================================================
  // [PART 15 END]
  // ========================================================================

  // ========================================================================
  // [PART 16 START] Render – Custom style modal (blur handled in CSS)
  // ========================================================================
  const renderCustomStyleModal = () => {
    if (!customStylePanelOpen) return null;

    return (
      <div className="mina-modal-backdrop" onClick={handleCloseCustomStylePanel}>
        <div className="mina-modal" onClick={(e) => e.stopPropagation()}>
          <div className="mina-modal-header">
            <div>Create a style</div>
            <button type="button" className="mina-modal-close" onClick={handleCloseCustomStylePanel}>
              Close
            </button>
          </div>

          <div
            className="mina-modal-drop"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              handleCustomStyleFiles(e.dataTransfer.files);
            }}
          >
            <div className="mina-modal-drop-main">
              <button type="button" className="link-button" onClick={handleCustomStyleUploadClick}>
                Upload images
              </button>
              <span>(up to 10)</span>
            </div>
            <div className="mina-modal-drop-help">Drop up to 10 reference images and pick one as hero.</div>

            <input
              ref={customStyleInputRef}
              type="file"
              accept="image/*"
              multiple
              style={{ display: "none" }}
              onChange={handleCustomStyleInputChange}
            />
          </div>

          {customStyleImages.length > 0 && (
            <div className="mina-modal-grid">
              {customStyleImages.map((img) => (
                <button
                  key={img.id}
                  type="button"
                  className={classNames("mina-modal-thumb", customStyleHeroId === img.id && "hero")}
                  onClick={() => handleSelectCustomStyleHero(img.id)}
                >
                  <img src={img.url} alt="" />
                  {customStyleHeroId === img.id && <div className="mina-modal-thumb-tag">Hero</div>}
                </button>
              ))}
            </div>
          )}

          <div className="mina-modal-footer">
            {customStyleError && <div className="error-text">{customStyleError}</div>}
            <button
              type="button"
              className="mina-modal-train"
              onClick={handleTrainCustomStyle}
              disabled={!customStyleImages.length || !customStyleHeroId || customStyleTraining}
            >
              {customStyleTraining ? "Creating…" : "Create style"}
            </button>
          </div>
        </div>
      </div>
    );
  };
  // ========================================================================
  // [PART 16 END]
  // ========================================================================

  // ========================================================================
  // [PART 17 START] Profile body (unchanged)
  // ========================================================================
  const renderProfileBody = () => (
    <div className="studio-profile-body">
      <div className="studio-profile-left">
        <h2>Profile</h2>

        <div className="profile-row">
          <div className="profile-label">Customer ID</div>
          <form onSubmit={handleChangeCustomer} className="profile-inline-form">
            <input
              className="profile-input"
              value={customerIdInput}
              onChange={(e) => setCustomerIdInput(e.target.value)}
            />
            <button type="submit" className="link-button primary-button">
              Switch
            </button>
          </form>
        </div>

        <div className="profile-row">
          <div className="profile-label">Credits</div>
          <div className="profile-value">{credits ? credits.balance : "—"}</div>
        </div>

        <div className="profile-row">
          <a href={TOPUP_URL} target="_blank" rel="noreferrer" className="link-button primary-button">
            Add credits
          </a>
        </div>

        <div className="profile-row">
          <button type="button" className="link-button subtle" onClick={handleSignOut}>
            Sign out
          </button>
        </div>

        <div className="profile-row small">
          <button type="button" className="link-button subtle" onClick={() => setActiveTab("studio")}>
            ← Back to studio
          </button>
        </div>
      </div>

      <div className="studio-profile-right">
        <h3>Recent generations</h3>
        {historyLoading && <div>Loading history…</div>}
        {historyError && <div className="error-text">{historyError}</div>}
        {!historyLoading && !historyGenerations.length && <div>No history yet.</div>}

        <div className="profile-history-grid">
          {historyGenerations.map((g) => (
            <a
              key={g.id}
              href={g.outputUrl}
              target="_blank"
              rel="noreferrer"
              className="profile-history-card"
            >
              <div className="profile-history-thumb" />
              <div className="profile-history-meta">
                <div className="profile-history-type">{g.type}</div>
                <div className="profile-history-time">{formatTime(g.createdAt)}</div>
              </div>
            </a>
          ))}
        </div>
      </div>
    </div>
  );
  // ========================================================================
  // [PART 17 END]
  // ========================================================================

  // ========================================================================
  // [PART 18 START] Final layout
  // ========================================================================
  return (
    <div className="mina-studio-root">
      <div className="studio-frame">
        <div className="studio-header-overlay">
          <div className="studio-header-left">
            <a href="https://mina.faltastudio.com" className="studio-logo-link">
              Mina
            </a>
          </div>

          <div className="studio-header-center">
            {activeTab === "studio" ? "Still life images" : "Profile"}
          </div>

          <div className="studio-header-right">
            {activeTab === "studio" && (
              <>
                <button
                  type="button"
                  className="link-button"
                  onClick={handleAnimateHeaderClick}
                  disabled={!currentStill || motionGenerating || (!motionDescription && motionSuggestLoading)}
                >
                  Animate this
                </button>
                <button
                  type="button"
                  className="link-button"
                  onClick={handleLikeCurrentStill}
                  disabled={!currentStill}
                >
                  ♡ more of this
                </button>
                <button
                  type="button"
                  className="link-button"
                  onClick={handleDownloadCurrentStill}
                  disabled={!currentStill && !currentMotion}
                >
                  Download
                </button>
              </>
            )}

            {activeTab === "profile" && (
              <button type="button" className="link-button subtle" onClick={() => setActiveTab("studio")}>
                Back to studio
              </button>
            )}
          </div>
        </div>

        {activeTab === "studio" ? (
          <div className={classNames("studio-body", "studio-body--two-col")}>
            {renderStudioLeft()}
            {renderStudioRight()}
          </div>
        ) : (
          renderProfileBody()
        )}
      </div>

      {renderCustomStyleModal()}
    </div>
  );
  // ========================================================================
  // [PART 18 END]
  // ========================================================================
};

export default MinaApp;
// ============================================================================
// [PART 4 END] Component
// ============================================================================
