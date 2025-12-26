import React, { useEffect, useRef, useState } from "react";
import "./TopLoadingBar.css";

type TopLoadingBarProps = {
  active: boolean;
};

export default function TopLoadingBar({ active }: TopLoadingBarProps) {
  const [visible, setVisible] = useState(false);
  const [progress, setProgress] = useState(0);
  const decayTimer = useRef<number | null>(null);
  const rampTimer = useRef<number | null>(null);

  useEffect(() => {
    if (active) {
      setVisible(true);

      // Kick into view and ramp toward 90% while busy.
      if (rampTimer.current) window.clearInterval(rampTimer.current);
      rampTimer.current = window.setInterval(() => {
        setProgress((prev) => {
          const safeStart = prev === 0 ? 12 : prev;
          const target = 90;
          const delta = Math.max(1, (target - safeStart) * 0.12);
          const next = safeStart + delta;
          return next >= target ? target : next;
        });
      }, 160);

      // Cancel any pending hide.
      if (decayTimer.current) {
        window.clearTimeout(decayTimer.current);
        decayTimer.current = null;
      }
    } else if (visible) {
      // Finish to 100% then fade away.
      if (rampTimer.current) window.clearInterval(rampTimer.current);
      setProgress(100);

      decayTimer.current = window.setTimeout(() => {
        setVisible(false);
        setProgress(0);
      }, 350);
    }

    return () => {
      if (rampTimer.current) window.clearInterval(rampTimer.current);
      if (decayTimer.current) {
        window.clearTimeout(decayTimer.current);
        decayTimer.current = null;
      }
    };
  }, [active, visible]);

  // Skip render entirely after hiding.
  if (!visible && progress === 0) return null;

  return (
    <div
      className="mina-top-loading"
      role="progressbar"
      aria-label="Loading"
      aria-busy={active}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(progress)}
    >
      <div className="mina-top-loading__bar" style={{ width: `${progress}%` }} />
    </div>
  );
}
