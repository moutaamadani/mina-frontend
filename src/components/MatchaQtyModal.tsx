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

  // Copy
  topLabel?: string; // small label top-left
  title?: string; // big title
  subtitle?: string;
  rulesLine?: string;

  // MINA-50 labels
  baseCredits?: number; // 50
  basePrice?: number; // 15
  currencySymbol?: string;

  // forced max to show 5000 (100 units)
  min?: number;
  max?: number;

  // default is EXACTLY your 7 nodes: 50..5000
  packs?: Pack[];

  // default selection (2x MINA-50)
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

const MatchaQtyModal: React.FC<Props> = ({
  open,
  qty,
  setQty,
  onClose,
  onConfirm,

  topLabel = "Get more Matcha",
  title = "Airpots of Matcha Lattes",
  subtitle = "Mina uses matchas to create and animate your stills.",
  rulesLine = `One still = 1 Matcha ,  One animation = 5 Matchas ,  10 “Type for me” = 1 Matcha.`,

  baseCredits = 50,
  basePrice = 15,
  currencySymbol = "£",

  min = 1,
  max = 100,

  packs,

  defaultUnitsOnOpen = 2,

  transparencyTitle = "Price Transparency",
  transparencyLine = "Cost £8 • New features £3 • Marketing & Branding £3 • Profit £1",
}) => {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const barRef = useRef<HTMLDivElement | null>(null);
  const [showTransparency, setShowTransparency] = useState(false);

  // ✅ Always allow up to 5000 credits => 100 units (MINA-50 * 100)
  const effectiveMin = Math.max(1, min);
  const effectiveMax = Math.max(100, max);

  const packList = useMemo(() => {
    const defaultPacks: Pack[] = [
      { units: 1 }, // 50
      { units: 2 }, // 100
      { units: 4 }, // 200
      { units: 10 }, // 500
      { units: 20 }, // 1000
      { units: 40 }, // 2000
      { units: 100 }, // 5000
    ];

    const src = (packs && packs.length ? packs : defaultPacks)
      .map((p) => ({ units: clampInt(p.units, effectiveMin, effectiveMax) }))
      .filter((p) => p.units >= effectiveMin && p.units <= effectiveMax);

    // de-dupe + sort
    const seen = new Set<number>();
    const out: Pack[] = [];
    for (const p of src) {
      if (seen.has(p.units)) continue;
      seen.add(p.units);
      out.push(p);
    }
    out.sort((a, b) => a.units - b.units);
    return out;
  }, [packs, effectiveMin, effectiveMax]);

  // active index for fill line + "on" nodes (<= active)
  const safeQty = clampInt(qty, effectiveMin, effectiveMax);
  const activeIndex = Math.max(
    0,
    packList.findIndex((p) => p.units === safeQty)
  );

  const fillPct =
    packList.length <= 1 ? 0 : (activeIndex / (packList.length - 1)) * 100;

  // ✅ Default to 2x MINA-50 when modal opens (unless already not 1)
  useEffect(() => {
    if (!open) return;
    const now = clampInt(qty, effectiveMin, effectiveMax);
    const desired = clampInt(defaultUnitsOnOpen, effectiveMin, effectiveMax);

    // only force when opening at min (usually 1) or not on the scale
    const onScale = packList.some((p) => p.units === now);
    if (now === effectiveMin || !onScale) {
      if (desired !== now) setQty(desired);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // focus + esc/enter
  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => panelRef.current?.focus(), 0);

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Enter") onConfirm(clampInt(qty, effectiveMin, effectiveMax));
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose, onConfirm, qty, effectiveMin, effectiveMax]);

  useEffect(() => {
    if (open) setShowTransparency(false);
  }, [open]);

  if (!open) return null;

  const creditsFor = (units: number) => units * baseCredits;
  const priceFor = (units: number) => units * basePrice;

  // ✅ Click anywhere on the bar -> snap to nearest node
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
        {/* Top row (small label + close) */}
        <div className="mina-matcha-topbar">
          <div className="mina-matcha-topbar-left">{topLabel}</div>
          <button type="button" className="mina-modal-close mina-matcha-close" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="mina-matcha-body">
          <div className="mina-matcha-title">{title}</div>
          <div className="mina-matcha-subtitle">{subtitle}</div>
          <div className="mina-matcha-rules">{rulesLine}</div>

          {/* SCALE (NOT clickable numbers; only bar + nodes clickable) */}
          <div className="mina-matcha-scale">
            {/* top labels (NOT clickable) */}
            <div className="mina-matcha-label-row" aria-hidden="true">
              {packList.map((p, i) => {
                const on = i <= activeIndex;
                return (
                  <div key={p.units} className={`mina-matcha-label ${on ? "is-on" : ""}`}>
                    {creditsFor(p.units)}
                  </div>
                );
              })}
            </div>

            {/* bar */}
            <div
              className="mina-matcha-bar"
              ref={barRef}
              onClick={onBarClick}
              role="presentation"
              style={{ ["--fillPct" as any]: `${fillPct}%` }}
            >
              <div className="mina-matcha-track" aria-hidden="true" />
              <div className="mina-matcha-fill" aria-hidden="true" />

              {/* nodes (clickable) */}
              {packList.map((p, i) => {
                const on = i <= activeIndex;
                const active = i === activeIndex;
                const leftPct = packList.length <= 1 ? 0 : (i / (packList.length - 1)) * 100;

                return (
                  <button
                    key={p.units}
                    type="button"
                    className={`mina-matcha-node ${on ? "is-on" : ""} ${active ? "is-active" : ""}`}
                    style={{ left: `${leftPct}%` }}
                    onClick={() => setQty(p.units)}
                    aria-label={`${creditsFor(p.units)} Matchas`}
                  >
                    <span className="mina-matcha-dot" aria-hidden="true" />
                  </button>
                );
              })}
            </div>

            {/* bottom prices (NOT clickable) */}
            <div className="mina-matcha-price-row" aria-hidden="true">
              {packList.map((p, i) => {
                const on = i <= activeIndex;
                return (
                  <div key={p.units} className={`mina-matcha-price ${on ? "is-on" : ""}`}>
                    {currencySymbol}
                    {priceFor(p.units).toLocaleString()}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer */}
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
            onClick={() => onConfirm(clampInt(safeQty, effectiveMin, effectiveMax))}
          >
            Purchase
          </button>
        </div>
      </div>
    </div>
  );
};

export default MatchaQtyModal;
