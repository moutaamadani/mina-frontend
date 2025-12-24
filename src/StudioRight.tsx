// src/StudioRight.tsx
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

  // ✅ This textarea is the TWEAK input (you called it feedback before)
  tweakText: string;
  setTweakText: (v: string) => void;
  onSendTweak: (text: string) => void;

  sending?: boolean;
  error?: string | null;
};

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
    sending,
    error,
  } = props;

  const isEmpty = !currentStill && !currentMotion;

  const media = useMemo(() => {
    if (currentMotion) return { type: "video" as const, url: currentMotion.url };
    if (currentStill) return { type: "image" as const, url: currentStill.url };
    return null;
  }, [currentMotion, currentStill]);

  const [containMode, setContainMode] = useState(false);

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

  const handleFrameClick: React.MouseEventHandler<HTMLButtonElement> = (e) => {
    if (!media) return;

    const target = e.currentTarget;
    const rect = target.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const pct = rect.width > 0 ? x / rect.width : 0.5;

    const EDGE = 0.18;

    if (hasCarousel && pct <= EDGE) return goPrev();
    if (hasCarousel && pct >= 1 - EDGE) return goNext();

    setContainMode((v) => !v);
  };

  const trimmed = (tweakText || "").trim();
  const canSend = !isEmpty && !!trimmed && !sending;

  return (
    <div className="studio-right">
      <div className="studio-right-surface">
        {isEmpty ? (
          <div className="studio-empty-text">New ideas don’t exist, just recycle.</div>
        ) : (
          <>
            <button
              type="button"
              className="studio-output-click"
              onClick={handleFrameClick}
              aria-label="Toggle zoom / Navigate"
            >
              <div className={`studio-output-frame ${containMode ? "is-contain" : ""}`}>
                {media?.type === "video" ? (
                  <video
                    className="studio-output-media"
                    src={media.url}
                    autoPlay
                    loop
                    muted
                    controls
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData("text/uri-list", media.url);
                      e.dataTransfer.setData("text/plain", media.url);
                      e.dataTransfer.effectAllowed = "copy";
                    }}
                  />
                ) : (
                  <img
                    className="studio-output-media"
                    src={media?.url || ""}
                    alt=""
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData("text/uri-list", media?.url || "");
                      e.dataTransfer.setData("text/plain", media?.url || "");
                      e.dataTransfer.effectAllowed = "copy";
                    }}
                  />
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

      {/* ✅ TWEAK AREA (this is your “feedback” area) */}
      {!isEmpty && (
        <div className="studio-feedback">
          <textarea
            className="studio-feedback-textarea"
            placeholder="Type your tweak… (ex: brighter, less text, tighter crop, more contrast)"
            value={tweakText}
            onChange={(e) => setTweakText(e.target.value)}
            disabled={!!sending}
            rows={3}
            onKeyDown={(e) => {
              // Ctrl+Enter (or Cmd+Enter) sends tweak
              if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                e.preventDefault();
                if (canSend) onSendTweak(trimmed);
              }
            }}
          />

          <div className="studio-feedback-actions">
            <button
              type="button"
              className="studio-feedbackbar-btn"
              onClick={() => onSendTweak(trimmed)}
              disabled={!canSend}
            >
              {sending ? "Tweaking…" : "Tweak"}
            </button>
          </div>

          {!!error && <div className="studio-feedback-error">{error}</div>}
        </div>
      )}
    </div>
  );
}
