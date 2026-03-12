// src/components/WelcomeMatchaModal.tsx
// Uses the exact same CSS classes as MatchaQtyModal (mina-matcha-modal)
import React, { useEffect, useRef } from "react";

const WELCOME_MATCHA_CART_URL = "https://www.faltastudio.com/cart/43337249488979:1";

type Props = {
  open: boolean;
  onClose: () => void;
};

const WelcomeMatchaModal: React.FC<Props> = ({ open, onClose }) => {
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => panelRef.current?.focus(), 0);

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  const handleClaim = () => {
    onClose();
    window.open(WELCOME_MATCHA_CART_URL, "_blank", "noopener");
  };

  return (
    <div className="mina-modal-backdrop" onClick={onClose}>
      <div
        className="mina-modal mina-matcha-modal"
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        ref={panelRef}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Topbar — same as MatchaQtyModal */}
        <div className="mina-matcha-topbar">
          <div className="mina-matcha-topbar-left">Welcome to Mina</div>
          <button
            type="button"
            className="mina-modal-close mina-matcha-close"
            onClick={onClose}
            aria-label="Close"
            title="Close"
          >
            —
          </button>
        </div>

        {/* Body — same structure as MatchaQtyModal */}
        <div className="mina-matcha-body">
          <div className="mina-matcha-subtitle">Matchas for you</div>
          <div className="mina-matcha-rules">
            Mina uses matchas to create your images and videos.
            1 Main Image = 1 Matcha · 1 Niche Image or 1s Video = 2 Matchas.
            We're giving you 5 free matchas for your first month — on us.
          </div>
        </div>

        {/* Footer — same as MatchaQtyModal */}
        <div className="mina-matcha-footer">
          <div className="mina-matcha-transparency" />

          <button
            type="button"
            className="mina-matcha-purchase"
            onClick={handleClaim}
          >
            Get free matchas
          </button>
        </div>
      </div>
    </div>
  );
};

export default WelcomeMatchaModal;
