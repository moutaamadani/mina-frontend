// src/MinaApp.tsx
// ==============================================
// 1. Imports & environment
// ==============================================
import React, { useEffect, useState, useRef } from "react";
import { supabase } from "./lib/supabaseClient";

const API_BASE_URL =
  import.meta.env.VITE_MINA_API_BASE_URL ||
  "https://mina-editorial-ai-api.onrender.com";

const TOPUP_URL =
  import.meta.env.VITE_MINA_TOPUP_URL ||
  "https://www.faltastudio.com/checkouts/cn/hWN6EhbqQW5KrdIuBO3j5HKV/en-ae?_r=AQAB9NY_ccOV_da3y7VmTxJU-dDoLEOCdhP9sg2YlvDwLQQ";

// ==============================================
// 2. Types
// ==============================================
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

type AspectKey = "9-16" | "4-5" | "2-3" | "1-1";


type AspectOption = {
  key: AspectKey;
  ratio: string;
  label: string;
  subtitle: string;
  platformKey: string;
};

// ==============================================
// 3. Constants & helpers
// ==============================================
const ASPECT_OPTIONS: AspectOption[] = [
  {
    key: "9-16",
    ratio: "9:16",
    label: "9:16",
    subtitle: "Tiktok/Reel",
    platformKey: "tiktok",
  },
  {
    key: "4-5",
    ratio: "4:5",
    label: "4:5",
    subtitle: "Post",
    platformKey: "instagram-post",
  },
  {
    key: "2-3",
    ratio: "2:3",
    label: "2:3",
    subtitle: "Printing",
    platformKey: "print",
  },
  {
    key: "1-1",
    ratio: "1:1",
    label: "1:1",
    subtitle: "Square",
    platformKey: "square",
  },
];

