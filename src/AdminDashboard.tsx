// AdminDashboard.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "./lib/supabaseClient";
import { isAdmin } from "./lib/adminConfig";
import RuntimeConfigEditor from "./components/RuntimeConfigEditor";
import RuntimeConfigFlatEditor from "./components/RuntimeConfigFlatEditor";
import "./admin.css";

/**
 * Tabs kept:
 * - Runtime Config
 * - AI Config (reads/writes a flat Supabase table)
 * - Customers
 * - Generations (can delete)
 * - Feedback (can delete)
 * - Logs (realtime, fullscreen lines)
 */

type TabKey = "runtime" | "ai" | "customers" | "generations" | "feedback" | "logs";

const TAB_LABELS: Record<TabKey, string> = {
  runtime: "Runtime Config",
  ai: "AI Config (Flat table)",
  customers: "Customers",
  generations: "Generations",
  feedback: "Feedback",
  logs: "Logs (Realtime)",
};

// ✅ CHANGE THIS if your table name is different
const AI_FLAT_TABLE = "flat_ai_config";
// ✅ CHANGE THIS if your logs table name is different
const LOGS_TABLE = "logs";

/* -----------------------------
   UI bits
------------------------------ */

function AdminHeader({
  rightStatus,
  rightActions,
}: {
  rightStatus?: React.ReactNode;
  rightActions?: React.ReactNode;
}) {
  return (
    <header className="admin-header">
      <div>
        <div className="admin-title">Mina Admin</div>
        <div className="admin-subtitle">Editorial dashboard (Supabase live data)</div>
      </div>
      <div className="admin-actions">
        {rightStatus}
        {rightActions}
      </div>
    </header>
  );
}

function Section({
  title,
  description,
  children,
}: React.PropsWithChildren<{ title: string; description?: string }>) {
  return (
    <section className="admin-section">
      <header>
        <div className="admin-section-title">{title}</div>
        {description && <p className="admin-section-desc">{description}</p>}
      </header>
      {children}
    </section>
  );
}

function Table({ headers, children }: React.PropsWithChildren<{ headers: string[] }>) {
  return (
    <div className="admin-table">
      <div className="admin-table-head">
        {headers.map((h) => (
          <div key={h}>{h}</div>
        ))}
      </div>
      <div className="admin-table-body">{children}</div>
    </div>
  );
}

function StickyTabs({ active, onChange }: { active: TabKey; onChange: (k: TabKey) => void }) {
  return (
    <nav className="admin-tabs">
      {(Object.keys(TAB_LABELS) as TabKey[]).map((key) => (
        <button
          key={key}
          className={`admin-tab ${active === key ? "active" : ""}`}
          onClick={() => onChange(key)}
        >
          {TAB_LABELS[key]}
        </button>
      ))}
    </nav>
  );
}

function useAdminGuard() {
  const [allowed, setAllowed] = useState<boolean | null>(null);

  useEffect(() => {
    let mounted = true;

    const check = async () => {
      try {
        const { data } = await supabase.auth.getUser();
        const email = data.user?.email?.toLowerCase() || "";

        if (!email) {
          window.location.replace("/profile");
          return;
        }

        const ok = await isAdmin();
        if (!mounted) return;

        setAllowed(ok);
        if (!ok) window.location.replace("/");
      } catch {
        if (mounted) setAllowed(false);
        window.location.replace("/");
      }
    };

    void check();
    return () => {
      mounted = false;
    };
  }, []);

  return allowed;
}

/* -----------------------------
   Helpers
------------------------------ */

function pickFirstKey(row: any, keys: string[]) {
  for (const k of keys) {
    if (row && Object.prototype.hasOwnProperty.call(row, k)) return k;
  }
  return null;
}

function pickString(row: any, keys: string[], fallback = ""): string {
  for (const k of keys) {
    const v = row?.[k];
    if (typeof v === "string" && v.trim()) return v;
  }
  return fallback;
}

function pickNumber(row: any, keys: string[], fallback = 0): number {
  for (const k of keys) {
    const v = row?.[k];
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string" && v.trim() && !Number.isNaN(Number(v))) return Number(v);
  }
  return fallback;
}

function safeJson(obj: any) {
  try {
    return JSON.stringify(obj ?? {}, null, 2);
  } catch {
    return String(obj);
  }
}

function extractLikelyImageUrl(row: any): string | null {
  const keys = Object.keys(row || {});
  const urlKey =
    keys.find((k) => /^(url|image_url|output_url|result_url|asset_url)$/i.test(k)) ||
    keys.find((k) => /(url|image|output|result)/i.test(k) && typeof row?.[k] === "string");
  const val = urlKey ? row?.[urlKey] : null;
  return typeof val === "string" && val.startsWith("http") ? val : null;
}

