// src/MinaApp.tsx
// =============================================================
// CHAPTER 1 — Imports & environment
// =============================================================
import React, { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "./lib/supabaseClient";

const API_BASE_URL =
  import.meta.env.VITE_MINA_API_BASE_URL ||
  "https://mina-editorial-ai-api.onrender.com";

const TOPUP_URL =
  import.meta.env.VITE_MINA_TOPUP_URL ||
  "https://www.faltastudio.com/checkouts/cn/hWN6EhbqQW5KrdIuBO3j5HKV/en-ae?_r=AQAB9NY_ccOV_da3y7VmTxJU-dDoLEOCdhP9sg2YlvDwLQQ";

// =============================================================
// CHAPTER 2 — Types
// =============================================================
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
  url: string;
  file: File;
};

type AspectKey = "9-16" | "3-4" | "2-3" | "1-1";

type AspectOption = {
  key: AspectKey;
  ratio: string;
  label: string;
  subtitle: string;
  platformKey: string;
};

type UploadPanelKey = "product" | "logo" | "inspiration" | "style";

type UploadItem = {
  id: string;
  url: string;
  createdAt: string;
  source: "file" | "url";
  file?: File;
};

type MinaAppProps = {
  initialCustomerId?: string;
};

// =============================================================
// CHAPTER 3 — Constants & helpers
// =============================================================
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

const GENERIC_PILL_ICON_URL =
  "https://cdn.shopify.com/s/files/1/0678/9254/3571/files/square_icon_901d47a8-44a8-4ab9-b412-2224e97fd9d9.svg?v=1765425956";

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

  if (initialCustomerId && initialCustomerId.trim().length > 0) {
    return initialCustomerId.trim();
  }

  return "anonymous";
}

