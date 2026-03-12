// src/components/WelcomeMatchaModal.tsx
import React, { useEffect, useRef } from "react";

type Props = {
  open: boolean;
  onClose: () => void;
  onClaim: () => void;
  claiming?: boolean;
};

const WelcomeMatchaModal: React.FC<Props> = ({ open, onClose, onClaim, claiming }) => {
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => panelRef.current?.focus(), 0);

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Enter") onClaim();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose, onClaim]);

  if (!open) return null;

  return (
    <div className="mina-modal-backdrop" onClick={onClose}>
      <div
        className="mina-modal mina-welcome-modal"
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        ref={panelRef}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mina-welcome-topbar">
          <div className="mina-welcome-topbar-left">Welcome to Mina</div>
          <button
            type="button"
            className="mina-modal-close mina-welcome-close"
            onClick={onClose}
            aria-label="Close"
            title="Close"
          >
            —
          </button>
        </div>

        <div className="mina-welcome-body">
          <div className="mina-welcome-title">Matchas for you</div>
          <div className="mina-welcome-subtitle">
            Start creating with 5 free matchas — on us for your first month.
          </div>
        </div>

        <div className="mina-welcome-footer">
          <button
            type="button"
            className="mina-welcome-cta"
            onClick={onClaim}
            disabled={!!claiming}
          >
            {claiming ? "Claiming…" : "Get free matchas"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default WelcomeMatchaModal;
