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

  // TWEAK (was feedback)
  tweakText: string;
  setTweakText: (v: string) => void;
  onSendTweak: (text: string) => void;

  sending?: boolean;
  error?: string | null;

  // ✅ NEW: credit gate for tweak
  tweakCreditsOk?: boolean;
  tweakBlockReason?: string | null;
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
    tweakCreditsOk,
    tweakBlockReason,
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

  // ✅ credit gate (default = allowed)
  const creditsOk = tweakCreditsOk !== false;
  const blockMsg = (tweakBlockReason || "Get more matchas to tweak.").trim();

  // ✅ canSend now includes creditsOk
  const canSend = !isEmpty && !!trimmed && !sending && creditsOk;

  const sendNow = () => {
    if (!canSend) return;
    onSendTweak(trimmed);
  };

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

      {/* ✅ Restored EXACT old feedback bar layout + styling (now called tweak) */}
      {!isEmpty && (
        <div className="studio-feedback-bar">
          <input
            className="studio-feedback-input--compact"
            placeholder="Remove background, mute colors, change, replace or add anything"
            value={tweakText}
            onChange={(e) => setTweakText(e.target.value)}
            disabled={!!sending || !creditsOk}  // ✅ disable if no matcha
            onKeyDown={(e) => {
              if (e.key === "Enter" && canSend) sendNow();
            }}
          />

          <div className="studio-feedback-actions">
            <button
              type="button"
              className="studio-action-btn"
              onClick={sendNow}
              disabled={!canSend} // ✅ includes no-matcha case
              title={!creditsOk ? blockMsg : undefined}
            >
              {sending ? "Tweaking…" : "Tweak"}
            </button>
          </div>

          {/* ✅ show credit block reason using your existing error line */}
          {!creditsOk && <div className="studio-feedback-error">{blockMsg}</div>}

          {!!error && <div className="studio-feedback-error">{error}</div>}
        </div>
      )}
    </div>
  );
}
