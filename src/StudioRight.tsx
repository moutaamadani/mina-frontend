// src/StudioRight.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
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

  // When a motion exists, we don't want to permanently "lock" the UI to video.
  // showMotion controls whether we currently display the video or the still carousel.
  const [showMotion, setShowMotion] = useState(false);

  // Default to video when a new motion arrives; user can switch back to stills via dots / swipe.
  useEffect(() => {
    setShowMotion(!!currentMotion);
  }, [currentMotion?.url]);

  const openTutorial = () => {
    try {
      // @ts-ignore
      window.dispatchEvent(new Event("mina:openTutorial"));
    } catch {}
  };

  const media = useMemo(() => {
    // If we have motion and we either want to show it, OR we have no still to show, display video.
    if (currentMotion && (showMotion || !currentStill)) {
      return { type: "video" as const, url: currentMotion.url };
    }
    if (currentStill) return { type: "image" as const, url: currentStill.url };
    return null;
  }, [currentMotion, currentStill, showMotion]);

  // Swipe/drag handling
  const suppressClickRef = useRef(false);
  const pointerRef = useRef({
    active: false,
    startX: 0,
    startY: 0,
    pointerId: null as number | null,
  });
  // Trackpad horizontal swipe comes as wheel deltaX, not pointer move.
  const wheelRef = useRef({ acc: 0, lastT: 0 });
  const WHEEL_TRIGGER = 60; // how much horizontal wheel to trigger nav

  const SWIPE_PX = 44;        // min horizontal move to count as swipe
  const SWIPE_SLOPE = 1.2;    // require horizontal dominance vs vertical

  const [containMode, setContainMode] = useState(false);

  useEffect(() => {
    setContainMode(false);
  }, [media?.url]);

  const hasStills = stillItems.length > 0;
  const hasStillCarousel = stillItems.length > 1;

  const goPrev = () => {
    if (!hasStills) return;

    // If video is currently shown, first switch back to stills (and optionally move).
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

  const handleFrameClick: React.MouseEventHandler<HTMLButtonElement> = (e) => {
    // If we just swiped, ignore the "click" that fires after touch/pointer end.
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }

    if (!media) return;

    const target = e.currentTarget;
    const rect = target.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const pct = rect.width > 0 ? x / rect.width : 0.5;

    const EDGE = 0.18;

    // Edge navigation always navigates stills; if video is showing we switch to stills first.
    if (hasStills && pct <= EDGE) return goPrev();
    if (hasStills && pct >= 1 - EDGE) return goNext();

    // Center click toggles contain/cover (zoom)
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
    if (Math.abs(dx) < Math.abs(dy) * SWIPE_SLOPE) return; // mostly vertical -> don't hijack scroll

    st.active = false;

    // prevent the post-swipe "click"
    suppressClickRef.current = true;

    // Swipe right -> previous, swipe left -> next
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

    // Require mostly-horizontal gesture
    if (Math.abs(dx) < 8) return;
    if (Math.abs(dx) < Math.abs(dy) * 1.1) return;

    // Accumulate deltas so we don't trigger too easily
    const now = performance.now();
    const dt = now - wheelRef.current.lastT;
    wheelRef.current.lastT = now;

    if (dt > 120) wheelRef.current.acc = 0;
    wheelRef.current.acc += dx;

    if (Math.abs(wheelRef.current.acc) < WHEEL_TRIGGER) return;

    e.preventDefault();
    suppressClickRef.current = true;

    // NOTE: if direction feels inverted on your Mac, swap goNext/goPrev.
    if (wheelRef.current.acc > 0) goNext();
    else goPrev();

    wheelRef.current.acc = 0;
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
      <div className="studio-right-surface" style={{ position: "relative" }}>
        <div style={{ position: "absolute", top: 16, left: 16, zIndex: 5 }}>
          <button type="button" className="studio-footer-link" onClick={openTutorial}>
            Tutorial
          </button>
        </div>
        {isEmpty ? (
          <div className="studio-empty-text">New ideas don’t exist, just recycle.</div>
        ) : (
          <>
            <button
              type="button"
              className="studio-output-click"
              onClick={handleFrameClick}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerEnd}
              onPointerCancel={onPointerEnd}
              onWheel={onWheel}
              aria-label="Toggle zoom / Navigate / Swipe"
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
                    draggable={false}
                    onDragStart={(e) => e.preventDefault()}
                  />
                ) : (
                  <img
                    className="studio-output-media"
                    src={media?.url || ""}
                    alt=""
                    draggable={false}
                    onDragStart={(e) => e.preventDefault()}
                  />
                )}
              </div>
            </button>

            {hasStills && (hasStillCarousel || !!currentMotion) && (
              <div className="studio-dots-row" aria-label="Media carousel">
                {/* Video dot (only if motion exists) */}
                {currentMotion && (
                  <button
                    type="button"
                    className={`studio-dot ${showMotion ? "active" : ""} is-video`}
                    onClick={() => setShowMotion(true)}
                    aria-label="Show video"
                    title="Video"
                  />
                )}

                {/* Still dots */}
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
