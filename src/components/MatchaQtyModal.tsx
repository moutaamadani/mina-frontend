// src/components/MatchaQtyModal.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";

type Pack = {
  /** How many SKU units (Shopify quantity) */
  units: number;
  /** Optional label override (defaults to baseCredits * units) */
  creditsLabel?: number;
  /** Optional price override (defaults to basePrice * units) */
  priceLabel?: number;
  /** Optional disable flag */
  disabled?: boolean;
};

type Props = {
  open: boolean;

  /**
   * qty here is Shopify "quantity" (SKU units).
   * MINA-50 pack: qty=2 means 2x SKU → 100 Matchas credited.
   */
  qty: number;
  setQty: (n: number) => void;

  onClose: () => void;
  onConfirm: (qty: number) => void;

  // Text
  title?: string;
  subtitle?: string;
  rulesLine?: string;

  // Labels only
  baseCredits?: number;    // credits per SKU unit (MINA-50 => 50)
  basePrice?: number;      // price per SKU unit (MINA-50 => 15)
  currencySymbol?: string;

  // Selection bounds for SKU units
  min?: number;
  max?: number;

  // Scale packs (SKU units)
  packs?: Pack[];

  // Default selection when opening (YOU want 2x MINA-50)
  defaultUnitsOnOpen?: number;

  // Price transparency (hidden until clicked)
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

  // Design defaults (your structured screenshot)
  title = "Airpots of Matcha Lattes",
  subtitle = "Mina uses matchas to create and animate your stills.",
  rulesLine = `One still = 1 Matcha ,  One animation = 5 Matchas ,  10 “Type for me” = 1 Matcha.`,

  // MINA-50 defaults
  baseCredits = 50,
  basePrice = 15,
  currencySymbol = "£",

  min = 1,
  max = 100,

  packs,

  // ✅ DEFAULT 2x MINA-50
  defaultUnitsOnOpen = 2,

  transparencyTitle = "Price Transparency",
  transparencyLine = "Cost £8 • New features £3 • Marketing & Branding £3 • Profit £1",
}) => {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [showTransparency, setShowTransparency] = useState(false);

  const packList: Pack[] = useMemo(() => {
    const defaultPacks: Pack[] = [
      { units: 1 },
      { units: 2 },
      { units: 4 },
      { units: 10 },
      { units: 20 },
      { units: 40 },
      { units: 100 },
    ];

    const src = (packs && packs.length ? packs : defaultPacks)
      .map((p) => ({ ...p, units: clampInt(p.units, min, max) }))
      .filter((p) => p.units >= min && p.units <= max);

    const seen = new Set<number>();
    const out: Pack[] = [];
    for (const p of src) {
      if (seen.has(p.units)) continue;
      seen.add(p.units);
      out.push(p);
    }
    out.sort((a, b) => a.units - b.units);
    return out;
  }, [packs, min, max]);

  const allowedUnits = useMemo(() => packList.map((p) => p.units), [packList]);

  // ✅ On open: if qty is 1 (or invalid / not on scale), jump to defaultUnitsOnOpen (2x MINA-50)
  useEffect(() => {
    if (!open) return;

    const safeNow = clampInt(qty, min, max);
    const isAllowed = allowedUnits.length ? allowedUnits.includes(safeNow) : true;

    const desired = clampInt(defaultUnitsOnOpen, min, max);
    const snappedDesired = allowedUnits.length ? nearest(desired, allowedUnits) : desired;

    // "default" rule:
    // - if the current selection is min (usually 1), OR not allowed, force default (2)
    if (safeNow === min || !isAllowed) {
      if (snappedDesired !== safeNow) setQty(snappedDesired);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;

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

  useEffect(() => {
    if (open) setShowTransparency(false);
  }, [open]);

  if (!open) return null;

  const safeQty = clampInt(qty, min, max);

  const isPackDisabled = (p: Pack) => !!p.disabled || p.units < min || p.units > max;

  const creditsFor = (p: Pack) => p.creditsLabel ?? p.units * baseCredits;
  const priceFor = (p: Pack) => p.priceLabel ?? p.units * basePrice;

  return (
    <div className="mina-modal-backdrop" onClick={onClose}>
      <div
        className="mina-modal mina-matcha-modal mina-qty-modal"
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        ref={panelRef}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mina-modal-header mina-matcha-header">
          <div className="mina-matcha-header-left">Get more Matcha</div>
          <button type="button" className="mina-modal-close" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="mina-matcha-body">
          <div className="mina-matcha-title">{title}</div>
          <div className="mina-matcha-subtitle">{subtitle}</div>
          <div className="mina-matcha-rules">{rulesLine}</div>

          <div className="mina-matcha-scale" role="group" aria-label="Choose pack">
            <div className="mina-matcha-line" aria-hidden="true" />
            <div className="mina-matcha-grid">
              {packList.map((p) => {
                const active = safeQty === p.units;
                const disabled = isPackDisabled(p);
                return (
                  <button
                    key={p.units}
                    type="button"
                    className={[
                      "mina-matcha-point",
                      active ? "is-active" : "",
                      disabled ? "is-disabled" : "",
                    ].join(" ")}
                    onClick={() => !disabled && setQty(p.units)}
                    aria-pressed={active}
                    disabled={disabled}
                    title={`${creditsFor(p)} Matchas`}
                  >
                    <div className="mina-matcha-credits">{creditsFor(p)}</div>
                    <div className="mina-matcha-dot" aria-hidden="true" />
                    <div className="mina-matcha-price">
                      {currencySymbol}
                      {priceFor(p).toLocaleString()}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="mina-modal-footer mina-matcha-footer">
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
            onClick={() => onConfirm(clampInt(safeQty, min, max))}
          >
            Purchase
          </button>
        </div>
      </div>
    </div>
  );
};

export default MatchaQtyModal;
