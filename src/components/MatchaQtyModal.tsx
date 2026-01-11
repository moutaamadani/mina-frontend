// src/components/MatchaQtyModal.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";

type Pack = { units: number };

type Props = {
  open: boolean;

  // Shopify quantity units (MINA-50)
  qty: number;
  setQty: (n: number) => void;

  onClose: () => void;
  onConfirm: (qty: number) => void;

  // Body text
  subtitle?: string;
  rulesLine?: string;

  // MINA-50 labels
  baseCredits?: number; // 50
  basePrice?: number; // 15
  currencySymbol?: string;

  // Default selection (2x MINA-50)
  defaultUnitsOnOpen?: number;

  // Price transparency
  transparencyTitle?: string;
  transparencyLine?: string;
};

const clampInt = (v: number, min: number, max: number) => {
  const n = Math.floor(Number(v || 0));
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
};

const TOP_TITLE = "Airpot of Matcha Lattes";

const MatchaQtyModal: React.FC<Props> = ({
  open,
  qty,
  setQty,
  onClose,
  onConfirm,

  subtitle = "Mina uses matchas to create and animate your stills.",
  rulesLine = `1 Still = 1 or 2 Matchas (Main/Niche) – 10s Animation = 10 Matchas`,

  baseCredits = 50,
  basePrice = 15,
  currencySymbol = "£",

  defaultUnitsOnOpen = 2,

  transparencyTitle = "Price Transparency",
  transparencyLine = "Cost £8 • New features £3 • Marketing & Branding £3 • Profit £1",
}) => {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const barRef = useRef<HTMLDivElement | null>(null);
  const [showTransparency, setShowTransparency] = useState(false);

  // ✅ ONLY 50 / 100 / 200 / 500 (max 500)
  const packList: Pack[] = useMemo(
    () => [
      { units: 1 }, // 50
      { units: 2 }, // 100
      { units: 4 }, // 200
      { units: 10 }, // 500
    ],
    []
  );

  const minUnits = 1;
  const maxUnits = 10;

  const safeQtyRaw = clampInt(qty, minUnits, maxUnits);
  const onScale = packList.some((p) => p.units === safeQtyRaw);
  const safeQty = onScale ? safeQtyRaw : defaultUnitsOnOpen;

  const activeIndex = Math.max(0, packList.findIndex((p) => p.units === safeQty));
  const fillPct = (activeIndex / (packList.length - 1)) * 100;

  const creditsFor = (units: number) => units * baseCredits;
  const priceFor = (units: number) => units * basePrice;

  // ✅ On open: default to 2× MINA-50 unless user already has a valid selection
  useEffect(() => {
    if (!open) return;
    const now = clampInt(qty, minUnits, maxUnits);
    const nowOnScale = packList.some((p) => p.units === now);
    const desired = clampInt(defaultUnitsOnOpen, minUnits, maxUnits);
    const desiredOnScale = packList.some((p) => p.units === desired) ? desired : 2;

    if (now === 1 || !nowOnScale) setQty(desiredOnScale);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // focus + esc/enter
  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => panelRef.current?.focus(), 0);

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Enter") onConfirm(clampInt(safeQty, minUnits, maxUnits));
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose, onConfirm, safeQty]);

  useEffect(() => {
    if (open) setShowTransparency(false);
  }, [open]);

  if (!open) return null;

  // ✅ Click anywhere on bar -> snap to nearest node
  const onBarClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = barRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, x / rect.width));
    const idx = Math.round(ratio * (packList.length - 1));
    const next = packList[Math.max(0, Math.min(packList.length - 1, idx))]?.units;
    if (next != null) setQty(next);
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
        {/* ✅ Title ONLY here */}
        <div className="mina-matcha-topbar">
          <div className="mina-matcha-topbar-left">{TOP_TITLE}</div>
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

        <div className="mina-matcha-body">
          <div className="mina-matcha-subtitle">{subtitle}</div>
          <div className="mina-matcha-rules">{rulesLine}</div>

          <div className="mina-matcha-scale">
            {/* labels (absolute positioned to match nodes) */}
            <div className="mina-matcha-scale-top" aria-hidden="true">
              {packList.map((p, i) => {
                const on = i <= activeIndex;
                const pct = (i / (packList.length - 1)) * 100;
                const edge = i === 0 ? "is-first" : i === packList.length - 1 ? "is-last" : "";
                return (
                  <div
                    key={p.units}
                    className={`mina-matcha-scale-item mina-matcha-label ${on ? "is-on" : "is-off"} ${edge}`}
                    style={{ left: `${pct}%` }}
                  >
                    {creditsFor(p.units)}
                  </div>
                );
              })}
            </div>

            {/* bar + nodes */}
            <div
              className="mina-matcha-bar"
              ref={barRef}
              onClick={onBarClick}
              role="presentation"
              style={{ ["--fillPct" as any]: `${fillPct}%` }}
            >
              <div className="mina-matcha-track" aria-hidden="true" />
              <div className="mina-matcha-fill" aria-hidden="true" />

              {packList.map((p, i) => {
                const on = i <= activeIndex;
                const leftPct = (i / (packList.length - 1)) * 100;

                return (
                  <button
                    key={p.units}
                    type="button"
                    className={`mina-matcha-node ${on ? "is-on" : ""}`}
                    style={{ left: `${leftPct}%` }}
                    onClick={() => setQty(p.units)}
                    aria-label={`${creditsFor(p.units)} Matchas`}
                  >
                    <span className="mina-matcha-dot" aria-hidden="true" />
                  </button>
                );
              })}
            </div>

            {/* prices (absolute positioned to match nodes) */}
            <div className="mina-matcha-scale-bottom" aria-hidden="true">
              {packList.map((p, i) => {
                const on = i <= activeIndex;
                const pct = (i / (packList.length - 1)) * 100;
                const edge = i === 0 ? "is-first" : i === packList.length - 1 ? "is-last" : "";
                return (
                  <div
                    key={p.units}
                    className={`mina-matcha-scale-item mina-matcha-price ${on ? "is-on" : "is-off"} ${edge}`}
                    style={{ left: `${pct}%` }}
                  >
                    {currencySymbol}
                    {priceFor(p.units).toLocaleString()}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="mina-matcha-footer">
          <div className="mina-matcha-transparency">
            <button
              type="button"
              className="mina-matcha-transparency-toggle"
              onClick={() => setShowTransparency((s) => !s)}
              aria-expanded={showTransparency}
            >
              {transparencyTitle}
            </button>

            {showTransparency ? (
              <div className="mina-matcha-transparency-details">{transparencyLine}</div>
            ) : null}
          </div>

          <button
            type="button"
            className="mina-matcha-purchase"
            onClick={() => onConfirm(clampInt(safeQty, minUnits, maxUnits))}
          >
            Purchase
          </button>
        </div>
      </div>
    </div>
  );
};

export default MatchaQtyModal;
