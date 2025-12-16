// src/Profile.tsx (MEGA-first Profile)
// Shows: Pass ID, credits, expires, customer fields from mega_customers,
// and history from mega_generations (ledger) filtered by mg_pass_id.

import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "./lib/supabaseClient";
import {
  ensurePassId,
  migrateLegacyPassIdIfNeeded,
  resolveMegaTables,
  type MegaCustomerRow,
} from "./lib/megaIdentity";

function safeJson(obj: any) {
  try { return JSON.stringify(obj ?? {}, null, 2); } catch { return String(obj); }
}

function truncateId(s: string, max = 34) {
  if (!s) return "";
  if (s.length <= max) return s;
  const head = Math.max(12, Math.floor(max / 2));
  const tail = Math.max(10, max - head - 1);
  return `${s.slice(0, head)}…${s.slice(-tail)}`;
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: "6px 10px",
        borderRadius: 999,
        border: "1px solid #eee",
        background: "white",
        fontSize: 12,
        fontWeight: 800,
        lineHeight: 1,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}

function MonoBox({ label, value, collapsedLines = 8 }: { label: string; value: string; collapsedLines?: number }) {
  const [open, setOpen] = useState(false);
  const lines = value.split("\n");
  const collapsible = lines.length > collapsedLines;

  return (
    <div style={{ border: "1px solid #eee", borderRadius: 12, padding: 12, background: "white" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
        <div style={{ fontWeight: 900 }}>{label}</div>
        {collapsible && (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            style={{
              border: "1px solid #eee",
              background: "white",
              borderRadius: 10,
              padding: "6px 10px",
              fontWeight: 900,
              cursor: "pointer",
            }}
          >
            {open ? "Collapse" : "View more"}
          </button>
        )}
      </div>
      <pre style={{ whiteSpace: "pre-wrap", marginTop: 10 }}>
        {collapsible && !open ? lines.slice(0, collapsedLines).join("\n") + "\n…" : value}
      </pre>
    </div>
  );
}

type LedgerRow = any;

export default function Profile() {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [tables, setTables] = useState<{ customersTable: string; ledgerTable: string } | null>(null);

  const [passId, setPassId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);

  const [customer, setCustomer] = useState<MegaCustomerRow | null>(null);
  const [history, setHistory] = useState<LedgerRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const [selected, setSelected] = useState<LedgerRow | null>(null);

  const isLegacyBad = useMemo(() => (customer?.mg_pass_id ? /^pass:(user|shopify):/i.test(customer.mg_pass_id) : false), [customer]);

  const bootstrap = async () => {
    setLoading(true);
    setErr(null);
    try {
      const t = await resolveMegaTables();
      setTables(t);

      const ensured = await ensurePassId({ createAnonRow: true });

      setPassId(ensured.passId);
      setUserId(ensured.userId);
      setEmail(ensured.email);
      setCustomer(ensured.customer);

      // Load history
      await loadHistory(t.ledgerTable, ensured.passId);
    } catch (e: any) {
      setErr(e?.message ?? "Profile bootstrap failed");
      setHistory([]);
      setCustomer(null);
      setPassId(null);
      setUserId(null);
      setEmail(null);
    } finally {
      setLoading(false);
    }
  };

  const loadHistory = async (ledgerTable: string, pid: string) => {
    setHistoryLoading(true);
    try {
      // Pull latest ledger items for this pass
      const q = await supabase
        .from(ledgerTable)
        .select("*")
        .eq("mg_pass_id", pid)
        .order("mg_created_at", { ascending: false })
        .limit(200);

      if (q.error) throw new Error(q.error.message);
      setHistory(q.data ?? []);
      setSelected(null);
    } catch (e: any) {
      setHistory([]);
      setSelected(null);
      // keep page usable even if RLS blocks ledger
      setErr((prev) => prev ?? e?.message ?? "Failed to load history");
    } finally {
      setHistoryLoading(false);
    }
  };

  useEffect(() => {
    void bootstrap();

    // Re-bootstrap on auth change (anon -> logged in, logged out, etc)
    const { data } = supabase.auth.onAuthStateChange(() => {
      void bootstrap();
    });

    return () => {
      data.subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const headerActions = (
    <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
      <button
        type="button"
        onClick={() => void bootstrap()}
        disabled={loading}
        style={{
          border: "1px solid #eee",
          background: "white",
          borderRadius: 12,
          padding: "8px 12px",
          fontWeight: 900,
          cursor: "pointer",
        }}
      >
        {loading ? "Loading..." : "Refresh"}
      </button>

      {passId && (
        <button
          type="button"
          onClick={() => navigator.clipboard?.writeText(passId)}
          style={{
            border: "1px solid #eee",
            background: "white",
            borderRadius: 12,
            padding: "8px 12px",
            fontWeight: 900,
            cursor: "pointer",
          }}
        >
          Copy Pass ID
        </button>
      )}

      {isLegacyBad && (
        <button
          type="button"
          onClick={async () => {
            const ok = window.confirm(
              "Your account uses a legacy/bad Pass ID format (pass:user:...).\n\nFix it now?\nThis will:\n- Create a new pass_XXX id\n- Move mega_generations rows to the new id\n- Soft-delete the old customer row\n\nOnly works if RLS allows updates."
            );
            if (!ok) return;
            try {
              const res = await migrateLegacyPassIdIfNeeded();
              alert(res.changed ? `Pass ID fixed ✅\nNew: ${res.passId}` : "No change needed.");
              await bootstrap();
            } catch (e: any) {
              alert(e?.message ?? "Migration failed");
            }
          }}
          style={{
            border: "1px solid #eee",
            background: "white",
            borderRadius: 12,
            padding: "8px 12px",
            fontWeight: 900,
            cursor: "pointer",
          }}
        >
          Fix Pass ID
        </button>
      )}

      <button
        type="button"
        onClick={async () => {
          await supabase.auth.signOut();
          window.location.replace("/");
        }}
        style={{
          border: "1px solid #eee",
          background: "white",
          borderRadius: 12,
          padding: "8px 12px",
          fontWeight: 900,
          cursor: "pointer",
        }}
      >
        Sign out
      </button>
    </div>
  );

  if (loading) {
    return <div style={{ padding: 24 }}>Loading profile…</div>;
  }

  return (
    <div style={{ padding: 24, maxWidth: 1100, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 26, fontWeight: 1000 }}>Profile</div>
          <div style={{ opacity: 0.7, marginTop: 4 }}>
            MEGA identity is <strong>Pass ID</strong>. Credits/history load by pass.
          </div>
        </div>
        {headerActions}
      </div>

      {err && (
        <div style={{ padding: 12, marginTop: 14, border: "1px solid crimson", color: "crimson", borderRadius: 12 }}>
          <strong>Error:</strong> {err}
          <div style={{ marginTop: 6, color: "#333" }}>
            If everything is empty: it’s usually <strong>RLS</strong> blocking reads on mega tables.
          </div>
        </div>
      )}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 14 }}>
        {tables && <Chip>customers: {tables.customersTable}</Chip>}
        {tables && <Chip>ledger: {tables.ledgerTable}</Chip>}
        {passId && <Chip>pass: {truncateId(passId)}</Chip>}
        {email && <Chip>email: {email}</Chip>}
        {userId && <Chip>user_id: {truncateId(userId, 28)}</Chip>}
        {customer?.mg_shopify_customer_id && <Chip>shopify: {truncateId(customer.mg_shopify_customer_id, 28)}</Chip>}
      </div>

      {/* CUSTOMER SUMMARY */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginTop: 14 }}>
        <div style={{ border: "1px solid #eee", borderRadius: 12, padding: 12, background: "white" }}>
          <div style={{ fontWeight: 1000 }}>Credits</div>
          <div style={{ fontSize: 28, fontWeight: 1000, marginTop: 8 }}>
            {customer ? Number(customer.mg_credits ?? 0) : "—"}
          </div>
          <div style={{ opacity: 0.7, marginTop: 6 }}>From mega_customers.mg_credits</div>
        </div>

        <div style={{ border: "1px solid #eee", borderRadius: 12, padding: 12, background: "white" }}>
          <div style={{ fontWeight: 1000 }}>Expires</div>
          <div style={{ fontSize: 16, fontWeight: 900, marginTop: 10 }}>
            {customer?.mg_expires_at ? String(customer.mg_expires_at).slice(0, 19) : "—"}
          </div>
          <div style={{ opacity: 0.7, marginTop: 6 }}>From mega_customers.mg_expires_at</div>
        </div>

        <div style={{ border: "1px solid #eee", borderRadius: 12, padding: 12, background: "white" }}>
          <div style={{ fontWeight: 1000 }}>Verification</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
            <Chip>email: {customer?.mg_verified_email ? "✅" : "—"}</Chip>
            <Chip>google: {customer?.mg_verified_google ? "✅" : "—"}</Chip>
            <Chip>apple: {customer?.mg_verified_apple ? "✅" : "—"}</Chip>
          </div>
          <div style={{ opacity: 0.7, marginTop: 8 }}>Flags in mega_customers</div>
        </div>
      </div>

      {/* HISTORY */}
      <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr", gap: 12, marginTop: 14 }}>
        <div style={{ border: "1px solid #eee", borderRadius: 12, padding: 12, background: "white" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <div>
              <div style={{ fontWeight: 1000 }}>History (MEGA ledger)</div>
              <div style={{ opacity: 0.7, marginTop: 4 }}>
                From mega_generations where <code>mg_pass_id = {truncateId(passId || "", 26)}</code>
              </div>
            </div>

            <button
              type="button"
              onClick={() => tables && passId && loadHistory(tables.ledgerTable, passId)}
              disabled={!tables || !passId || historyLoading}
              style={{
                border: "1px solid #eee",
                background: "white",
                borderRadius: 12,
                padding: "8px 12px",
                fontWeight: 900,
                cursor: "pointer",
              }}
            >
              {historyLoading ? "Loading..." : "Reload history"}
            </button>
          </div>

          {history.length === 0 && (
            <div style={{ marginTop: 12, opacity: 0.7 }}>
              No ledger rows yet (or RLS blocked). Try generating something, then refresh.
            </div>
          )}

          <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
            {history.slice(0, 80).map((r, idx) => {
              const id = String(r?.mg_id ?? "");
              const type = String(r?.mg_record_type ?? "unknown");
              const at = String(r?.mg_created_at ?? r?.created_at ?? "");
              const provider = String(r?.mg_provider ?? "");
              const model = String(r?.mg_model ?? "");
              const status = String(r?.mg_status ?? "");
              const errMsg = String(r?.mg_error ?? "");
              const title = String(r?.mg_title ?? "");
              const prompt = String(r?.mg_prompt ?? "");

              const label = title || prompt || type;

              return (
                <button
                  key={`${id}-${idx}`}
                  type="button"
                  onClick={() => setSelected(r)}
                  style={{
                    textAlign: "left",
                    border: "1px solid #eee",
                    background: selected === r ? "#fafafa" : "white",
                    borderRadius: 12,
                    padding: 12,
                    cursor: "pointer",
                  }}
                >
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                    <Chip>{type}</Chip>
                    {provider && <Chip>provider: {provider}</Chip>}
                    {model && <Chip>model: {truncateId(model, 22)}</Chip>}
                    {status && <Chip>status: {status}</Chip>}
                    {errMsg && <Chip>❌ error</Chip>}
                    <span style={{ opacity: 0.7, fontSize: 12 }}>{at}</span>
                  </div>

                  <div style={{ marginTop: 10, fontWeight: 900 }}>
                    {label ? (label.length > 140 ? label.slice(0, 140) + "…" : label) : "—"}
                  </div>

                  <div style={{ opacity: 0.7, marginTop: 6, fontSize: 12 }}>
                    mg_id: {truncateId(id, 40)}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* DETAILS */}
        <div style={{ display: "grid", gap: 12 }}>
          <div style={{ border: "1px solid #eee", borderRadius: 12, padding: 12, background: "white" }}>
            <div style={{ fontWeight: 1000 }}>Details</div>
            <div style={{ opacity: 0.7, marginTop: 6 }}>Select a history row to inspect.</div>
          </div>

          {selected && (
            <div style={{ display: "grid", gap: 12 }}>
              <MonoBox label="mg_prompt" value={safeJson(selected?.mg_prompt ?? "")} collapsedLines={10} />
              <MonoBox label="mg_output_url" value={safeJson(selected?.mg_output_url ?? "")} />
              <MonoBox label="mg_error" value={safeJson(selected?.mg_error ?? "")} />
              <MonoBox label="mg_provider / mg_model / tokens / latency" value={safeJson({
                mg_provider: selected?.mg_provider,
                mg_model: selected?.mg_model,
                mg_input_tokens: selected?.mg_input_tokens,
                mg_output_tokens: selected?.mg_output_tokens,
                mg_latency_ms: selected?.mg_latency_ms,
                mg_status: selected?.mg_status,
              })} />
              <MonoBox label="Raw JSON" value={safeJson(selected)} collapsedLines={16} />
            </div>
          )}
        </div>
      </div>

      {/* RAW CUSTOMER */}
      <details style={{ marginTop: 14 }}>
        <summary style={{ cursor: "pointer", fontWeight: 1000 }}>View more (raw mega_customers row)</summary>
        <pre style={{ whiteSpace: "pre-wrap", marginTop: 12 }}>{safeJson(customer)}</pre>
      </details>
    </div>
  );
}
