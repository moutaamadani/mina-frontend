// src/components/MatchaQtyModal.tsx
import React, { useEffect, useMemo, useRef } from "react";

type Props = {
  open: boolean;
  qty: number;
  setQty: (n: number) => void;
  onClose: () => void;
  onConfirm: (qty: number) => void;

  title?: string;
  min?: number;
  max?: number;
};

const clampInt = (v: number, min: number, max: number) => {
  const n = Math.floor(Number(v || 0));
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
};

const MatchaQtyModal: React.FC<Props> = ({
  open,
  qty,
  setQty,
  onClose,
  onConfirm,
  title = "Get more Matcha",
  min = 1,
  max = 10,
}) => {
  const panelRef = useRef<HTMLDivElement | null>(null);

  const quick = useMemo(() => [1, 2, 3, 5, 10].filter((n) => n >= min && n <= max), [min, max]);

  useEffect(() => {
    if (!open) return;

    // focus the modal for ESC + a11y
    const t = window.setTimeout(() => panelRef.current?.focus(), 0);

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Enter") onConfirm(clampInt(qty, min, max));
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose, onConfirm, qty, min, max]);

  if (!open) return null;

  const dec = () => setQty(clampInt(qty - 1, min, max));
  const inc = () => setQty(clampInt(qty + 1, min, max));

  return (
    <div className="mina-modal-backdrop" onClick={onClose}>
      <div
        className="mina-modal mina-qty-modal"
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        ref={panelRef}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mina-modal-header">
          <div>{title}</div>
          <button type="button" className="mina-modal-close" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="mina-qty-body">
          <div className="mina-qty-sub">Choose quantity</div>

          <div className="mina-qty-stepper">
            <button type="button" className="mina-qty-btn" onClick={dec} aria-label="Decrease">
              −
            </button>

            <div className="mina-qty-value" aria-label="Quantity">
              {clampInt(qty, min, max)}
            </div>

            <button type="button" className="mina-qty-btn" onClick={inc} aria-label="Increase">
              +
            </button>
          </div>

          <div className="mina-qty-quick">
            {quick.map((n) => (
              <button
                key={n}
                type="button"
                className={`mina-qty-chip ${clampInt(qty, min, max) === n ? "active" : ""}`}
                onClick={() => setQty(n)}
              >
                {n}
              </button>
            ))}
          </div>

          <div className="mina-qty-help">
            You’ll be redirected to checkout. Your backend will credit <b>SKU × quantity</b>.
          </div>
        </div>

        <div className="mina-modal-footer mina-qty-footer">
          <button type="button" className="link-button" onClick={onClose}>
            Cancel
          </button>

          <button
            type="button"
            className="mina-qty-cta"
            onClick={() => onConfirm(clampInt(qty, min, max))}
          >
            Continue
          </button>
        </div>
      </div>
    </div>
  );
};

export default MatchaQtyModal;
