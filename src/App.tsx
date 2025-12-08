import React, { useEffect, useState } from "react";

const API_BASE_URL =
  (import.meta as any).env?.VITE_MINA_API_BASE_URL ||
  "https://mina-editorial-ai-api.onrender.com";

// Test customer – you can change this ID if you want
const DEFAULT_CUSTOMER_ID = "8766256447571";

type HealthPayload = {
  ok: boolean;
  service?: string;
  time?: string;
};

type CreditsBalancePayload = {
  ok: boolean;
  customerId: string;
  balance: number;
  historyLength?: number;
  meta?: {
    imageCost?: number;
    motionCost?: number;
  };
};

type EditorialResponse = {
  ok: boolean;
  imageUrl?: string;
  imageUrls?: string[];
  message?: string;
  error?: string;
  prompt?: string;
};

type FeedbackLikeResponse = {
  ok: boolean;
  message?: string;
  error?: string;
  totals?: {
    likesForCustomer?: number;
  };
};

type LikedImage = {
  imageUrl: string;
  prompt?: string | null;
  likedAt: string;
};

const App: React.FC = () => {
  const [customerId, setCustomerId] = useState<string>(DEFAULT_CUSTOMER_ID);

  const [health, setHealth] = useState<HealthPayload | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);
  const [checkingHealth, setCheckingHealth] = useState<boolean>(false);

  const [credits, setCredits] = useState<number | null>(null);
  const [creditsMeta, setCreditsMeta] = useState<
    { imageCost?: number; motionCost?: number } | undefined
  >(undefined);
  const [creditsLoading, setCreditsLoading] = useState<boolean>(false);
  const [creditsError, setCreditsError] = useState<string | null>(null);

  const [productImageUrl, setProductImageUrl] = useState<string>("");
  const [brief, setBrief] = useState<string>("");
  const [tone, setTone] = useState<string>("Poetic");
  const [platform, setPlatform] = useState<string>("tiktok");
  const [minaVisionEnabled, setMinaVisionEnabled] = useState<boolean>(true);

  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
  const [lastPrompt, setLastPrompt] = useState<string | null>(null);
  const [editorialLoading, setEditorialLoading] = useState<boolean>(false);
  const [editorialError, setEditorialError] = useState<string | null>(null);

  // Feedback / likes (for Mina Vision Intelligence)
  const [feedbackComment, setFeedbackComment] = useState<string>("");
  const [feedbackSending, setFeedbackSending] = useState<boolean>(false);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);
  const [feedbackSuccess, setFeedbackSuccess] = useState<string | null>(null);

  // Local “pile” of liked images
  const [likedImages, setLikedImages] = useState<LikedImage[]>([]);

  const checkHealth = async () => {
    try {
      setCheckingHealth(true);
      setHealthError(null);
      const res = await fetch(`${API_BASE_URL}/health`);
      const data = (await res.json()) as HealthPayload;
      setHealth(data);
    } catch (err: any) {
      setHealthError(
        err?.message || "Could not reach Mina API /health endpoint."
      );
      setHealth(null);
    } finally {
      setCheckingHealth(false);
    }
  };

  const loadCredits = async (id: string) => {
    try {
      setCreditsLoading(true);
      setCreditsError(null);
      const res = await fetch(
        `${API_BASE_URL}/credits/balance?customerId=${encodeURIComponent(id)}`
      );
      const data = (await res.json()) as CreditsBalancePayload;
      if (!data.ok) {
        setCreditsError("API returned an error for credits.");
        return;
      }
      setCredits(data.balance);
      setCreditsMeta(data.meta);
    } catch (err: any) {
      setCreditsError(
        err?.message || "Could not fetch credits balance from Mina API."
      );
      setCredits(null);
    } finally {
      setCreditsLoading(false);
    }
  };

  useEffect(() => {
    checkHealth();
    loadCredits(customerId);
  }, [customerId]);

  // Dev helper: add 9,999,999 credits to current customer
  const handleDevMaxCredits = async () => {
    try {
      setCreditsError(null);
      const res = await fetch(`${API_BASE_URL}/credits/add`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          customerId,
          amount: 9999999,
          reason: "dev-max-test",
          source: "frontend-dev",
        }),
      });
      const data = await res.json();
      if (!data.ok) {
        setCreditsError(
          data.message || "API returned an error trying to add credits."
        );
        return;
      }

      const newBalance: number | undefined =
        typeof data.newBalance === "number"
          ? data.newBalance
          : typeof data.balance === "number"
          ? data.balance
          : undefined;

      if (typeof newBalance === "number") {
        setCredits(newBalance);
      } else {
        await loadCredits(customerId);
      }
    } catch (err: any) {
      setCreditsError(err?.message || "Failed to add test credits.");
    }
  };

  const handleGenerateEditorial = async () => {
    if (!productImageUrl && !brief) {
      setEditorialError(
        "Give Mina at least a product image URL or a short brief."
      );
      return;
    }
    try {
      setEditorialLoading(true);
      setEditorialError(null);
      setFeedbackError(null);
      setFeedbackSuccess(null);

      const res = await fetch(`${API_BASE_URL}/editorial/generate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          customerId,
          productImageUrl: productImageUrl || undefined,
          styleImageUrls: [],
          brief,
          tone,
          platform,
          minaVisionEnabled,
        }),
      });

      const data = (await res.json()) as EditorialResponse;
      if (!data.ok) {
        setEditorialError(
          data.message ||
            data.error ||
            "Mina could not generate an editorial still."
        );
        return;
      }

      const url =
        data.imageUrl ||
        (Array.isArray(data.imageUrls) && data.imageUrls.length > 0
          ? data.imageUrls[0]
          : undefined);

      if (url) {
        setPreviewImageUrl(url);
      }

      if (data.prompt) {
        setLastPrompt(data.prompt);
      }

      await loadCredits(customerId);
    } catch (err: any) {
      setEditorialError(
        err?.message ||
          "Unexpected error while asking Mina to generate an image."
      );
    } finally {
      setEditorialLoading(false);
    }
  };

  const handleLikeCurrent = async () => {
    if (!previewImageUrl || !lastPrompt) {
      setFeedbackError("Generate an image first before liking it.");
      return;
    }
    try {
      setFeedbackSending(true);
      setFeedbackError(null);
      setFeedbackSuccess(null);

      const res = await fetch(`${API_BASE_URL}/feedback/like`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          customerId,
          resultType: "image",
          platform,
          prompt: lastPrompt,
          comment: feedbackComment,
          imageUrl: previewImageUrl,
        }),
      });

      const data = (await res.json()) as FeedbackLikeResponse;

      if (!data.ok) {
        setFeedbackError(
          data.error || data.message || "Mina could not store your feedback."
        );
        return;
      }

      setFeedbackSuccess("Saved to Mina Vision Intelligence.");

      setLikedImages((prev) => {
        const exists = prev.some((item) => item.imageUrl === previewImageUrl);
        if (exists) return prev;
        const newItem: LikedImage = {
          imageUrl: previewImageUrl,
          prompt: lastPrompt,
          likedAt: new Date().toISOString(),
        };
        return [newItem, ...prev];
      });
    } catch (err: any) {
      setFeedbackError(
        err?.message || "Unexpected error while telling Mina what you liked."
      );
    } finally {
      setFeedbackSending(false);
    }
  };

  const formattedCredits =
    typeof credits === "number"
      ? credits.toLocaleString("en-US")
      : creditsLoading
      ? "…"
      : "—";

  const imageCost = creditsMeta?.imageCost;
  const motionCost = creditsMeta?.motionCost;

  const healthStatusLabel = (() => {
    if (checkingHealth) return "Checking…";
    if (health && health.ok) return "Online";
    if (healthError) return "Offline";
    return "Unknown";
  })();

  return (
    <div
      style={{
        minHeight: "100vh",
        backgroundColor: "#EEEED2",
        color: "#080A00",
        display: "flex",
        fontFamily:
          '"Schibsted Grotesk", system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
      }}
    >
      {/* LEFT – flow & form */}
      <div
        style={{
          flex: "0 0 50%",
          borderRight: "1px solid rgba(8, 10, 0, 0.06)",
          padding: "32px 40px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          gap: "24px",
        }}
      >
        {/* Top: header + status + flow */}
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          {/* Header */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 16,
            }}
          >
            <div>
              <div
                style={{
                  fontSize: 14,
                  letterSpacing: 4,
                  textTransform: "uppercase",
                  opacity: 0.7,
                }}
              >
                Falta Studio
              </div>
              <div
                style={{
                  fontSize: 28,
                  fontWeight: 600,
                  letterSpacing: 0.2,
                }}
              >
                Mina Editorial AI
              </div>
            </div>

            <div
              style={{
                textAlign: "right",
                display: "flex",
                flexDirection: "column",
                gap: 8,
                fontSize: 12,
              }}
            >
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "4px 10px",
                  borderRadius: 999,
                  border: "1px solid rgba(8, 10, 0, 0.12)",
                  backgroundColor: "rgba(255, 255, 255, 0.7)",
                }}
              >
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    backgroundColor:
                      healthStatusLabel === "Online" ? "#16a34a" : "#f97316",
                  }}
                />
                <span style={{ fontSize: 11 }}>
                  API&nbsp;
                  {healthStatusLabel}
                </span>
              </div>

              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "4px 10px",
                  borderRadius: 999,
                  border: "1px solid rgba(8, 10, 0, 0.12)",
                  backgroundColor: "rgba(255, 255, 255, 0.9)",
                }}
              >
                <span style={{ fontSize: 11, opacity: 0.7 }}>Credits</span>
                <span style={{ fontSize: 13, fontWeight: 600 }}>
                  {formattedCredits}
                </span>
              </div>

              {imageCost !== undefined && motionCost !== undefined && (
                <div style={{ fontSize: 11, opacity: 0.65 }}>
                  {imageCost} for still · {motionCost} for motion
                </div>
              )}
            </div>
          </div>

          {/* Mini flow like Notion */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 12,
              marginTop: 8,
            }}
          >
            {[
              "Upload & brief",
              "Generate editorial still",
              "Animate into motion",
            ].map((label, index) => {
              const stepNumber = index + 1;
              const isDone =
                (stepNumber === 1 && (!!productImageUrl || !!brief)) ||
                (stepNumber === 2 && !!previewImageUrl) ||
                (stepNumber === 3 && false);
              return (
                <div
                  key={label}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    fontSize: 13,
                    opacity: isDone ? 1 : 0.6,
                  }}
                >
                  <div
                    style={{
                      width: 18,
                      height: 18,
                      borderRadius: 999,
                      border: "1px solid rgba(8, 10, 0, 0.35)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: isDone
                        ? "rgba(8, 10, 0, 0.9)"
                        : "transparent",
                      color: isDone ? "#EEEED2" : "#080A00",
                      fontSize: 11,
                      fontWeight: 600,
                    }}
                  >
                    {isDone ? "✓" : stepNumber}
                  </div>
                  <div>{label}</div>
                  <div
                    style={{
                      flex: 1,
                      height: 1,
                      background:
                        "linear-gradient(to right, rgba(8, 10, 0, 0.2), rgba(8, 10, 0, 0))",
                    }}
                  />
                </div>
              );
            })}
          </div>

          {/* Core form */}
          <div
            style={{
              marginTop: 16,
              display: "flex",
              flexDirection: "column",
              gap: 16,
              fontSize: 13,
            }}
          >
            {/* Customer ID */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
              }}
            >
              <span style={{ opacity: 0.6, minWidth: 80 }}>Customer ID</span>
              <input
                value={customerId}
                onChange={(e) => setCustomerId(e.target.value)}
                style={{
                  flex: 1,
                  border: "none",
                  borderBottom: "1px solid rgba(8, 10, 0, 0.25)",
                  background: "transparent",
                  padding: "4px 0",
                  fontSize: 13,
                  outline: "none",
                }}
              />
            </div>

            {/* Product image URL */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
              }}
            >
              <span style={{ opacity: 0.6, minWidth: 80 }}>Product image</span>
              <input
                placeholder="https://… main bottle / hero image"
                value={productImageUrl}
                onChange={(e) => setProductImageUrl(e.target.value)}
                style={{
                  flex: 1,
                  border: "none",
                  borderBottom: "1px solid rgba(8, 10, 0, 0.25)",
                  background: "transparent",
                  padding: "4px 0",
                  fontSize: 13,
                  outline: "none",
                }}
              />
            </div>

            {/* Brief */}
            <div
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 12,
              }}
            >
              <span style={{ opacity: 0.6, minWidth: 80, paddingTop: 4 }}>
                Brief
              </span>
              <textarea
                placeholder="Tell Mina what you want to create in one poetic paragraph…"
                value={brief}
                onChange={(e) => setBrief(e.target.value)}
                rows={3}
                style={{
                  flex: 1,
                  border: "none",
                  borderBottom: "1px solid rgba(8, 10, 0, 0.25)",
                  background: "transparent",
                  padding: "4px 0",
                  fontSize: 13,
                  outline: "none",
                  resize: "vertical",
                }}
              />
            </div>

            {/* Tone + Format */}
            <div
              style={{
                display: "flex",
                gap: 12,
              }}
            >
              <div
                style={{
                  flex: 1,
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <span style={{ opacity: 0.6, minWidth: 60 }}>Tone</span>
                <input
                  value={tone}
                  onChange={(e) => setTone(e.target.value)}
                  style={{
                    flex: 1,
                    border: "none",
                    borderBottom: "1px solid rgba(8, 10, 0, 0.25)",
                    background: "transparent",
                    padding: "4px 0",
                    fontSize: 13,
                    outline: "none",
                  }}
                />
              </div>
              <div
                style={{
                  flex: 1,
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <span style={{ opacity: 0.6, minWidth: 70 }}>Format</span>
                <select
                  value={platform}
                  onChange={(e) => setPlatform(e.target.value)}
                  style={{
                    flex: 1,
                    border: "none",
                    borderBottom: "1px solid rgba(8, 10, 0, 0.25)",
                    background: "transparent",
                    padding: "4px 0",
                    fontSize: 13,
                    outline: "none",
                  }}
                >
                  <option value="tiktok">TikTok / Reels (9:16)</option>
                  <option value="instagram">Instagram post (4:5)</option>
                  <option value="youtube">YouTube (16:9)</option>
                </select>
              </div>
            </div>

            {/* Mina Vision toggle */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                marginTop: 4,
              }}
            >
              <button
                type="button"
                onClick={() => setMinaVisionEnabled(!minaVisionEnabled)}
                style={{
                  width: 32,
                  height: 18,
                  borderRadius: 999,
                  border: "1px solid rgba(8, 10, 0, 0.4)",
                  padding: 0,
                  backgroundColor: minaVisionEnabled
                    ? "#080A00"
                    : "transparent",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: minaVisionEnabled ? "flex-end" : "flex-start",
                  cursor: "pointer",
                }}
              >
                <span
                  style={{
                    width: 14,
                    height: 14,
                    borderRadius: "50%",
                    backgroundColor: minaVisionEnabled ? "#EEEED2" : "#080A00",
                    margin: 1,
                  }}
                />
              </button>
              <span
                style={{
                  fontSize: 13,
                  opacity: minaVisionEnabled ? 1 : 0.7,
                }}
              >
                Mina Vision Intelligence
              </span>
            </div>

            {/* Actions */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginTop: 12,
                gap: 12,
              }}
            >
              <button
                type="button"
                onClick={handleGenerateEditorial}
                disabled={editorialLoading}
                style={{
                  border: "none",
                  background: "transparent",
                  padding: 0,
                  fontSize: 13,
                  textTransform: "uppercase",
                  letterSpacing: 2,
                  cursor: "pointer",
                  opacity: editorialLoading ? 0.5 : 1,
                  position: "relative",
                }}
              >
                {editorialLoading ? "Thinking with you…" : "Create editorial still"}
                <span
                  style={{
                    display: "block",
                    height: 1,
                    marginTop: 4,
                    backgroundColor: "#080A00",
                  }}
                />
              </button>

              <button
                type="button"
                onClick={handleDevMaxCredits}
                style={{
                  border: "none",
                  background: "transparent",
                  padding: 0,
                  fontSize: 11,
                  opacity: 0.6,
                  cursor: "pointer",
                  textDecoration: "underline",
                }}
              >
                Dev: add 9,999,999 credits
              </button>
            </div>

            {editorialError && (
              <div
                style={{
                  marginTop: 8,
                  fontSize: 12,
                  color: "#b91c1c",
                }}
              >
                {editorialError}
              </div>
            )}

            {creditsError && (
              <div
                style={{
                  marginTop: 4,
                  fontSize: 11,
                  color: "#b91c1c",
                  opacity: 0.9,
                }}
              >
                {creditsError}
              </div>
            )}
          </div>
        </div>

        {/* Bottom footnote */}
        <div
          style={{
            fontSize: 11,
            opacity: 0.6,
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <span>Mina prototype UI · v0.2 (with likes)</span>
          {healthError && <span>Health error: {healthError}</span>}
        </div>
      </div>

      {/* RIGHT – preview + feedback + liked pile */}
      <div
        style={{
          flex: "1 1 50%",
          padding: "32px 40px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background:
            "radial-gradient(circle at top left, #fefce8 0, #EEEED2 40%, #d4d4d4 100%)",
        }}
      >
        {previewImageUrl ? (
          <div
            style={{
              width: "100%",
              maxWidth: 520,
              display: "flex",
              flexDirection: "column",
              gap: 16,
            }}
          >
            {/* Main still */}
            <div
              style={{
                width: "100%",
                aspectRatio: platform === "youtube" ? "16/9" : "9/16",
                backgroundColor: "#d4d4d4",
                borderRadius: 24,
                overflow: "hidden",
                boxShadow: "0 24px 60px rgba(8, 10, 0, 0.35)",
                position: "relative",
              }}
            >
              <img
                src={previewImageUrl}
                alt="Mina editorial result"
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                  display: "block",
                }}
              />
              {lastPrompt && (
                <div
                  style={{
                    position: "absolute",
                    left: 16,
                    right: 16,
                    bottom: 16,
                    padding: "10px 12px",
                    borderRadius: 999,
                    background: "rgba(8, 10, 0, 0.68)",
                    color: "#EEEED2",
                    fontSize: 11,
                    maxHeight: 60,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {lastPrompt}
                </div>
              )}
            </div>

            {/* Feedback */}
            <div
              style={{
                padding: "12px 14px",
                borderRadius: 16,
                backgroundColor: "rgba(255, 255, 255, 0.85)",
                border: "1px solid rgba(8, 10, 0, 0.06)",
                display: "flex",
                flexDirection: "column",
                gap: 10,
                fontSize: 13,
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 10,
                }}
              >
                <span style={{ fontSize: 12, opacity: 0.8 }}>
                  Tell Mina what you like / dislike about this still.
                </span>
                <button
                  type="button"
                  onClick={handleLikeCurrent}
                  disabled={feedbackSending}
                  style={{
                    border: "none",
                    background: "transparent",
                    padding: "4px 0",
                    fontSize: 12,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    cursor: "pointer",
                    opacity: feedbackSending ? 0.5 : 1,
                  }}
                >
                  <span>{feedbackSending ? "Saving…" : "♡ More of this"}</span>
                </button>
              </div>
              <textarea
                placeholder="“I love the softness of the light, but make the background simpler next time…”"
                value={feedbackComment}
                onChange={(e) => setFeedbackComment(e.target.value)}
                rows={2}
                style={{
                  border: "none",
                  borderTop: "1px solid rgba(8, 10, 0, 0.08)",
                  marginTop: 6,
                  paddingTop: 6,
                  background: "transparent",
                  fontSize: 12,
                  outline: "none",
                  resize: "vertical",
                }}
              />
              {feedbackError && (
                <div
                  style={{
                    fontSize: 11,
                    color: "#b91c1c",
                  }}
                >
                  {feedbackError}
                </div>
              )}
              {feedbackSuccess && (
                <div
                  style={{
                    fontSize: 11,
                    color: "#166534",
                  }}
                >
                  {feedbackSuccess}
                </div>
              )}
            </div>

            {/* Liked pile */}
            {likedImages.length > 0 && (
              <div
                style={{
                  marginTop: 4,
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                  fontSize: 11,
                }}
              >
                <div
                  style={{
                    opacity: 0.7,
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <span>Mina’s liked stills (this session only)</span>
                  <span>{likedImages.length} saved</span>
                </div>
                <div
                  style={{
                    display: "flex",
                    gap: 8,
                    overflowX: "auto",
                    paddingBottom: 4,
                  }}
                >
                  {likedImages.map((item) => (
                    <button
                      key={item.likedAt + item.imageUrl}
                      type="button"
                      onClick={() => {
                        setPreviewImageUrl(item.imageUrl);
                        if (item.prompt) setLastPrompt(item.prompt);
                      }}
                      style={{
                        border: "none",
                        padding: 0,
                        background: "transparent",
                        cursor: "pointer",
                        flex: "0 0 auto",
                      }}
                    >
                      <div
                        style={{
                          width: 80,
                          height: 110,
                          borderRadius: 12,
                          overflow: "hidden",
                          border:
                            item.imageUrl === previewImageUrl
                              ? "2px solid rgba(8, 10, 0, 0.75)"
                              : "1px solid rgba(8, 10, 0, 0.18)",
                          boxShadow:
                            item.imageUrl === previewImageUrl
                              ? "0 10px 25px rgba(8, 10, 0, 0.25)"
                              : "none",
                        }}
                      >
                        <img
                          src={item.imageUrl}
                          alt="liked still"
                          style={{
                            width: "100%",
                            height: "100%",
                            objectFit: "cover",
                            display: "block",
                          }}
                        />
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div
            style={{
              maxWidth: 360,
              textAlign: "left",
              fontSize: 14,
              lineHeight: 1.5,
            }}
          >
            <div
              style={{
                fontSize: 18,
                fontWeight: 600,
                marginBottom: 12,
              }}
            >
              When you’re ready, Mina paints.
            </div>
            <div style={{ opacity: 0.75 }}>
              Paste a product image URL and a short brief on the left, then tap{" "}
              <span style={{ fontWeight: 600 }}>Create editorial still</span>.
              Mina will think out loud with you, spend credits, and show the
              first still here. Motion and session history will live on this
              side too.
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default App;
