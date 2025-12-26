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
   * IMPORTANT: qty here is Shopify "quantity" (SKU units).
   * Example:
   * - If your product is "50 Matchas" and user selects 100 credits → qty=2
   */
  qty: number;
  setQty: (n: number) => void;

  onClose: () => void;
  onConfirm: (qty: number) => void;

  /**
   * Text
   */
  title?: string;          // big title (default: Airpots of Matcha Lattes)
  subtitle?: string;       // line under title
  rulesLine?: string;      // small rules text

  /**
   * Pricing model (for labels only)
   * If your Shopify product is "50 Matchas for £15", keep defaults.
   */
  baseCredits?: number;    // credits per SKU unit
  basePrice?: number;      // price per SKU unit
  currencySymbol?: string; // "£" by default

  /**
   * Selection model
   * min/max are for SKU units (Shopify quantity).
   */
  min?: number;
  max?: number;

  /**
   * Packs shown on the scale (SKU units).
   * Defaults to: 1,2,4,10,20,40,100 (50..5000 credits if baseCredits=50)
   */
  packs?: Pack[];

  /**
   * Price transparency breakdown (hidden until clicked)
   */
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

  // Design defaults to your 2nd screenshot look
  title = "Airpots of Matcha Lattes",
  subtitle = "Mina uses matchas to create and animate your stills.",
  rulesLine = `One still = 1 Matcha ,  One animation = 5 Matchas ,  10 “Type for me” = 1 Matcha.`,

  // Label defaults: 50 credits per SKU unit, £15 per SKU unit
  baseCredits = 50,
  basePrice = 15,
  currencySymbol = "£",

  min = 1,
  max = 100,

  packs,

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

    // de-dupe by units
    const seen = new Set<number>();
    const out: Pack[] = [];
    for (const p of src) {
      if (seen.has(p.units)) continue;
      seen.add(p.units);
      out.push(p);
    }

    // sort ascending
    out.sort((a, b) => a.units - b.units);
    return out;
  }, [packs, min, max]);

  const allowedUnits = useMemo(() => packList.map((p) => p.units), [packList]);

  // Make sure selection always lands on one of the visible packs
  useEffect(() => {
    if (!open) return;
    const current = clampInt(qty, min, max);
    const target = nearest(current, allowedUnits.length ? allowedUnits : [min]);
    if (target !== current) setQty(target);
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

  // reset transparency each time you open (clean UX)
  useEffect(() => {
    if (open) setShowTransparency(false);
  }, [open]);

  if (!open) return null;

  const safeQty = clampInt(qty, min, max);

  const isPackDisabled = (p: Pack) => !!p.disabled || p.units < min || p.units > max;

  const creditsFor = (p: Pack) => (p.creditsLabel ?? p.units * baseCredits);
  const priceFor = (p: Pack) => (p.priceLabel ?? p.units * basePrice);

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
        {/* Header (keep your modal system, but styled by .mina-matcha-*) */}
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

          {/* Scale */}
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

        {/* Footer */}
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