const ASPECT_ICON_URLS: Record<AspectKey, string> = {
  "9-16":
    "https://cdn.shopify.com/s/files/1/0678/9254/3571/files/tiktokreels_icon_e116174c-afc7-4174-9cf0-f24a07c8517b.svg?v=1765425956",
  "4-5":
    "https://cdn.shopify.com/s/files/1/0678/9254/3571/files/post_icon_f646fcb5-03be-4cf5-b25c-b1ec38f6794e.svg?v=1765425956",
  "2-3":
    "https://cdn.shopify.com/s/files/1/0678/9254/3571/files/Printing_icon_c7252c7d-863e-4efb-89c4-669261119d61.svg?v=1765425956",
  "1-1":
    "https://cdn.shopify.com/s/files/1/0678/9254/3571/files/square_icon_901d47a8-44a8-4ab9-b412-2224e97fd9d9.svg?v=1765425956",
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
      if (fromUrl && fromUrl.trim().length > 0) {
        return fromUrl.trim();
      }

      const stored = window.localStorage.getItem("minaCustomerId");
      if (stored && stored.trim().length > 0) {
        return stored.trim();
      }
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

function classNames(
  ...parts: Array<string | false | null | undefined>
): string {
  return parts.filter(Boolean).join(" ");
}

type MinaAppProps = {
  initialCustomerId?: string;
};

// ==============================================
// 4. Component
// ==============================================
const MinaApp: React.FC<MinaAppProps> = ({ initialCustomerId }) => {
  // 4.1 Global tab + customer
  const [activeTab, setActiveTab] = useState<"studio" | "profile">("studio");
  const [customerId, setCustomerId] = useState<string>(() =>
    getInitialCustomerId(initialCustomerId)
  );
  const [customerIdInput, setCustomerIdInput] = useState<string>(customerId);

  // 4.2 Health / credits / session
  const [health, setHealth] = useState<HealthState | null>(null);
  const [checkingHealth, setCheckingHealth] = useState(false);

  const [credits, setCredits] = useState<CreditsState | null>(null);
  const [creditsLoading, setCreditsLoading] = useState(false);

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionTitle, setSessionTitle] = useState("Mina Studio session");

  // 4.3 Studio – brief + steps
  const [brief, setBrief] = useState("");
  const [tone] = useState("Poetic");
  const [platform, setPlatform] = useState("tiktok");
  const [aspectIndex, setAspectIndex] = useState(0);

  const [productImageAdded, setProductImageAdded] = useState(false);
  const [brandImageAdded, setBrandImageAdded] = useState(false);
  const [productImageThumb, setProductImageThumb] = useState<string | null>(
    null
  );
  const [brandImageThumb, setBrandImageThumb] = useState<string | null>(null);

  const [stylePresetKey, setStylePresetKey] =
    useState<string>("soft-desert-editorial");
  const [minaVisionEnabled, setMinaVisionEnabled] = useState(true);

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

  // 4.4 History (profile)
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historyGenerations, setHistoryGenerations] = useState<
    GenerationRecord[]
  >([]);
  const [historyFeedbacks, setHistoryFeedbacks] = useState<FeedbackRecord[]>(
    []
  );

  // 4.5 Drag & upload refs
  const [draggingUpload, setDraggingUpload] = useState(false);
  const productInputRef = useRef<HTMLInputElement | null>(null);
  const brandInputRef = useRef<HTMLInputElement | null>(null);

  // 4.6 Brief scroll state (for possible gradients – safe to keep)
  const briefShellRef = useRef<HTMLDivElement | null>(null);
  const [briefScrollState, setBriefScrollState] = useState({
    canScroll: false,
    atTop: true,
    atBottom: true,
  });

  // ============================================
  // 5. Derived values
  // ============================================
  const briefLength = brief.trim().length;
  const showPills = briefLength >= 3;
  const showStylesStep = briefLength >= 20;
  const canCreateStill = briefLength >= 40 && !stillGenerating;

  const currentAspect = ASPECT_OPTIONS[aspectIndex];
  const currentStill: StillItem | null =
    stillItems[stillIndex] || stillItems[0] || null;
  const currentMotion: MotionItem | null =
    motionItems[motionIndex] || motionItems[0] || null;

  const imageCost = credits?.meta?.imageCost ?? 1;
  const motionCost = credits?.meta?.motionCost ?? 5;

  // ============================================
  // 6. Effects – bootstrap + persist customer + scroll state
  // ============================================
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

  // revoke object URLs on unmount
  useEffect(() => {
    return () => {
      if (productImageThumb) URL.revokeObjectURL(productImageThumb);
      if (brandImageThumb) URL.revokeObjectURL(brandImageThumb);
    };
  }, [productImageThumb, brandImageThumb]);

  const updateBriefScrollState = () => {
    const el = briefShellRef.current;
    if (!el) {
      setBriefScrollState({
        canScroll: false,
        atTop: true,
        atBottom: true,
      });
      return;
    }

    const { scrollTop, scrollHeight, clientHeight } = el;
    const canScroll = scrollHeight > clientHeight + 1;
    const atTop = scrollTop <= 1;
    const atBottom = scrollTop + clientHeight >= scrollHeight - 1;

    setBriefScrollState({
      canScroll,
      atTop,
      atBottom,
    });
  };

  useEffect(() => {
    updateBriefScrollState();
  }, [brief]);

  useEffect(() => {
    const handleResize = () => {
      updateBriefScrollState();
    };

    if (typeof window !== "undefined") {
      window.addEventListener("resize", handleResize);
      return () => {
        window.removeEventListener("resize", handleResize);
      };
    }

    return undefined;
  }, []);

  // ============================================
  // 7. API helpers
  // ============================================
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

  // ============================================
  // 8. Editorial stills
  // ============================================
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

      const res = await fetch(`${API_BASE_URL}/editorial/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId,
          sessionId: sid,
          brief: trimmed,
          tone,
          platform: currentAspect.platformKey,
          minaVisionEnabled,
          stylePresetKey,
          productImageUrl: productImageAdded ? "local-upload" : "",
          styleImageUrls: brandImageAdded ? ["local-brand"] : [],
          aspectRatio: currentAspect.ratio,
        }),
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

  // ============================================
  // 9. Motion – suggest + generate
  // ============================================
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
      setMotionSuggestError(
        err?.message || "Unexpected error suggesting motion."
      );
    } finally {
      setMotionSuggestLoading(false);
    }
  };

  const handleGenerateMotion = async () => {
    if (!API_BASE_URL || !currentStill || !motionDescription.trim()) {
      return;
    }

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

  // ============================================
  // 10. Feedback / like / download
  // ============================================
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

  // ============================================
  // 11. UI helpers – aspect + uploads + logout
  // ============================================
  const handleCycleAspect = () => {
    setAspectIndex((prev) => {
      const next = (prev + 1) % ASPECT_OPTIONS.length;
      setPlatform(ASPECT_OPTIONS[next].platformKey);
      return next;
    });
  };

  const handleProductUploadClick = () => {
    productInputRef.current?.click();
  };

  const handleBrandUploadClick = () => {
    brandInputRef.current?.click();
  };

  const handleProductFileChange = (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    setProductImageAdded(true);
    const url = URL.createObjectURL(file);
    setProductImageThumb((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return url;
    });
  };

  const handleBrandFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    setBrandImageAdded(true);
    const url = URL.createObjectURL(file);
    setBrandImageThumb((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return url;
    });
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    if (!showStylesStep) return;
    e.preventDefault();
    setDraggingUpload(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDraggingUpload(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    if (!showStylesStep) return;
    e.preventDefault();
    setDraggingUpload(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      setProductImageAdded(true);
      const url = URL.createObjectURL(file);
      setProductImageThumb((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return url;
      });
    }
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
      if (typeof window !== "undefined") {
        window.location.reload();
      }
    }
  };

  const handleAnimateHeaderClick = async () => {
    if (!motionDescription.trim()) {
      await handleSuggestMotion();
    }
    await handleGenerateMotion();
  };

  const handleBriefScroll = () => {
    updateBriefScrollState();
  };

  // ============================================
  // 12. Render – helper sections
  // ============================================
    const renderStudioLeft = () => {
    const aspectIconUrl = ASPECT_ICON_URLS[currentAspect.key];

    return (
      <div
        className={classNames("studio-left", draggingUpload && "drag-active")}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {/* Main column – Input 1 + Input 2 centered */}
        <div
          className={classNames(
            "studio-left-main",
            showStylesStep && "studio-left-main--with-step"
          )}
        >
          {/* Input 1 = pills + textarea */}
          <div className="studio-input1-block">
            {/* Pills slot – always reserve height so textarea never moves */}
            <div className="studio-pills-slot">
              {showPills && (
                <div className="studio-row studio-row--pills studio-pills-animate">
                  {/* Product pill */}
                  <button
                    type="button"
                    className={classNames(
                      "studio-pill",
                      "studio-pill--upload",
                      productImageAdded && "active"
                    )}
                    onClick={handleProductUploadClick}
                  >
                    <span className="studio-pill-icon studio-pill-icon--square">
                      {productImageThumb ? (
                        <img src={productImageThumb} alt="" />
                      ) : (
                        <span className="studio-pill-plus" aria-hidden="true">
                          +
                        </span>
                      )}
                    </span>
                    <span className="studio-pill-main">Product image</span>
                  </button>

                  {/* Inspiration pill */}
                  <button
                    type="button"
                    className={classNames(
                      "studio-pill",
                      "studio-pill--upload",
                      brandImageAdded && "active"
                    )}
                    onClick={handleBrandUploadClick}
                  >
                    <span className="studio-pill-icon studio-pill-icon--square">
                        {brandImageThumb ? (
                          <img src={brandImageThumb} alt="" />
                        ) : (
                          <span className="studio-pill-plus" aria-hidden="true">
                            +
                          </span>
                        )}
                      </span>

                    <span className="studio-pill-main">Add inspiration</span>
                  </button>

                  {/* Aspect pill */}
                  <button
                    type="button"
                    className={classNames(
                      "studio-pill",
                      "studio-pill--aspect"
                    )}
                    onClick={handleCycleAspect}
                  >
                    <span className="studio-pill-icon">
                      <img src={aspectIconUrl} alt="" />
                    </span>
                    <span className="studio-pill-main">
                      {currentAspect.label}
                    </span>
                    <span className="studio-pill-sub">
                      {currentAspect.subtitle}
                    </span>
                  </button>
                </div>
              )}
            </div>

            {/* Brief text area */}
            <div className="studio-brief-block">
              <div
                className="studio-brief-shell"
                ref={briefShellRef}
                onScroll={handleBriefScroll}
              >
                <textarea
                  className="studio-brief-input"
                  placeholder="Describe how you want your still life image to look like"
                  value={brief}
                  onChange={(e) => setBrief(e.target.value)}
                  rows={4}
                />
              </div>
            </div>
          </div>

          {/* Input 2 – styles, vision toggle, credits, create */}
          <div
            className={classNames("studio-step", showStylesStep && "visible")}
          >
            <div className="studio-style-title">Pick one editorial style</div>

            <div className="studio-style-row">
              {["Vintage", "Gradient", "Back light"].map((label, idx) => {
                const presetKeys = [
                  "vintage",
                  "gradient",
                  "back-light",
                ] as const;
                const key = presetKeys[idx];

                return (
                  <button
                    key={label}
                    type="button"
                    className={classNames(
                      "studio-style-card",
                      stylePresetKey === key && "active"
                    )}
                    onClick={() => setStylePresetKey(key)}
                  >
                    <div className="studio-style-thumb">
                      <span>+</span>
                    </div>
                    <div className="studio-style-label">{label}</div>
                  </button>
                );
              })}

              <button type="button" className="studio-style-card add">
                <div className="studio-style-thumb">
                  <span>+</span>
                </div>
                <div className="studio-style-label">Add yours</div>
              </button>
            </div>

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
                  Credits: {credits.balance} (img −{imageCost} · motion −
                  {motionCost})
                </>
              ) : null}
            </div>
          </div>
        </div>

        {/* hidden file inputs */}
        <input
          ref={productInputRef}
          type="file"
          accept="image/*"
          style={{ display: "none" }}
          onChange={handleProductFileChange}
        />
        <input
          ref={brandInputRef}
          type="file"
          accept="image/*"
          style={{ display: "none" }}
          onChange={handleBrandFileChange}
        />

        {/* footer – Profile fixed at bottom-left via flex */}
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


  const renderStudioRight = () => (
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
              <img
                className="studio-output-media"
                src={currentStill.url}
                alt=""
              />
            ) : (
              <div className="output-placeholder">
                Describe your image on the left to see it here.
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
                className={classNames(
                  "studio-dot",
                  idx === stillIndex && "active"
                )}
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
            {motionSuggestLoading
              ? "Thinking about motion…"
              : "Suggest motion"}
          </button>
          {motionSuggestError && (
            <span className="error-text">{motionSuggestError}</span>
          )}
          {motionError && (
            <span className="error-text">{motionError}</span>
          )}
        </div>

        {motionDescription && (
          <div className="studio-motion-description">
            {motionDescription}
            {!!motionDescription && (
              <>
                {" "}
                —{" "}
                <button
                  type="button"
                  className="link-button subtle"
                  onClick={handleGenerateMotion}
                  disabled={motionGenerating}
                >
                  {motionGenerating ? "Animating…" : "Animate"}
                </button>
              </>
            )}
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
        {feedbackError && (
          <div className="error-text">{feedbackError}</div>
        )}
      </div>
    </div>
  );

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
          <form
            onSubmit={handleChangeCustomer}
            className="profile-inline-form"
          >
            <input
              className="profile-input"
              value={customerIdInput}
              onChange={(e) => setCustomerIdInput(e.target.value)}
            />
            <button
              type="submit"
              className="link-button primary-button"
            >
              Switch
            </button>
          </form>
        </div>

        <div className="profile-row">
          <div className="profile-label">Credits</div>
          <div className="profile-value">
            {credits ? credits.balance : "—"}
          </div>
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
          <button
            type="button"
            className="link-button subtle"
            onClick={handleSignOut}
          >
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
        {historyError && (
          <div className="error-text">{historyError}</div>
        )}
        {!historyLoading && !historyGenerations.length && (
          <div>No history yet.</div>
        )}
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
                <div className="profile-history-time">
                  {formatTime(g.createdAt)}
                </div>
              </div>
            </a>
          ))}
        </div>
      </div>
    </div>
  );

  // ============================================
  // 13. Full layout with header overlay
  // ============================================
  return (
    <div className="mina-studio-root">
      <div className="studio-frame">
        {/* Header overlay on top of both columns */}
        <div className="studio-header-overlay">
          <div className="studio-header-left">
            <a
              href="https://mina.faltastudio.com"
              className="studio-logo-link"
            >
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

        {/* Body (50/50 like login) */}
        {activeTab === "studio" ? renderStudioBody() : renderProfileBody()}
      </div>
    </div>
  );
};

export default MinaApp;
