// =============================================================
// FILE: src/StudioRight.tsx
// =============================================================
import React, { useEffect, useMemo, useState } from "react";
import "./StudioRight.css";

type StillItem = { id: string; url: string };
type MotionItem = { id: string; url: string };

type StudioRightProps = {
  currentStill: StillItem | null;
  currentMotion: MotionItem | null;

  stillItems: StillItem[];
  stillIndex: number;
  setStillIndex: (i: number) => void;

  feedbackText: string;
  setFeedbackText: (v: string) => void;
  feedbackSending: boolean;
  feedbackError: string | null;
  onSubmitFeedback: () => void;
};

export default function StudioRight(props: StudioRightProps) {
  const {
    currentStill,
    currentMotion,
    stillItems,
    stillIndex,
    setStillIndex,
    feedbackText,
    setFeedbackText,
    feedbackSending,
    feedbackError,
    onSubmitFeedback,
  } = props;

  const isEmpty = !currentStill && !currentMotion;

  const media = useMemo(() => {
    if (currentMotion) return { type: "video" as const, url: currentMotion.url };
    if (currentStill) return { type: "image" as const, url: currentStill.url };
    return null;
  }, [currentMotion, currentStill]);

  // Center click = zoom toggle (cover <-> contain)
  const [containMode, setContainMode] = useState(false);

  // Reset zoom when switching media
  useEffect(() => {
    setContainMode(false);
  }, [media?.url]);

  const hasCarousel = stillItems.length > 1;

  const goPrev = () => {
    if (!hasCarousel) return;
    const n = stillItems.length;
    setStillIndex((stillIndex - 1 + n) % n);
  };

  const goNext = () => {
    if (!hasCarousel) return;
    const n = stillItems.length;
    setStillIndex((stillIndex + 1) % n);
  };

  // ✅ Click zones:
  // - left 18% => previous
  // - right 18% => next
  // - middle => zoom toggle
  const handleFrameClick: React.MouseEventHandler<HTMLButtonElement> = (e) => {
    if (!media) return;

    const target = e.currentTarget;
    const rect = target.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const pct = rect.width > 0 ? x / rect.width : 0.5;

    const EDGE = 0.18;

    if (hasCarousel && pct <= EDGE) {
      goPrev();
      return;
    }
    if (hasCarousel && pct >= 1 - EDGE) {
      goNext();
      return;
    }

    setContainMode((v) => !v);
  };

  const canSend = !feedbackSending && feedbackText.trim().length > 0;

  // ✅ Right-side buttons (Like + Download) styled like "Send"
  const handleLike = () => {
    if (!media) return;
    if (feedbackSending) return;

    // If user hasn't typed anything, prefill a minimal like phrase and send
    if (!feedbackText.trim()) {
      setFeedbackText("more of this");
      setTimeout(() => onSubmitFeedback(), 0);
      return;
    }

    onSubmitFeedback();
  };

  const handleDownload = () => {
    if (!media) return;

    const a = document.createElement("a");
    a.href = media.url;
    a.download = "mina-output";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div className="studio-right">
      <div className="studio-right-surface">
        {/* ✅ top-right actions */}
        {!isEmpty && (
          <div className="studio-right-top-actions">
            <button type="button" className="studio-right-cta" onClick={handleLike} disabled={feedbackSending}>
              ♡ more of this
            </button>
            <button type="button" className="studio-right-cta" onClick={handleDownload} disabled={!media}>
              Download
            </button>
          </div>
        )}

        {isEmpty ? (
          <div className="studio-empty-text">New ideas don’t actually exist, just recycle.</div>
        ) : (
          <>
            <button type="button" className="studio-output-click" onClick={handleFrameClick} aria-label="Toggle zoom / Navigate">
              <div className={`studio-output-frame ${containMode ? "is-contain" : ""}`}>
                {media?.type === "video" ? (
                  <video className="studio-output-media" src={media.url} autoPlay loop muted controls />
                ) : (
                  <img className="studio-output-media" src={media?.url || ""} alt="" />
                )}
              </div>
            </button>

            {hasCarousel && (
              <div className="studio-dots-row">
                {stillItems.map((item, idx) => (
                  <button
                    key={item.id}
                    type="button"
                    className={`studio-dot ${idx === stillIndex ? "active" : ""}`}
                    onClick={() => setStillIndex(idx)}
                    aria-label={`Go to image ${idx + 1}`}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {!isEmpty && (
        <div className="studio-feedback-bar">
          <input
            className="studio-feedback-input--compact"
            placeholder="Speak to me tell me, what you like and dislike about my generation"
            value={feedbackText}
            onChange={(e) => setFeedbackText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && canSend) onSubmitFeedback();
            }}
          />

          <button type="button" className="studio-feedback-send" onClick={onSubmitFeedback} disabled={!canSend}>
            Send
          </button>

          {feedbackError && <div className="studio-feedback-error">{feedbackError}</div>}
        </div>
      )}
    </div>
  );
}