function highlightTraceFields(row: any) {
  const keys = Object.keys(row || {});
  const candidates = [
    "gpt_input",
    "gpt_prompt",
    "llm_input",
    "llm_prompt",
    "system_prompt",
    "messages",
    "gpt_output",
    "llm_output",
    "caption",
    "text_output",
    "seedream_prompt",
    "image_prompt",
    "seedream_input",
    "seedream_output",
    "image_url",
    "output_url",
    "url",
    "params",
    "meta",
    "metadata",
    "trace",
    "debug",
  ];

  const present = candidates
    .map((k) => {
      const hit = keys.find((kk) => kk.toLowerCase() === k.toLowerCase());
      return hit || null;
    })
    .filter(Boolean) as string[];

  for (const k of keys) {
    if (/gpt|llm|seedream|prompt|output|trace|debug/i.test(k) && !present.includes(k)) {
      present.push(k);
    }
  }

  return present.slice(0, 18);
}

function truncateId(s: string, max = 22) {
  if (!s) return "";
  if (s.length <= max) return s;
  const head = Math.max(8, Math.floor(max / 2));
  const tail = Math.max(6, max - head - 1);
  return `${s.slice(0, head)}…${s.slice(-tail)}`;
}

/* -----------------------------
   Generic RAW Viewer
------------------------------ */

function RawViewer({ row }: { row: any }) {
  const url = extractLikelyImageUrl(row);
  const highlights = highlightTraceFields(row);

  return (
    <div className="admin-detail">
      {url && (
        <div style={{ marginBottom: 12 }}>
          <strong>Preview</strong>
          <div style={{ marginTop: 8 }}>
            <img src={url} alt="output" style={{ maxWidth: "100%", borderRadius: 12 }} />
          </div>
        </div>
      )}

      {highlights.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <strong>Important fields (auto-detected)</strong>
          <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
            {highlights.map((k) => (
              <div key={k} style={{ border: "1px solid #eee", borderRadius: 10, padding: 10 }}>
                <div style={{ fontWeight: 700, marginBottom: 6 }}>{k}</div>
                <pre style={{ whiteSpace: "pre-wrap", margin: 0 }}>{safeJson(row?.[k])}</pre>
              </div>
            ))}
          </div>
        </div>
      )}

      <details>
        <summary style={{ cursor: "pointer", fontWeight: 700 }}>Raw JSON (everything)</summary>
        <pre style={{ whiteSpace: "pre-wrap" }}>{safeJson(row)}</pre>
      </details>
    </div>
  );
}

/* -----------------------------
   Live Data helpers
------------------------------ */

type LiveRow = {
  rowKey: string;
  id: string;
  label: string;
  createdAt?: string;
  raw: any;
};

async function loadTable(table: string, limit = 500, orderCol = "created_at") {
  const attempt = await supabase.from(table).select("*").order(orderCol, { ascending: false }).limit(limit);
  if (!attempt.error) return attempt.data ?? [];

  const fallback = await supabase.from(table).select("*").limit(limit);
  if (fallback.error) throw new Error(fallback.error.message);
  return fallback.data ?? [];
}

function makeRowsFromAny(table: string, rows: any[]): LiveRow[] {
  return rows.map((r, idx) => {
    const id =
      pickString(r, ["id", "uuid", "generation_id", "session_id", "tx_id"], "") ||
      pickString(r, ["user_id", "customer_id", "shopify_customer_id", "email"], "") ||
      `${table}-${idx}`;

    const createdAt = pickString(r, ["created_at", "inserted_at", "at", "timestamp"], "");

    const label =
      pickString(r, ["prompt", "input_prompt", "caption", "text"], "") ||
      pickString(r, ["email", "user_email"], "") ||
      pickString(r, ["shopify_customer_id", "customer_id"], "") ||
      pickString(r, ["user_id"], "") ||
      pickString(r, ["status"], "") ||
      id;

    const rowKey = `${table}:${id}:${createdAt || "no-time"}:${idx}`;
    return { rowKey, id, label, createdAt: createdAt || undefined, raw: r };
  });
}

async function deleteRowByBestPk(table: string, raw: any) {
  const pk = pickFirstKey(raw, [
    "id",
    "uuid",
    "generation_id",
    "gen_id",
    "feedback_id",
    "session_id",
    "tx_id",
  ]);
  if (!pk) throw new Error("No obvious primary key field found to delete this row.");
  const pkVal = raw?.[pk];
  const { error } = await supabase.from(table).delete().eq(pk, pkVal);
  if (error) throw new Error(error.message);
}

/* -----------------------------
   LiveTableTab (Generations / Feedback) + delete
------------------------------ */