function persistCustomerId(id: string) {
  try {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("minaCustomerId", id);
    }
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

function classNames(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

function isProbablyImageUrl(url: string): boolean {
  const u = url.trim();
  if (!u) return false;
  if (/^data:image\//i.test(u)) return true;
  if (!/^https?:\/\//i.test(u)) return false;
  // allow common image extensions OR a CDN url without extension
  return (
    /\.(png|jpe?g|webp|gif|avif|svg)(\?.*)?$/i.test(u) ||
    /cdn|shopify|cloudinary|img|image|assets/i.test(u)
  );
}

function isForwardableToApi(url: string): boolean {
  const u = url.trim();
  // Keep this strict so you don’t accidentally forward blob: to backend
  return /^https?:\/\//i.test(u) || /^data:image\//i.test(u);
}

function revokeIfBlob(url: string) {
  if (typeof url === "string" && url.startsWith("blob:")) {
    try {
      URL.revokeObjectURL(url);
    } catch {
      // ignore
    }
  }
}

// =============================================================
// CHAPTER 4 — Component
// =============================================================
const MinaApp: React.FC<MinaAppProps> = ({ initialCustomerId }) => {
  // ===========================================================
  // CHAPTER 4.1 — Global tab + customer
  // ===========================================================
  const [activeTab, setActiveTab] = useState<"studio" | "profile">("studio");
  const [customerId, setCustomerId] = useState<string>(() =>
    getInitialCustomerId(initialCustomerId)
  );
  const [customerIdInput, setCustomerIdInput] = useState<string>(customerId);

  // ===========================================================
  // CHAPTER 4.2 — Health / credits / session
  // ===========================================================
  const [health, setHealth] = useState<HealthState | null>(null);
  const [checkingHealth, setCheckingHealth] = useState(false);

  const [credits, setCredits] = useState<CreditsState | null>(null);
  const [creditsLoading, setCreditsLoading] = useState(false);

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionTitle, setSessionTitle] = useState("Mina Studio session");

  // ===========================================================
  // CHAPTER 4.3 — Studio: brief + pills + accordions
  // ===========================================================
  const [brief, setBrief] = useState("");
  const [tone] = useState("Poetic");
  const [aspectIndex, setAspectIndex] = useState(0);

  // Pills open one panel at a time: product/logo/inspiration/style
  const [openPanel, setOpenPanel] = useState<UploadPanelKey | null>(null);

  // Upload collections (multiple images per panel)
  const [productImages, setProductImages] = useState<UploadItem[]>([]);
  const [logoImages, setLogoImages] = useState<UploadItem[]>([]);
  const [inspirationImages, setInspirationImages] = useState<UploadItem[]>([]);

  // Dropzone visual feedback
  const [draggingPanel, setDraggingPanel] = useState<UploadPanelKey | null>(
    null
  );

  // Style step state (still your original behavior)
  const [stylePresetKey, setStylePresetKey] = useState<string>("vintage");
  const [minaVisionEnabled, setMinaVisionEnabled] = useState(true);
  const [stylesCollapsed, setStylesCollapsed] = useState(false);

  // ===========================================================
  // CHAPTER 4.4 — Output state
  // ===========================================================
  const [stillItems, setStillItems] = useState<StillItem[]>([]);
  const [stillIndex, setStillIndex] = useState(0);
  const [stillGenerating, setStillGenerating] = useState(false);
  const [stillError, setStillError] = useState<string | null>(null);
  const [lastStillPrompt, setLastStillPrompt] = useState<string>("");

  const [motionItems, setMotionItems] = useState<MotionItem[]>([]);
  const [motionIndex, setMotionIndex] = useState(0);
  const [motionDescription, setMotionDescription] = useState("");
  const [motionSuggestLoading, setMotionSuggestLoading] = useState(false);
  const [motionSuggestError, setMotionSuggestError] = useState<string | null>(
    null
  );
  const [motionGenerating, setMotionGenerating] = useState(false);
  const [motionError, setMotionError] = useState<string | null>(null);

  const [feedbackText, setFeedbackText] = useState("");
  const [feedbackSending, setFeedbackSending] = useState(false);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);

  // ===========================================================
  // CHAPTER 4.5 — History (profile)
  // ===========================================================
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historyGenerations, setHistoryGenerations] = useState<
    GenerationRecord[]
  >([]);
  const [historyFeedbacks, setHistoryFeedbacks] = useState<FeedbackRecord[]>(
    []
  );

  // ===========================================================
  // CHAPTER 4.6 — Refs: file inputs + brief scroll
  // ===========================================================
  const productInputRef = useRef<HTMLInputElement | null>(null);
  const logoInputRef = useRef<HTMLInputElement | null>(null);
  const inspirationInputRef = useRef<HTMLInputElement | null>(null);

  const briefShellRef = useRef<HTMLDivElement | null>(null);

  // “Describe more” hint logic (keep your existing behavior)
  const [showDescribeMore, setShowDescribeMore] = useState(false);
  const describeMoreTimeoutRef = useRef<number | null>(null);

  // thumbnail drag reorder
  const draggingThumbRef = useRef<{ panel: UploadPanelKey; id: string } | null>(
    null
  );

  // ===========================================================
  // CHAPTER 5 — Derived values
  // ===========================================================
  const briefLength = brief.trim().length;

  // IMPORTANT: pills show only after 10 characters (your request)
  const showPills = briefLength >= 10;

  const currentAspect = ASPECT_OPTIONS[aspectIndex];

  const currentStill: StillItem | null =
    stillItems[stillIndex] || stillItems[0] || null;

  const currentMotion: MotionItem | null =
    motionItems[motionIndex] || motionItems[0] || null;

  const imageCost = credits?.meta?.imageCost ?? 1;
  const motionCost = credits?.meta?.motionCost ?? 5;

  const canCreateStill = briefLength >= 40 && !stillGenerating;

  const productHas = productImages.length > 0;
  const logoHas = logoImages.length > 0;
  const inspirationHas = inspirationImages.length > 0;

  // ===========================================================
  // CHAPTER 6 — Effects (bootstrap + cleanup)
  // ===========================================================
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

  // if pills are hidden (brief < 10), close any open accordion
  useEffect(() => {
    if (!showPills && openPanel !== null) {
      setOpenPanel(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showPills]);

  // cleanup timers
  useEffect(() => {
    return () => {
      if (describeMoreTimeoutRef.current !== null) {
        window.clearTimeout(describeMoreTimeoutRef.current);
      }
    };
  }, []);

  // cleanup blob URLs on unmount
  useEffect(() => {
    return () => {
      productImages.forEach((i) => revokeIfBlob(i.url));
      logoImages.forEach((i) => revokeIfBlob(i.url));
      inspirationImages.forEach((i) => revokeIfBlob(i.url));
    };
    // only on unmount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ===========================================================
  // CHAPTER 7 — API helpers
  // ===========================================================
  const handleCheckHealth = async () => {
    if (!API_BASE_URL) return;
    try {
      setCheckingHealth(true);
      const res = await fetch(`${API_BASE_URL}/health`);
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        message?: string;
      };
      setHealth({
        ok: json.ok ?? false,
        message: json.message ?? "",
      });
    } catch (err: any) {
      setHealth({
        ok: false,
        message: err?.message || "Unable to reach Mina.",
      });
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
      const json = (await res.json()) as {
        balance: number;
        meta?: { imageCost: number; motionCost: number };
      };
      setCredits({
        balance: json.balance,
        meta: json.meta,
      });
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
      const json = (await res.json()) as {
        ok: boolean;
        session?: { id: string; title?: string };
      };
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
      const res = await fetch(
        `${API_BASE_URL}/history/customer/${encodeURIComponent(customerId)}`
      );
      if (!res.ok) throw new Error(`Status ${res.status}`);
      const json = (await res.json()) as HistoryResponse;
      if (!json.ok) throw new Error("History error");

      setCredits((prev) => ({
        balance: json.credits.balance,
        meta: prev?.meta,
      }));
      setHistoryGenerations(json.generations || []);
      setHistoryFeedbacks(json.feedbacks || []);
    } catch (err: any) {
      setHistoryError(err?.message || "Unable to load history.");
    } finally {
      setHistoryLoading(false);
    }
  };

  // ===========================================================
  // CHAPTER 8 — Still generation (with safe aspect + safe image forwarding)
  // ===========================================================
  const handleGenerateStill = async () => {
    const trimmed = brief.trim();
    if (trimmed.length < 40) return;

    if (!API_BASE_URL) {
      setStillError("Missing API base URL (VITE_MINA_API_BASE_URL).");
      return;
    }

    const sid = await ensureSession();
    if (!sid) {
      setStillError("Could not start Mina session.");
      return;
    }

    try {
      setStillGenerating(true);
      setStillError(null);

      const safeAspectRatio =
        REPLICATE_ASPECT_RATIO_MAP[currentAspect.ratio] || "1:1";

      // only forward URLs that the backend can actually fetch
      const productUrl = productImages
        .map((x) => x.url)
        .find((u) => isForwardableToApi(u));

      const inspirationUrls = inspirationImages
        .map((x) => x.url)
        .filter((u) => isForwardableToApi(u))
        .slice(0, 10);

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
        stylePresetKey,
        aspectRatio: safeAspectRatio,
      };

      if (productUrl) payload.productImageUrl = productUrl;
      if (inspirationUrls.length) payload.styleImageUrls = inspirationUrls;

      const res = await fetch(`${API_BASE_URL}/editorial/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => null);
        const msg =
          errJson?.message ||
          `Error ${res.status}: Failed to generate editorial still.`;
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

      // FIX: set index to the actual last item (prevents dots bug)
      setStillItems((prev) => {
        const next = [...prev, item];
        setStillIndex(next.length - 1);
        return next;
      });

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

  // ===========================================================
  // CHAPTER 9 — Motion (suggest + generate)
  // ===========================================================
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
          stylePresetKey,
        }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => null);
        const msg =
          errJson?.message ||
          `Error ${res.status}: Failed to suggest motion.`;
        throw new Error(msg);
      }

      const data = (await res.json()) as MotionSuggestResponse;
      if (data.suggestion) {
        setMotionDescription(data.suggestion);
      }
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
          stylePresetKey,
        }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => null);
        const msg =
          errJson?.message ||
          `Error ${res.status}: Failed to generate motion.`;
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

      // FIX: set index to last item (same dots issue but for motion)
      setMotionItems((prev) => {
        const next = [...prev, item];
        setMotionIndex(next.length - 1);
        return next;
      });
    } catch (err: any) {
      setMotionError(err?.message || "Unexpected error generating motion.");
    } finally {
      setMotionGenerating(false);
    }
  };

  // ===========================================================
  // CHAPTER 10 — Feedback / like / download
  // ===========================================================
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

  // ===========================================================
  // CHAPTER 11 — UI helpers (aspect + panels + brief hint)
  // ===========================================================
  const handleCycleAspect = () => {
    setAspectIndex((prev) => (prev + 1) % ASPECT_OPTIONS.length);
  };

  const togglePanel = (key: UploadPanelKey) => {
    if (!showPills) return;
    setOpenPanel((prev) => (prev === key ? null : key));
    if (key === "style") {
      // keep your old UX: when opening style panel, start expanded
      setStylesCollapsed(false);
    }
  };

  const handleBriefScroll = () => {
    // fade is handled via CSS mask on .studio-brief-shell
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
      describeMoreTimeoutRef.current = window.setTimeout(() => {
        setShowDescribeMore(true);
      }, 1200);
    }
  };

  // ===========================================================
  // CHAPTER 12 — Upload helpers (add / remove / reorder / paste)
  // ===========================================================
  const getPanelList = (panel: UploadPanelKey): UploadItem[] => {
    if (panel === "product") return productImages;
    if (panel === "logo") return logoImages;
    if (panel === "inspiration") return inspirationImages;
    return [];
  };

  const setPanelList = (panel: UploadPanelKey, next: UploadItem[]) => {
    if (panel === "product") return setProductImages(next);
    if (panel === "logo") return setLogoImages(next);
    if (panel === "inspiration") return setInspirationImages(next);
  };

  const addFilesToPanel = (panel: UploadPanelKey, files: FileList | File[]) => {
    if (panel === "style") return;
    const arr = Array.from(files || []);
    if (!arr.length) return;

    const now = Date.now();
    const toAdd: UploadItem[] = arr
      .filter((f) => /^image\//i.test(f.type))
      .map((file, idx) => ({
        id: `${panel}_${now}_${idx}_${file.name}`,
        url: URL.createObjectURL(file),
        file,
        source: "file",
        createdAt: new Date().toISOString(),
      }));

    if (!toAdd.length) return;

    setPanelList(panel, [...getPanelList(panel), ...toAdd]);
  };

  const addUrlToPanel = (panel: UploadPanelKey, urlRaw: string) => {
    if (panel === "style") return;
    const url = urlRaw.trim();
    if (!isProbablyImageUrl(url)) return;

    const item: UploadItem = {
      id: `${panel}_url_${Date.now()}_${Math.random().toString(16).slice(2)}`,
      url,
      source: "url",
      createdAt: new Date().toISOString(),
    };

    setPanelList(panel, [...getPanelList(panel), item]);
  };

  const removeItemFromPanel = (panel: UploadPanelKey, id: string) => {
    if (panel === "style") return;
    const list = getPanelList(panel);
    const target = list.find((x) => x.id === id);
    if (target) revokeIfBlob(target.url);
    setPanelList(
      panel,
      list.filter((x) => x.id !== id)
    );
  };

  const reorderWithinPanel = (panel: UploadPanelKey, fromId: string, toId: string) => {
    if (panel === "style") return;
    if (fromId === toId) return;

    const list = getPanelList(panel);
    const fromIndex = list.findIndex((x) => x.id === fromId);
    const toIndex = list.findIndex((x) => x.id === toId);
    if (fromIndex === -1 || toIndex === -1) return;

    const next = [...list];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    setPanelList(panel, next);
  };

  const openFilePickerForPanel = (panel: UploadPanelKey) => {
    if (panel === "product") return productInputRef.current?.click();
    if (panel === "logo") return logoInputRef.current?.click();
    if (panel === "inspiration") return inspirationInputRef.current?.click();
  };

  const handlePanelInputChange =
    (panel: UploadPanelKey) => (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (files && files.length) addFilesToPanel(panel, files);
      e.target.value = "";
    };

  const handlePanelDrop =
    (panel: UploadPanelKey) => (e: React.DragEvent<HTMLDivElement>) => {
      if (panel === "style") return;
      e.preventDefault();
      setDraggingPanel(null);
      const files = e.dataTransfer.files;
      if (files && files.length) addFilesToPanel(panel, files);
    };

  const handlePanelDragOver =
    (panel: UploadPanelKey) => (e: React.DragEvent<HTMLDivElement>) => {
      if (panel === "style") return;
      e.preventDefault();
      if (draggingPanel !== panel) setDraggingPanel(panel);
    };

  const handlePanelDragLeave =
    (panel: UploadPanelKey) => (e: React.DragEvent<HTMLDivElement>) => {
      if (panel === "style") return;
      e.preventDefault();
      if (draggingPanel === panel) setDraggingPanel(null);
    };

  const handlePanelPaste =
    (panel: UploadPanelKey) => (e: React.ClipboardEvent<HTMLDivElement>) => {
      if (panel === "style") return;

      const dt = e.clipboardData;
      if (!dt) return;

      // 1) pasted image file(s)
      const files: File[] = [];
      for (let i = 0; i < dt.items.length; i++) {
        const it = dt.items[i];
        if (it.kind === "file") {
          const f = it.getAsFile();
          if (f && /^image\//i.test(f.type)) files.push(f);
        }
      }
      if (files.length) {
        e.preventDefault();
        addFilesToPanel(panel, files);
        return;
      }

      // 2) pasted text url(s)
      const text = dt.getData("text") || "";
      const first = text.trim().split(/\s+/)[0] || "";
      if (first && isProbablyImageUrl(first)) {
        e.preventDefault();
        addUrlToPanel(panel, first);
      }
    };

  const handleThumbDragStart =
    (panel: UploadPanelKey, id: string) => (e: React.DragEvent) => {
      if (panel === "style") return;
      draggingThumbRef.current = { panel, id };
      try {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", id);
      } catch {
        // ignore
      }
    };

  const handleThumbDragOver =
    (_panel: UploadPanelKey, _id: string) => (e: React.DragEvent) => {
      e.preventDefault();
      try {
        e.dataTransfer.dropEffect = "move";
      } catch {
        // ignore
      }
    };

  const handleThumbDrop =
    (panel: UploadPanelKey, targetId: string) => (e: React.DragEvent) => {
      e.preventDefault();
      if (panel === "style") return;

      const drag = draggingThumbRef.current;
      if (!drag) return;
      if (drag.panel !== panel) return;

      reorderWithinPanel(panel, drag.id, targetId);
      draggingThumbRef.current = null;
    };

  // ===========================================================
  // CHAPTER 13 — Auth helpers
  // ===========================================================
  const handleChangeCustomer = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = customerIdInput.trim();
    if (!trimmed) return;
    setCustomerId(trimmed);
    setSessionId(null);
    setStillItems([]);
    setMotionItems([]);
    setStillIndex(0);
    setMotionIndex(0);
  };

  const handleSignOut = async () => {
    try {
      await supabase.auth.signOut();
    } finally {
      if (typeof window !== "undefined") window.location.reload();
    }
  };

  const handleAnimateHeaderClick = async () => {
    if (!motionDescription.trim()) {
      await handleSuggestMotion();
    }
    await handleGenerateMotion();
  };

  // ===========================================================
  // CHAPTER 14 — Render helpers: upload panel + pills
  // ===========================================================
  const renderUploadPanel = (panel: UploadPanelKey) => {
    if (panel === "style") return null;

    const title =
      panel === "product"
        ? "Add your product"
        : panel === "logo"
        ? "Add your logo"
        : "Add inspiration";

    const list = getPanelList(panel);

    return (
      <div className={classNames("studio-step", openPanel === panel && "visible")}>
        <div className="studio-style-title" style={{ marginBottom: 10 }}>
          {title}
        </div>

        <div
          className={classNames(
            "studio-dropzone",
            draggingPanel === panel && "studio-dropzone--dragging"
          )}
          tabIndex={0}
          onClick={() => openFilePickerForPanel(panel)}
          onPaste={handlePanelPaste(panel)}
          onDrop={handlePanelDrop(panel)}
          onDragOver={handlePanelDragOver(panel)}
          onDragLeave={handlePanelDragLeave(panel)}
          role="button"
          aria-label={`${title} dropzone`}
        >
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button type="button" className="link-button" onClick={() => openFilePickerForPanel(panel)}>
              Browse
            </button>
            <span style={{ fontSize: 11, opacity: 0.7 }}>
              Drag & drop, or paste an image / https link
            </span>
          </div>
        </div>

        {list.length > 0 && (
          <div className="studio-thumbs-row" style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
            {list.map((img) => (
              <button
                key={img.id}
                type="button"
                className="studio-thumb"
                title="Click to delete"
                onClick={() => removeItemFromPanel(panel, img.id)}
                draggable
                onDragStart={handleThumbDragStart(panel, img.id)}
                onDragOver={handleThumbDragOver(panel, img.id)}
                onDrop={handleThumbDrop(panel, img.id)}
                style={{
                  width: 72,
                  height: 72,
                  overflow: "hidden",
                  border: "1px solid rgba(8,10,0,0.12)",
                  background: "rgba(8,10,0,0.04)",
                }}
              >
                <img
                  src={img.url}
                  alt=""
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                />
              </button>
            ))}
          </div>
        )}

        {/* hidden input for this panel */}
        {panel === "product" && (
          <input
            ref={productInputRef}
            type="file"
            accept="image/*"
            multiple
            style={{ display: "none" }}
            onChange={handlePanelInputChange("product")}
          />
        )}
        {panel === "logo" && (
          <input
            ref={logoInputRef}
            type="file"
            accept="image/*"
            multiple
            style={{ display: "none" }}
            onChange={handlePanelInputChange("logo")}
          />
        )}
        {panel === "inspiration" && (
          <input
            ref={inspirationInputRef}
            type="file"
            accept="image/*"
            multiple
            style={{ display: "none" }}
            onChange={handlePanelInputChange("inspiration")}
          />
        )}
      </div>
    );
  };

  // ===========================================================
  // CHAPTER 15 — Render: left / right / profile
  // ===========================================================
  const renderStudioLeft = () => {
    return (
      <div className="studio-left">
        <div className={classNames("studio-left-main", openPanel && "studio-left-main--with-step")}>
          {/* Input 1 = pills + textarea */}
          <div className="studio-input1-block">
            {/* Pills slot – always reserve height so textarea never moves */}
            <div className="studio-pills-slot">
              {showPills && (
                <div className="studio-row studio-row--pills">
                  {/* Product pill */}
                  <button
                    type="button"
                    className={classNames("studio-pill", openPanel === "product" && "active")}
                    onClick={() => togglePanel("product")}
                  >
                    <span className="studio-pill-icon studio-pill-icon--square">
                      <img src={GENERIC_PILL_ICON_URL} alt="" className="studio-pill-glyph" />
                    </span>
                    <span className="studio-pill-main">Product</span>
                    {productHas && <span className="studio-pill-check" aria-hidden="true">✓</span>}
                  </button>

                  {/* Logo pill */}
                  <button
                    type="button"
                    className={classNames("studio-pill", openPanel === "logo" && "active")}
                    onClick={() => togglePanel("logo")}
                  >
                    <span className="studio-pill-icon studio-pill-icon--square">
                      <img src={GENERIC_PILL_ICON_URL} alt="" className="studio-pill-glyph" />
                    </span>
                    <span className="studio-pill-main">Logo</span>
                    {logoHas && <span className="studio-pill-check" aria-hidden="true">✓</span>}
                  </button>

                  {/* Inspiration pill */}
                  <button
                    type="button"
                    className={classNames("studio-pill", openPanel === "inspiration" && "active")}
                    onClick={() => togglePanel("inspiration")}
                  >
                    <span className="studio-pill-icon studio-pill-icon--square">
                      <img src={GENERIC_PILL_ICON_URL} alt="" className="studio-pill-glyph" />
                    </span>
                    <span className="studio-pill-main">Inspiration</span>
                    {inspirationHas && <span className="studio-pill-check" aria-hidden="true">✓</span>}
                  </button>

                  {/* Style pill */}
                  <button
                    type="button"
                    className={classNames("studio-pill", openPanel === "style" && "active")}
                    onClick={() => togglePanel("style")}
                  >
                    <span className="studio-pill-icon studio-pill-icon--square">
                      <img src={GENERIC_PILL_ICON_URL} alt="" className="studio-pill-glyph" />
                    </span>
                    <span className="studio-pill-main">Style</span>
                  </button>

                  {/* Aspect pill – KEEP THIS LAST */}
                  <button
                    type="button"
                    className={classNames("studio-pill", "studio-pill--aspect")}
                    onClick={handleCycleAspect}
                  >
                    <span className="studio-pill-icon">
                      <img
                        src={ASPECT_ICON_URLS[currentAspect.key]}
                        alt={currentAspect.label}
                      />
                    </span>
                    <span className="studio-pill-main">{currentAspect.label}</span>
                    <span className="studio-pill-sub">{currentAspect.subtitle}</span>
                  </button>
                </div>
              )}
            </div>

            {/* Brief text area */}
            <div className="studio-brief-block">
              <div
                className={classNames(
                  "studio-brief-shell",
                  showDescribeMore && "has-brief-hint"
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
                {showDescribeMore && (
                  <div className="studio-brief-hint">Describe more</div>
                )}
              </div>
            </div>
          </div>

          {/* Upload accordions (one at a time) */}
          {renderUploadPanel("product")}
          {renderUploadPanel("logo")}
          {renderUploadPanel("inspiration")}

          {/* Style panel (also part of accordion) */}
          <div className={classNames("studio-step", openPanel === "style" && "visible")}>
            <button
              type="button"
              className="studio-style-title"
              onClick={() => setStylesCollapsed((prev) => !prev)}
            >
              {stylesCollapsed
                ? `Editorial style picked: ${
                    STYLE_PRESETS.find((p) => p.key === stylePresetKey)?.label ??
                    (stylePresetKey === "custom-style" ? "Custom" : "—")
                  }`
                : "Pick one editorial style"}
            </button>

            {!stylesCollapsed && (
              <div className="studio-style-row">
                {STYLE_PRESETS.map((preset) => (
                  <button
                    key={preset.key}
                    type="button"
                    className={classNames(
                      "studio-style-card",
                      stylePresetKey === preset.key && "active"
                    )}
                    onClick={() => setStylePresetKey(preset.key)}
                    onMouseEnter={() => setStylePresetKey(preset.key)}
                  >
                    <div className="studio-style-thumb">
                      <img src={preset.thumb} alt="" />
                    </div>
                    <div className="studio-style-label">{preset.label}</div>
                  </button>
                ))}

                {/* Keep your existing Add yours modal flow unchanged */}
                <button
                  type="button"
                  className={classNames("studio-style-card", "add")}
                  onClick={() => {
                    // open handled below in renderCustomStyleModal (same as your original)
                    setCustomStylePanelOpen(true);
                    setCustomStyleError(null);
                  }}
                >
                  <div className="studio-style-thumb">
                    {customStyleHeroThumb ? <img src={customStyleHeroThumb} alt="" /> : <span>+</span>}
                  </div>
                  <div className="studio-style-label">Add yours</div>
                </button>
              </div>
            )}

            <div className="studio-style-divider" />

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
                className={classNames(
                  "studio-create-link",
                  !canCreateStill && "disabled"
                )}
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
        </div>

        {/* footer */}
        <div className="studio-footer">
          <button
            type="button"
            className="link-button subtle"
            onClick={() => setActiveTab("profile")}
          >
            Profile
          </button>
        </div>
      </div>
    );
  };

  // ===========================================================
  // CHAPTER 16 — Custom style modal (UNCHANGED, just moved below)
  // ===========================================================
  const [customStylePanelOpen, setCustomStylePanelOpen] = useState(false);
  const [customStyleImages, setCustomStyleImages] = useState<CustomStyleImage[]>([]);
  const [customStyleHeroId, setCustomStyleHeroId] = useState<string | null>(null);
  const [customStyleHeroThumb, setCustomStyleHeroThumb] = useState<string | null>(null);
  const [customStyleTraining, setCustomStyleTraining] = useState(false);
  const [customStyleError, setCustomStyleError] = useState<string | null>(null);
  const customStyleInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    return () => {
      if (customStyleHeroThumb && customStyleHeroThumb.startsWith("blob:")) {
        revokeIfBlob(customStyleHeroThumb);
      }
      customStyleImages.forEach((img) => revokeIfBlob(img.url));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCloseCustomStylePanel = () => setCustomStylePanelOpen(false);

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

      if (!nextHeroId && merged.length) {
        nextHeroId = merged[0].id;
        setCustomStyleHeroId(nextHeroId);
      }

      const heroImage = merged.find((img) => img.id === nextHeroId) || merged[0];
      if (heroImage) {
        setCustomStyleHeroThumb(heroImage.url);
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
    if (img) setCustomStyleHeroThumb(img.url);
  };

  const handleTrainCustomStyle = async () => {
    if (!customStyleImages.length || !customStyleHeroId) return;

    try {
      setCustomStyleTraining(true);
      setCustomStyleError(null);

      // TODO: plug this into the real training endpoint.
      await new Promise((resolve) => setTimeout(resolve, 1200));

      setStylePresetKey("custom-style");
      setCustomStylePanelOpen(false);
    } catch (err: any) {
      setCustomStyleError(err?.message || "Unable to train style right now.");
    } finally {
      setCustomStyleTraining(false);
    }
  };

  const renderCustomStyleModal = () => {
    if (!customStylePanelOpen) return null;

    return (
      <div className="mina-modal-backdrop" onClick={handleCloseCustomStylePanel}>
        <div className="mina-modal" onClick={(e) => e.stopPropagation()}>
          <div className="mina-modal-header">
            <div>Train your own style</div>
            <button
              type="button"
              className="mina-modal-close"
              onClick={handleCloseCustomStylePanel}
            >
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
              <button
                type="button"
                className="link-button"
                onClick={handleCustomStyleUploadClick}
              >
                Upload images
              </button>
              <span>(up to 10)</span>
            </div>
            <div className="mina-modal-drop-help">
              Drop your 10 reference images and pick one as hero.
            </div>
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
                  className={classNames(
                    "mina-modal-thumb",
                    customStyleHeroId === img.id && "hero"
                  )}
                  onClick={() => handleSelectCustomStyleHero(img.id)}
                >
                  <img src={img.url} alt="" />
                  {customStyleHeroId === img.id && (
                    <div className="mina-modal-thumb-tag">Hero</div>
                  )}
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
              {customStyleTraining ? "Training…" : "Train me"}
            </button>
          </div>
        </div>
      </div>
    );
  };

  // ===========================================================
  // CHAPTER 17 — Right side (unchanged UI, but benefits from index fixes)
  // ===========================================================
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
                <div className="output-placeholder">
                  New ideas don’t actually exist, just recycle.
                </div>
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

  const renderStudioBody = () => (
    <div className={classNames("studio-body", "studio-body--two-col")}>
      {renderStudioLeft()}
      {renderStudioRight()}
    </div>
  );

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
          <a
            href={TOPUP_URL}
            target="_blank"
            rel="noreferrer"
            className="link-button primary-button"
          >
            Add credits
          </a>
        </div>

        <div className="profile-row">
          <button type="button" className="link-button subtle" onClick={handleSignOut}>
            Sign out
          </button>
        </div>

        <div className="profile-row small">
          <button
            type="button"
            className="link-button subtle"
            onClick={() => setActiveTab("studio")}
          >
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

        {/* feedbacks still available in state if you want later */}
        {historyFeedbacks.length > 0 && null}
      </div>
    </div>
  );

  // ===========================================================
  // CHAPTER 18 — Full layout with header overlay (unchanged)
  // ===========================================================
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
                  disabled={
                    !currentStill ||
                    motionGenerating ||
                    (!motionDescription && motionSuggestLoading)
                  }
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
              <button
                type="button"
                className="link-button subtle"
                onClick={() => setActiveTab("studio")}
              >
                Back to studio
              </button>
            )}
          </div>
        </div>

        {activeTab === "studio" ? renderStudioBody() : renderProfileBody()}
      </div>

      {renderCustomStyleModal()}
    </div>
  );
};

export default MinaApp;
