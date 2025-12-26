// src/components/MatchaQtyModal.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";

type Pack = {
  units: number; // Shopify qty units
  disabled?: boolean;
};

type Props = {
  open: boolean;

  // Shopify quantity (MINA-50 units)
  qty: number;
  setQty: (n: number) => void;

  onClose: () => void;
  onConfirm: (qty: number) => void;

  // Text (optional)
  topLabel?: string; // small label in top-left
  title?: string; // big title
  subtitle?: string;
  rulesLine?: string;

  // MINA-50 defaults (labels only)
  baseCredits?: number; // credits per unit (MINA-50 => 50)
  basePrice?: number; // price per unit (MINA-50 => 15)
  currencySymbol?: string;

  // if parent passes max smaller, we IGNORE it because you want always up to 5000 credits
  min?: number;
  max?: number;

  // scale packs (units). default creates 50..5000 credits with baseCredits=50
  packs?: Pack[];

  // default selection on open (2x MINA-50)
  defaultUnitsOnOpen?: number;

  // transparency
  transparencyTitle?: string;
  transparencyLine?: string;
};

const clampInt = (v: number, min: number, max: number) => {
  const n = Math.floor(Number(v || 0));
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
};

const nearest = (value: number, list: number[]) => {
  if (!list.length) return value;
  let best = list[0];
  let bestD = Math.abs(value - best);
  for (const n of list) {
    const d = Math.abs(value - n);
    if (d < bestD) {
      best = n;
      bestD = d;
    }
  }
  return best;
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
  const [showTransparency, setShowTransparency] = useState(false);

  // ✅ You want maximum 5000 credits always => 100 units always
  const effectiveMin = Math.max(1, min);
  const effectiveMax = Math.max(100, max); // force >= 100

  const packList: Pack[] = useMemo(() => {
    const defaultPacks: Pack[] = [
      { units: 1 },   // 50
      { units: 2 },   // 100
      { units: 4 },   // 200
      { units: 10 },  // 500
      { units: 20 },  // 1000
      { units: 40 },  // 2000
      { units: 100 }, // 5000
    ];

    const src = (packs && packs.length ? packs : defaultPacks)
      .map((p) => ({ ...p, units: clampInt(p.units, effectiveMin, effectiveMax) }))
      .filter((p) => p.units >= effectiveMin && p.units <= effectiveMax);

    // de-dupe and sort
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

  const allowedUnits = useMemo(() => packList.map((p) => p.units), [packList]);

  // ✅ Default to 2x MINA-50 when opening (unless user already has another valid selection)
  useEffect(() => {
    if (!open) return;

    const safeNow = clampInt(qty, effectiveMin, effectiveMax);
    const isAllowed = allowedUnits.length ? allowedUnits.includes(safeNow) : true;

    const desired = clampInt(defaultUnitsOnOpen, effectiveMin, effectiveMax);
    const snappedDesired = allowedUnits.length ? nearest(desired, allowedUnits) : desired;

    // If current is min (usually 1) OR not on the scale → jump to 2
    if (safeNow === effectiveMin || !isAllowed) {
      if (snappedDesired !== safeNow) setQty(snappedDesired);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // keyboard + focus
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

  // reset transparency each open
  useEffect(() => {
    if (open) setShowTransparency(false);
  }, [open]);

  if (!open) return null;

  const safeQty = clampInt(qty, effectiveMin, effectiveMax);

  const creditsFor = (units: number) => units * baseCredits;
  const priceFor = (units: number) => units * basePrice;

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
        {/* Top bar exactly like inspiration: small left label + Close right */}
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

          {/* Scale */}
          <div className="mina-matcha-scale" role="group" aria-label="Choose quantity">
            <div className="mina-matcha-points">
              {packList.map((p) => {
                const active = safeQty === p.units;
                const disabled = !!p.disabled;

                return (
                  <button
                    key={p.units}
                    type="button"
                    className={[
                      "mina-matcha-point",
                      active ? "is-active" : "",
                      !active ? "is-dim" : "",
                      disabled ? "is-disabled" : "",
                    ].join(" ")}
                    onClick={() => !disabled && setQty(p.units)}
                    aria-pressed={active}
                    disabled={disabled}
                    title={`${creditsFor(p.units)} Matchas`}
                  >
                    <div className="mina-matcha-credits">{creditsFor(p.units)}</div>
                    <div className="mina-matcha-dot" aria-hidden="true" />
                    <div className="mina-matcha-price">
                      {currencySymbol}
                      {priceFor(p.units).toLocaleString()}
                    </div>
                  </button>
                );
              })}
              <div className="mina-matcha-line" aria-hidden="true" />
            </div>
          </div>
        </div>

        {/* Footer like inspiration */}
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