function LiveTableTab({
  tableName,
  title,
  description,
  rows,
  loading,
  error,
  onRefresh,
  filterLabel,
  allowDelete,
}: {
  tableName: string;
  title: string;
  description: string;
  rows: LiveRow[];
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
  filterLabel?: React.ReactNode;
  allowDelete?: boolean;
}) {
  const [selected, setSelected] = useState<LiveRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (selected && !rows.find((x) => x.rowKey === selected.rowKey)) setSelected(null);
  }, [rows, selected]);

  const doDelete = async () => {
    if (!selected) return;
    const ok = window.confirm(`Delete this row from "${tableName}"?\n\nID: ${selected.id}`);
    if (!ok) return;

    setDeleting(true);
    try {
      await deleteRowByBestPk(tableName, selected.raw);
      setSelected(null);
      onRefresh();
    } catch (e: any) {
      alert(e?.message ?? "Delete failed");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="admin-grid admin-split">
      <Section title={title} description={description}>
        <div className="admin-inline">
          {filterLabel}
          <button className="admin-button ghost" type="button" onClick={onRefresh} disabled={loading}>
            {loading ? "Refreshing..." : "Refresh"}
          </button>
          <button
            className="admin-button ghost"
            type="button"
            onClick={() => navigator.clipboard?.writeText(JSON.stringify(rows.map((r) => r.raw), null, 2))}
          >
            Copy JSON
          </button>
          {allowDelete && (
            <button
              className="admin-button"
              type="button"
              onClick={doDelete}
              disabled={!selected || deleting}
              title={!selected ? "Select a row first" : "Delete selected"}
            >
              {deleting ? "Deleting..." : "Delete selected"}
            </button>
          )}
        </div>

        {error && (
          <div style={{ padding: 12, marginTop: 10, border: "1px solid crimson", color: "crimson", borderRadius: 8 }}>
            <strong>Load error:</strong> {error}
            <div style={{ marginTop: 6, color: "#333" }}>
              Usually: wrong table name, missing columns in order(), or RLS blocked your admin.
            </div>
          </div>
        )}

        {!error && !loading && rows.length === 0 && (
          <div className="admin-muted" style={{ padding: 12 }}>
            No rows found.
          </div>
        )}

        <div className="admin-grid-gallery">
          {rows.slice(0, 250).map((r) => {
            const url = extractLikelyImageUrl(r.raw);
            return (
              <button
                key={r.rowKey}
                className={`admin-grid-card ${selected?.rowKey === r.rowKey ? "active" : ""}`}
                onClick={() => setSelected(r)}
              >
                {url ? <img src={url} alt={r.label} loading="lazy" /> : <div className="admin-placeholder">no preview</div>}
                <div className="admin-grid-meta">
                  <div className="admin-grid-prompt">{r.label || <span className="admin-muted">—</span>}</div>
                  <div className="admin-grid-sub">
                    {truncateId(r.id)} • {r.createdAt || "—"}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </Section>

      <Section title="Details" description="Everything stored for this row">
        {selected ? <RawViewer row={selected.raw} /> : <p className="admin-muted">Select a row to inspect.</p>}
      </Section>
    </div>
  );
}

/* -----------------------------
   Customers (editable credits)
------------------------------ */

type CustomerRow = {
  pkCol: string;
  pkVal: string;
  email: string;
  userId: string | null;
  shopifyCustomerId: string | null;
  credits: number;
  expiresAt: string | null;
  lastActive: string | null;
  raw: any;
};

function normalizeCustomers(rows: any[]): CustomerRow[] {
  return rows.map((r) => {
    const userId = pickString(r, ["user_id", "uid"], "") || null;
    const shopifyCustomerId = pickString(r, ["shopify_customer_id", "shopify_id", "customer_id"], "") || null;
    const email = pickString(r, ["email", "user_email"], "") || (shopifyCustomerId?.includes("@") ? shopifyCustomerId : "(no email)");

    const credits = pickNumber(r, ["credits", "credit", "balance"], 0);
    const expiresAt = pickString(r, ["expires_at", "expiresAt"], "") || null;
    const lastActive = pickString(r, ["last_active", "lastActive", "updated_at"], "") || null;

    let pkCol = "shopify_customer_id";
    let pkVal = shopifyCustomerId || email;

    if (userId) {
      pkCol = "user_id";
      pkVal = userId;
    } else if (pickString(r, ["id"], "")) {
      pkCol = "id";
      pkVal = String(r.id);
    } else if (shopifyCustomerId) {
      pkCol = "shopify_customer_id";
      pkVal = shopifyCustomerId;
    } else if (email) {
      pkCol = "email";
      pkVal = email;
    }

    return { pkCol, pkVal, email, userId, shopifyCustomerId, credits, expiresAt, lastActive, raw: r };
  });
}

async function updateCustomerCreditsAndExpiry(opts: {
  table: string;
  customer: CustomerRow;
  nextCredits: number;
  nextExpiresAt: string | null;
}) {
  const { table, customer, nextCredits, nextExpiresAt } = opts;

  const patch: any = {};
  const creditCol = pickFirstKey(customer.raw, ["credits", "credit", "balance"]) || "credits";
  patch[creditCol] = nextCredits;

  const expCol = pickFirstKey(customer.raw, ["expires_at", "expiresAt"]);
  if (expCol) patch[expCol] = nextExpiresAt;

  const q = supabase.from(table).update(patch).eq(customer.pkCol, customer.pkVal);
  const { error } = await q;
  if (error) throw new Error(error.message);
}

function CustomersTab({
  customers,
  loading,
  error,
  onRefresh,
  customersTable,
}: {
  customers: CustomerRow[];
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
  customersTable: string;
}) {
  const [local, setLocal] = useState<CustomerRow[]>([]);
  const [dirtyMap, setDirtyMap] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setLocal(customers);
    setDirtyMap({});
  }, [customers]);

  const updateRow = (idx: number, next: CustomerRow) => {
    const copy = [...local];
    copy[idx] = next;
    setLocal(copy);
    setDirtyMap((m) => ({ ...m, [next.pkCol + ":" + next.pkVal]: true }));
  };

  const anyDirty = Object.values(dirtyMap).some(Boolean);

  const saveAll = async () => {
    setSaving(true);
    try {
      for (const c of local) {
        const key = c.pkCol + ":" + c.pkVal;
        if (!dirtyMap[key]) continue;
        // eslint-disable-next-line no-await-in-loop
        await updateCustomerCreditsAndExpiry({
          table: customersTable,
          customer: customers.find((x) => x.pkCol === c.pkCol && x.pkVal === c.pkVal) || c,
          nextCredits: c.credits,
          nextExpiresAt: c.expiresAt,
        });
      }
      alert("Customers saved ✅");
      setDirtyMap({});
      onRefresh();
    } catch (e: any) {
      alert(e?.message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="admin-grid">
      <Section title="Customers" description={`Live data from Supabase table "${customersTable}" (edit credits).`}>
        <div className="admin-inline">
          <button className="admin-button ghost" type="button" onClick={onRefresh} disabled={loading}>
            {loading ? "Refreshing..." : "Refresh"}
          </button>
          <button className="admin-button" type="button" onClick={saveAll} disabled={!anyDirty || saving}>
            {saving ? "Saving..." : "Save edits"}
          </button>
          {anyDirty && <span className="admin-muted">Unsaved changes.</span>}
        </div>

        {error && (
          <div style={{ padding: 12, marginTop: 10, border: "1px solid crimson", color: "crimson", borderRadius: 8 }}>
            <strong>Customers load error:</strong> {error}
          </div>
        )}

        <Table headers={["Email / ID", "Credits", "Expires", "Last active"]}>
          {local.map((c, idx) => (
            <div className="admin-table-row" key={`${c.pkCol}:${c.pkVal}`}>
              <div style={{ display: "grid" }}>
                <div style={{ fontWeight: 700 }}>{c.email}</div>
                <div className="admin-muted" style={{ fontSize: 12 }}>
                  {c.userId ? `user_id: ${truncateId(c.userId)}` : c.shopifyCustomerId ? `shopify: ${truncateId(c.shopifyCustomerId)}` : `${c.pkCol}: ${truncateId(c.pkVal)}`}
                </div>
              </div>

              <div>
                <input type="number" value={c.credits} onChange={(e) => updateRow(idx, { ...c, credits: Number(e.target.value) || 0 })} />
              </div>

              <div>
                <input
                  type="date"
                  value={(c.expiresAt || "").slice(0, 10)}
                  onChange={(e) => updateRow(idx, { ...c, expiresAt: e.target.value || null })}
                />
              </div>

              <div>{c.lastActive || "—"}</div>
            </div>
          ))}
        </Table>
      </Section>
    </div>
  );
}

/* -----------------------------
   AI Flat Config tab
------------------------------ */

type FlatAiDraft = {
  defaultProvider: string;
  defaultModel: string;
  temperature: number;
  topP: number;
  maxTokens: number;
  context: string;
  providerParamsJson: string; // JSON string (pre-filled)
};

function normalizeFlatAiRow(row: any): FlatAiDraft {
  const providerParams =
    row?.provider_params ??
    row?.providerParams ??
    row?.provider_parameters ??
    row?.providerParameters ??
    {};

  return {
    defaultProvider: pickString(row, ["default_provider", "defaultProvider", "provider", "default_provider_name"], ""),
    defaultModel: pickString(row, ["default_model", "defaultModel", "model", "default_model_name"], ""),
    temperature: pickNumber(row, ["temperature", "temp"], 0.7),
    topP: pickNumber(row, ["top_p", "topP"], 1),
    maxTokens: pickNumber(row, ["max_tokens", "maxTokens"], 1024),
    context: pickString(row, ["context", "system_prompt", "systemPrompt", "prompt"], ""),
    providerParamsJson: safeJson(providerParams),
  };
}

async function loadFlatAiConfig() {
  const { data, error } = await supabase.from(AI_FLAT_TABLE).select("*").limit(1).maybeSingle();
  if (error) throw new Error(error.message);
  return data ?? null;
}

async function saveFlatAiConfig(existingRow: any | null, draft: FlatAiDraft) {
  let providerParams: any = {};
  try {
    providerParams = draft.providerParamsJson?.trim() ? JSON.parse(draft.providerParamsJson) : {};
  } catch {
    throw new Error("Provider params JSON is invalid. Fix it before saving.");
  }

  const patch: any = {};
  const cols = {
    defaultProvider: pickFirstKey(existingRow ?? {}, ["default_provider", "defaultProvider"]) || "default_provider",
    defaultModel: pickFirstKey(existingRow ?? {}, ["default_model", "defaultModel"]) || "default_model",
    temperature: pickFirstKey(existingRow ?? {}, ["temperature", "temp"]) || "temperature",
    topP: pickFirstKey(existingRow ?? {}, ["top_p", "topP"]) || "top_p",
    maxTokens: pickFirstKey(existingRow ?? {}, ["max_tokens", "maxTokens"]) || "max_tokens",
    context: pickFirstKey(existingRow ?? {}, ["context", "system_prompt", "systemPrompt", "prompt"]) || "context",
    providerParams: pickFirstKey(existingRow ?? {}, ["provider_params", "providerParams"]) || "provider_params",
  };

  patch[cols.defaultProvider] = draft.defaultProvider;
  patch[cols.defaultModel] = draft.defaultModel;
  patch[cols.temperature] = draft.temperature;
  patch[cols.topP] = draft.topP;
  patch[cols.maxTokens] = draft.maxTokens;
  patch[cols.context] = draft.context;
  patch[cols.providerParams] = providerParams;

  // update existing row if possible
  if (existingRow) {
    const pkCol = pickFirstKey(existingRow, ["id", "key", "name"]);
    if (!pkCol) {
      // fallback: update first row by upsert with id=default
      patch.id = "default";
      const { error } = await supabase.from(AI_FLAT_TABLE).upsert(patch);
      if (error) throw new Error(error.message);
      return;
    }

    const pkVal = existingRow[pkCol];
    const { error } = await supabase.from(AI_FLAT_TABLE).update(patch).eq(pkCol, pkVal);
    if (error) throw new Error(error.message);
    return;
  }

  // no row exists -> create singleton row
  patch.id = "default";
  const { error } = await supabase.from(AI_FLAT_TABLE).insert(patch);
  if (error) throw new Error(error.message);
}

function FlatAiConfigTab({
  row,
  draft,
  setDraft,
  loading,
  error,
  onRefresh,
  onSave,
  saving,
  dirty,
}: {
  row: any | null;
  draft: FlatAiDraft | null;
  setDraft: (next: FlatAiDraft) => void;
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
  onSave: () => void;
  saving: boolean;
  dirty: boolean;
}) {
  if (loading || !draft) {
    return (
      <div className="admin-grid">
        <Section title="AI Config" description={`Loading from Supabase table "${AI_FLAT_TABLE}"…`}>
          <div style={{ padding: 12 }}>Loading…</div>
        </Section>
      </div>
    );
  }

  return (
    <div className="admin-grid">
      <Section title="AI Config (Flat)" description={`Edit the existing row in "${AI_FLAT_TABLE}" then hit Save.`}>
        <div className="admin-inline">
          <button className="admin-button ghost" type="button" onClick={onRefresh} disabled={loading || saving}>
            Refresh
          </button>
          <button className="admin-button" type="button" onClick={onSave} disabled={saving || !dirty}>
            {saving ? "Saving..." : "Save"}
          </button>
          {!dirty ? <span className="admin-muted">No changes.</span> : <span className="admin-muted">Unsaved changes.</span>}
        </div>

        {error && (
          <div style={{ padding: 12, marginTop: 10, border: "1px solid crimson", color: "crimson", borderRadius: 8 }}>
            <strong>AI config error:</strong> {error}
          </div>
        )}

        <div className="admin-inline" style={{ marginTop: 12 }}>
          <label>
            <strong>Default provider</strong>
            <input
              value={draft.defaultProvider}
              onChange={(e) => setDraft({ ...draft, defaultProvider: e.target.value })}
            />
          </label>

          <label>
            <strong>Default model</strong>
            <input
              value={draft.defaultModel}
              onChange={(e) => setDraft({ ...draft, defaultModel: e.target.value })}
            />
          </label>

          <label>
            <strong>Temperature</strong>
            <input
              type="number"
              step="0.1"
              value={draft.temperature}
              onChange={(e) => setDraft({ ...draft, temperature: Number(e.target.value) || 0 })}
            />
          </label>

          <label>
            <strong>top_p</strong>
            <input
              type="number"
              step="0.05"
              value={draft.topP}
              onChange={(e) => setDraft({ ...draft, topP: Number(e.target.value) || 0 })}
            />
          </label>

          <label>
            <strong>Max tokens</strong>
            <input
              type="number"
              value={draft.maxTokens}
              onChange={(e) => setDraft({ ...draft, maxTokens: Number(e.target.value) || 0 })}
            />
          </label>
        </div>

        <label style={{ display: "block", marginTop: 12 }}>
          <strong>Context (system prompt override)</strong>
          <textarea
            className="admin-textarea"
            value={draft.context}
            onChange={(e) => setDraft({ ...draft, context: e.target.value })}
          />
        </label>

        <label style={{ display: "block", marginTop: 12 }}>
          <strong>Provider params (JSON)</strong>
          <textarea
            className="admin-textarea"
            value={draft.providerParamsJson}
            onChange={(e) => setDraft({ ...draft, providerParamsJson: e.target.value })}
            style={{ minHeight: 220, fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" }}
          />
        </label>

        <details style={{ marginTop: 12 }}>
          <summary style={{ cursor: "pointer", fontWeight: 700 }}>Raw row (from DB)</summary>
          <pre style={{ whiteSpace: "pre-wrap" }}>{safeJson(row)}</pre>
        </details>
      </Section>
    </div>
  );
}

/* -----------------------------
   Logs (realtime, fullscreen lines)
------------------------------ */

type LogLine = {
  at: string;
  level: string;
  source: string;
  message: string;
  raw: any;
};

function normalizeLog(r: any): LogLine {
  const at = pickString(r, ["at", "created_at", "timestamp", "time"], "") || new Date().toISOString();
  const level = pickString(r, ["level", "severity"], "info");
  const source = pickString(r, ["source", "svc", "service", "origin"], "logs");
  const message = pickString(r, ["message", "msg", "text"], safeJson(r));
  return { at, level, source, message, raw: r };
}

function emojiForSource(source: string) {
  const s = (source || "").toLowerCase();
  if (s.includes("server")) return "🖥️";
  if (s.includes("api")) return "🧩";
  if (s.includes("ai")) return "🧠";
  if (s.includes("front") || s.includes("web") || s.includes("ui")) return "🧑‍💻";
  return "📜";
}

function emojiForLevel(level: string) {
  const l = (level || "").toLowerCase();
  if (l.includes("error") || l === "err") return "❌";
  if (l.includes("warn")) return "⚠️";
  if (l.includes("debug")) return "🪲";
  return "ℹ️";
}

function RealtimeLogsTab() {
  const [rows, setRows] = useState<LogLine[]>([]);
  const [loading, setLoading] = useState(false);
  const [paused, setPaused] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [sourceFilter, setSourceFilter] = useState<string>("");

  const scrollRef = useRef<HTMLDivElement | null>(null);

  const sources = useMemo(() => {
    const uniq = new Set<string>();
    rows.forEach((r) => uniq.add(r.source));
    return Array.from(uniq).sort();
  }, [rows]);

  const visible = useMemo(() => {
    if (!sourceFilter) return rows;
    return rows.filter((r) => r.source === sourceFilter);
  }, [rows, sourceFilter]);

  const scrollToBottom = () => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  };

  const loadInitial = async () => {
    setLoading(true);
    setErr(null);
    try {
      const data = await loadTable(LOGS_TABLE, 600, "created_at");
      setRows((data as any[]).reverse().map(normalizeLog)); // oldest -> newest
      setTimeout(scrollToBottom, 50);
    } catch (e: any) {
      setErr(e?.message ?? "Failed to load logs");
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadInitial();

    const channel = supabase
      .channel(`realtime:${LOGS_TABLE}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: LOGS_TABLE },
        (payload: any) => {
          if (paused) return;
          const next = normalizeLog(payload.new);
          setRows((prev) => {
            const merged = [...prev, next].slice(-2000);
            return merged;
          });
          setTimeout(scrollToBottom, 0);
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paused]);

  return (
    <div className="admin-grid">
      <Section title="Logs (Realtime)" description={`Streaming from Supabase "${LOGS_TABLE}" as fullscreen lines.`}>
        <div className="admin-inline">
          <button className="admin-button ghost" type="button" onClick={() => void loadInitial()} disabled={loading}>
            {loading ? "Loading..." : "Reload"}
          </button>

          <button className="admin-button ghost" type="button" onClick={() => setPaused((p) => !p)}>
            {paused ? "Resume" : "Pause"}
          </button>

          <button className="admin-button ghost" type="button" onClick={() => setRows([])}>
            Clear (local)
          </button>

          <select value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)}>
            <option value="">All sources</option>
            {sources.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>

          <button
            className="admin-button ghost"
            type="button"
            onClick={() => navigator.clipboard?.writeText(visible.map((l) => `${l.at} ${l.source} ${l.level} ${l.message}`).join("\n"))}
          >
            Copy lines
          </button>
        </div>

        {err && (
          <div style={{ padding: 12, marginTop: 10, border: "1px solid crimson", color: "crimson", borderRadius: 8 }}>
            <strong>Logs error:</strong> {err}
          </div>
        )}

        <div
          ref={scrollRef}
          style={{
            marginTop: 12,
            height: "calc(100vh - 260px)",
            border: "1px solid #eee",
            borderRadius: 12,
            padding: 10,
            overflow: "auto",
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
            fontSize: 12,
            lineHeight: 1.4,
            background: "white",
          }}
        >
          {visible.length === 0 ? (
            <div className="admin-muted">{loading ? "Loading…" : "No logs yet."}</div>
          ) : (
            visible.map((l, i) => (
              <div key={`${l.at}-${i}`} style={{ whiteSpace: "pre-wrap" }}>
                {emojiForSource(l.source)} {emojiForLevel(l.level)}{" "}
                <span style={{ opacity: 0.75 }}>[{l.at}]</span>{" "}
                <span style={{ fontWeight: 700 }}>{l.source}</span>{" "}
                <span style={{ opacity: 0.8 }}>{l.level}</span>{" "}
                {l.message}
              </div>
            ))
          )}
        </div>
      </Section>
    </div>
  );
}

/* -----------------------------
   MAIN
------------------------------ */

export default function AdminDashboard() {
  const allowed = useAdminGuard();

  const [tab, setTab] = useState<TabKey>("customers");

  // runtime api base
  const [apiBase, setApiBase] = useState<string>(() => {
    try {
      return localStorage.getItem("MINA_API_BASE") || "";
    } catch {
      return "";
    }
  });

  // customers
  const [customersTable] = useState("customers");
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [customersLoading, setCustomersLoading] = useState(false);
  const [customersError, setCustomersError] = useState<string | null>(null);

  // generations
  const [generations, setGenerations] = useState<LiveRow[]>([]);
  const [generationsLoading, setGenerationsLoading] = useState(false);
  const [generationsError, setGenerationsError] = useState<string | null>(null);

  // feedback
  const [feedback, setFeedback] = useState<LiveRow[]>([]);
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);

  // filters
  const [userFilter, setUserFilter] = useState<string>("");

  // AI flat config
  const [aiRow, setAiRow] = useState<any | null>(null);
  const [aiDraft, setAiDraft] = useState<FlatAiDraft | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiSaving, setAiSaving] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiDirty, setAiDirty] = useState(false);

  const firstLoadRef = useRef(false);

  const refreshCustomers = async () => {
    setCustomersLoading(true);
    setCustomersError(null);
    try {
      let rows = await loadTable("customers", 800, "updated_at");
      const f = userFilter.trim().toLowerCase();
      if (f) {
        rows = (rows as any[]).filter((r) => {
          const email = pickString(r, ["email", "user_email", "shopify_customer_id"], "").toLowerCase();
          const userId = pickString(r, ["user_id", "uid"], "").toLowerCase();
          const shopify = pickString(r, ["shopify_customer_id", "customer_id"], "").toLowerCase();
          return email.includes(f) || userId === f || shopify.includes(f) || String(r?.id ?? "").toLowerCase() === f;
        });
      }
      setCustomers(normalizeCustomers(rows as any[]));
    } catch (e: any) {
      setCustomersError(e?.message ?? "Failed to load customers");
      setCustomers([]);
    } finally {
      setCustomersLoading(false);
    }
  };

  const refreshGenerations = async () => {
    setGenerationsLoading(true);
    setGenerationsError(null);
    try {
      let rows = await loadTable("generations", 900, "created_at");
      const f = userFilter.trim().toLowerCase();
      if (f) {
        rows = (rows as any[]).filter((r) => {
          const email = pickString(r, ["email", "user_email"], "").toLowerCase();
          const userId = pickString(r, ["user_id", "uid"], "").toLowerCase();
          const shopify = pickString(r, ["shopify_customer_id", "customer_id"], "").toLowerCase();
          const prompt = pickString(r, ["prompt", "input_prompt", "caption", "text"], "").toLowerCase();
          return email.includes(f) || userId === f || shopify.includes(f) || prompt.includes(f);
        });
      }
      setGenerations(makeRowsFromAny("generations", rows as any[]));
    } catch (e: any) {
      setGenerationsError(e?.message ?? "Failed to load generations");
      setGenerations([]);
    } finally {
      setGenerationsLoading(false);
    }
  };

  const refreshFeedback = async () => {
    setFeedbackLoading(true);
    setFeedbackError(null);
    try {
      let rows = await loadTable("feedback", 800, "created_at");
      const f = userFilter.trim().toLowerCase();
      if (f) {
        rows = (rows as any[]).filter((r) => {
          const email = pickString(r, ["email", "user_email"], "").toLowerCase();
          const userId = pickString(r, ["user_id", "uid"], "").toLowerCase();
          const genId = pickString(r, ["generation_id", "gen_id"], "").toLowerCase();
          return email.includes(f) || userId === f || genId.includes(f);
        });
      }
      setFeedback(makeRowsFromAny("feedback", rows as any[]));
    } catch (e: any) {
      setFeedbackError(e?.message ?? "Failed to load feedback");
      setFeedback([]);
    } finally {
      setFeedbackLoading(false);
    }
  };

  const refreshAi = async () => {
    setAiLoading(true);
    setAiError(null);
    try {
      const row = await loadFlatAiConfig();
      setAiRow(row);
      setAiDraft(normalizeFlatAiRow(row ?? {}));
      setAiDirty(false);
    } catch (e: any) {
      setAiError(e?.message ?? "Failed to load AI config");
      setAiRow(null);
      setAiDraft({
        defaultProvider: "",
        defaultModel: "",
        temperature: 0.7,
        topP: 1,
        maxTokens: 1024,
        context: "",
        providerParamsJson: "{}",
      });
      setAiDirty(false);
    } finally {
      setAiLoading(false);
    }
  };

  const saveAi = async () => {
    if (!aiDraft) return;
    setAiSaving(true);
    setAiError(null);
    try {
      await saveFlatAiConfig(aiRow, aiDraft);
      await refreshAi();
      alert("AI config saved ✅");
    } catch (e: any) {
      setAiError(e?.message ?? "Save failed");
      alert(e?.message ?? "Save failed");
    } finally {
      setAiSaving(false);
    }
  };

  useEffect(() => {
    if (allowed !== true) return;
    if (firstLoadRef.current) return;
    firstLoadRef.current = true;

    void refreshCustomers();
    void refreshGenerations();
    void refreshFeedback();
    void refreshAi();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowed]);

  const applyFilter = () => {
    void refreshCustomers();
    void refreshGenerations();
    void refreshFeedback();
  };

  if (allowed === null) return <div style={{ padding: 24 }}>Loading admin…</div>;
  if (allowed === false) return null;

  const rightStatus = (
    <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
      <span className="admin-muted" style={{ fontSize: 12 }}>
        Customers: <strong>{customers.length}</strong>
      </span>
      <span className="admin-muted" style={{ fontSize: 12 }}>
        Generations: <strong>{generations.length}</strong>
      </span>
      <span className="admin-muted" style={{ fontSize: 12 }}>
        Feedback: <strong>{feedback.length}</strong>
      </span>
    </div>
  );

  const rightActions =
    tab === "ai" ? (
      <button className="admin-button" onClick={() => void saveAi()} disabled={aiSaving || !aiDirty}>
        {aiSaving ? "Saving..." : "Save"}
      </button>
    ) : null;

  const filterBar = (
    <>
      <input
        value={userFilter}
        onChange={(e) => setUserFilter(e.target.value)}
        style={{ minWidth: 340 }}
      />
      <button className="admin-button ghost" type="button" onClick={applyFilter}>
        Apply filter
      </button>
      <button
        className="admin-button ghost"
        type="button"
        onClick={() => {
          setUserFilter("");
          setTimeout(() => applyFilter(), 0);
        }}
      >
        Clear
      </button>
    </>
  );

  // mark AI dirty on any draft change
  const setAiDraftDirty = (next: FlatAiDraft) => {
    setAiDraft(next);
    setAiDirty(true);
  };

  return (
    <div className="admin-shell">
      <AdminHeader rightStatus={rightStatus} rightActions={rightActions} />
      <StickyTabs active={tab} onChange={setTab} />

      <div className="admin-content">
        {tab === "runtime" && (
          <div className="admin-grid">
            <Section
              title="Runtime Config (Live backend)"
              description="Edit the live backend runtime config (models, replicate params, GPT temp/tokens, system/user append)."
            >
              <div className="admin-inline">
                <label style={{ minWidth: 420 }}>
                  <strong>API Base URL (optional)</strong>
                  <input
                    value={apiBase}
                    onChange={(e) => {
                      const v = e.target.value;
                      setApiBase(v);
                      try {
                        localStorage.setItem("MINA_API_BASE", v);
                      } catch {}
                    }}
                  />
                </label>

                <button
                  className="admin-button ghost"
                  type="button"
                  onClick={() => {
                    setApiBase("");
                    try {
                      localStorage.removeItem("MINA_API_BASE");
                    } catch {}
                  }}
                >
                  Use same domain
                </button>
              </div>

              <div style={{ marginTop: 12 }}>
                <RuntimeConfigFlatEditor />

                <div style={{ height: 18 }} />

                <details>
                  <summary style={{ cursor: "pointer", fontWeight: 800 }}>
                    Advanced: Raw runtime JSON editor (legacy)
                  </summary>
                  <div style={{ marginTop: 12 }}>
                    <RuntimeConfigEditor apiBase={apiBase} />
                  </div>
                </details>
              </div>
            </Section>
          </div>
        )}

        {tab === "ai" && (
          <FlatAiConfigTab
            row={aiRow}
            draft={aiDraft}
            setDraft={setAiDraftDirty}
            loading={aiLoading}
            error={aiError}
            onRefresh={() => void refreshAi()}
            onSave={() => void saveAi()}
            saving={aiSaving}
            dirty={aiDirty}
          />
        )}

        {tab === "customers" && (
          <CustomersTab
            customers={customers}
            loading={customersLoading}
            error={customersError}
            onRefresh={() => void refreshCustomers()}
            customersTable={customersTable}
          />
        )}

        {tab === "generations" && (
          <LiveTableTab
            tableName="generations"
            title="Generations"
            description="Shows ALL stored columns. Select one to view raw fields. You can delete selected."
            rows={generations}
            loading={generationsLoading}
            error={generationsError}
            onRefresh={() => void refreshGenerations()}
            filterLabel={filterBar}
            allowDelete
          />
        )}

        {tab === "feedback" && (
          <LiveTableTab
            tableName="feedback"
            title="Feedback"
            description="Likes / feedback rows. Select one to view raw fields. You can delete selected."
            rows={feedback}
            loading={feedbackLoading}
            error={feedbackError}
            onRefresh={() => void refreshFeedback()}
            filterLabel={filterBar}
            allowDelete
          />
        )}

        {tab === "logs" && <RealtimeLogsTab />}
      </div>

      <div className="admin-footer">
        Live tables are read/update directly.
        <span className="admin-muted" style={{ marginLeft: 10 }}>
          AI config table: <strong>{AI_FLAT_TABLE}</strong> • Logs table: <strong>{LOGS_TABLE}</strong>
        </span>
      </div>
    </div>
  );
}
