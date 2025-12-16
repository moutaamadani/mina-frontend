// AdminDashboard.tsx (MEGA-only, Supabase direct)
// - Uses mega_customers / mega_generations / mega_admin
// - No legacy tables
// - More organized UI + "View more" expanders

import React, { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "./lib/supabaseClient";
import { isAdmin } from "./lib/adminConfig";
import RuntimeConfigEditor from "./components/RuntimeConfigEditor";
import RuntimeConfigFlatEditor from "./components/RuntimeConfigFlatEditor";
import "./admin.css";

/* -----------------------------
   HARD-CODED MEGA TABLES
------------------------------ */

const MEGA_CUSTOMERS_TABLE = "mega_customers";
const MEGA_GENERATIONS_TABLE = "mega_generations";
const MEGA_ADMIN_TABLE = "mega_admin";

/**
 * Where config lives (inside mega_admin).
 * We store a single row per key:
 *   mg_record_type: "app_config" | "runtime_config"
 *   mg_key: "singleton"
 *   mg_value: jsonb
 *
 * mg_id is deterministic so upsert is stable.
 */
const CONFIG_KEY = "singleton";
const APP_CONFIG_RECORD_TYPE = "app_config";
const RUNTIME_CONFIG_RECORD_TYPE = "runtime_config";

/* -----------------------------
   TABS
------------------------------ */

type TabKey = "runtime" | "ai" | "customers" | "activity" | "logs";

const TAB_LABELS: Record<TabKey, string> = {
  runtime: "Runtime Config",
  ai: "AI Config",
  customers: "Customers",
  activity: "Activity",
  logs: "Logs / Errors",
};

/* -----------------------------
   UI bits (same design language)
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
        <div className="admin-subtitle">MEGA dashboard (Supabase direct)</div>
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
  right,
}: React.PropsWithChildren<{ title: string; description?: string; right?: React.ReactNode }>) {
  return (
    <section className="admin-section">
      <header style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
        <div>
          <div className="admin-section-title">{title}</div>
          {description && <p className="admin-section-desc">{description}</p>}
        </div>
        {right}
      </header>
      {children}
    </section>
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

function Divider({ h = 16 }: { h?: number }) {
  return <div style={{ height: h }} />;
}

/* -----------------------------
   Small helpers
------------------------------ */

function safeJson(obj: any) {
  try {
    return JSON.stringify(obj ?? {}, null, 2);
  } catch {
    return String(obj);
  }
}

function truncateId(s: string, max = 22) {
  if (!s) return "";
  if (s.length <= max) return s;
  const head = Math.max(8, Math.floor(max / 2));
  const tail = Math.max(6, max - head - 1);
  return `${s.slice(0, head)}…${s.slice(-tail)}`;
}

function nowIso() {
  return new Date().toISOString();
}

function randomId() {
  // Deterministic enough for admin UI
  // (for mg_id of ledger we prefer stable mg_id if you already set it elsewhere)
  // For new rows, random UUID is fine.
  // eslint-disable-next-line no-restricted-globals
  return (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `${Date.now()}-${Math.random()}`) as string;
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

function highlightTraceFields(row: any) {
  const keys = Object.keys(row || {});
  const candidates = [
    "mg_prompt",
    "mg_output_url",
    "mg_error",
    "mg_status",
    "mg_model",
    "mg_provider",
    "mg_meta",
    "meta",
    "trace",
    "debug",
    "messages",
    "system_prompt",
    "user_prompt",
    "params",
  ];

  const present = candidates
    .map((k) => keys.find((kk) => kk.toLowerCase() === k.toLowerCase()) || null)
    .filter(Boolean) as string[];

  for (const k of keys) {
    if (/prompt|output|trace|debug|error|provider|model|token|latency|meta/i.test(k) && !present.includes(k)) {
      present.push(k);
    }
  }

  return present.slice(0, 14);
}

function extractLikelyImageUrl(row: any): string | null {
  const keys = Object.keys(row || {});
  const urlKey =
    keys.find((k) => /^(mg_output_url|output_url|image_url|result_url|url)$/i.test(k)) ||
    keys.find((k) => /(url|image|output|result)/i.test(k) && typeof row?.[k] === "string");
  const val = urlKey ? row?.[urlKey] : null;
  return typeof val === "string" && val.startsWith("http") ? val : null;
}

function Expandable({
  title,
  children,
  defaultOpen,
}: React.PropsWithChildren<{ title: string; defaultOpen?: boolean }>) {
  return (
    <details open={!!defaultOpen} style={{ marginTop: 10 }}>
      <summary style={{ cursor: "pointer", fontWeight: 800 }}>{title}</summary>
      <div style={{ marginTop: 10 }}>{children}</div>
    </details>
  );
}

function Chip({ children, tone }: { children: React.ReactNode; tone?: "good" | "warn" | "bad" | "neutral" }) {
  const bg =
    tone === "good" ? "#e7f7ef" : tone === "warn" ? "#fff6db" : tone === "bad" ? "#ffe7ea" : "#f4f4f4";
  const bd =
    tone === "good" ? "#b7e6cf" : tone === "warn" ? "#f0d58a" : tone === "bad" ? "#ffb9c0" : "#e6e6e6";
  const fg =
    tone === "good" ? "#0f6b3a" : tone === "warn" ? "#6b520f" : tone === "bad" ? "#7a1f2b" : "#333";
  return (
    <span
      style={{
        display: "inline-flex",
        padding: "3px 10px",
        borderRadius: 999,
        border: `1px solid ${bd}`,
        background: bg,
        color: fg,
        fontSize: 12,
        fontWeight: 700,
        lineHeight: 1.4,
        alignItems: "center",
        gap: 6,
      }}
    >
      {children}
    </span>
  );
}

/* -----------------------------
   Admin guard
------------------------------ */

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
   MEGA CONFIG (mega_admin)
------------------------------ */

type MegaConfigRow = {
  mg_id: string;
  mg_record_type: string;
  mg_key: string | null;
  mg_value: any;
  mg_updated_at: string | null;
  mg_created_at: string | null;
};

async function loadMegaConfig(recordType: string) {
  const mgId = `cfg:${recordType}:${CONFIG_KEY}`;

  const { data, error } = await supabase
    .from(MEGA_ADMIN_TABLE)
    .select("mg_id, mg_record_type, mg_key, mg_value, mg_updated_at, mg_created_at")
    .eq("mg_id", mgId)
    .maybeSingle();

  if (error) throw new Error(error.message);

  if (data) return data as MegaConfigRow;

  // Create empty config row if missing
  const row: MegaConfigRow = {
    mg_id: mgId,
    mg_record_type: recordType,
    mg_key: CONFIG_KEY,
    mg_value: {},
    mg_updated_at: nowIso(),
    mg_created_at: nowIso(),
  };

  const { error: upErr } = await supabase.from(MEGA_ADMIN_TABLE).upsert(row, { onConflict: "mg_id" });
  if (upErr) throw new Error(upErr.message);

  return row;
}

async function saveMegaConfig(recordType: string, nextValue: any) {
  const mgId = `cfg:${recordType}:${CONFIG_KEY}`;

  const patch = {
    mg_id: mgId,
    mg_record_type: recordType,
    mg_key: CONFIG_KEY,
    mg_value: nextValue ?? {},
    mg_updated_at: nowIso(),
  };

  const { error } = await supabase.from(MEGA_ADMIN_TABLE).upsert(patch, { onConflict: "mg_id" });
  if (error) throw new Error(error.message);
}

/* -----------------------------
   Customers (MEGA_CUSTOMERS)
------------------------------ */

type CustomerRow = {
  passId: string;
  email: string | null;
  userId: string | null;
  shopifyCustomerId: string | null;
  displayName: string | null;
  credits: number;
  expiresAt: string | null;
  verifiedAny: boolean;
  disabled: boolean;
  lastActive: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  raw: any;
};

function normalizeCustomer(r: any): CustomerRow {
  return {
    passId: pickString(r, ["mg_pass_id"], ""),
    email: pickString(r, ["mg_email"], "") || null,
    userId: pickString(r, ["mg_user_id"], "") || null,
    shopifyCustomerId: pickString(r, ["mg_shopify_customer_id"], "") || null,
    displayName: pickString(r, ["mg_display_name"], "") || null,
    credits: pickNumber(r, ["mg_credits"], 0),
    expiresAt: pickString(r, ["mg_expires_at"], "") || null,
    verifiedAny: !!r?.mg_verified_any,
    disabled: !!r?.mg_disabled,
    lastActive: pickString(r, ["mg_last_active"], "") || null,
    createdAt: pickString(r, ["mg_created_at"], "") || null,
    updatedAt: pickString(r, ["mg_updated_at"], "") || null,
    raw: r,
  };
}

async function loadCustomers(opts: { q?: string; limit?: number } = {}) {
  const q = (opts.q || "").trim();
  const limit = Math.min(Math.max(Number(opts.limit ?? 250), 1), 800);

  let query = supabase
    .from(MEGA_CUSTOMERS_TABLE)
    .select(
      [
        "mg_pass_id",
        "mg_email",
        "mg_user_id",
        "mg_shopify_customer_id",
        "mg_display_name",
        "mg_credits",
        "mg_expires_at",
        "mg_verified_any",
        "mg_disabled",
        "mg_last_active",
        "mg_created_at",
        "mg_updated_at",
      ].join(",")
    )
    .is("mg_deleted_at", null)
    .order("mg_updated_at", { ascending: false })
    .limit(limit);

  if (q) {
    // OR search across pass/email/user/shopify
    query = query.or(
      [
        `mg_pass_id.ilike.%${q}%`,
        `mg_email.ilike.%${q}%`,
        `mg_shopify_customer_id.ilike.%${q}%`,
        `mg_user_id.ilike.%${q}%`,
        `mg_display_name.ilike.%${q}%`,
      ].join(",")
    );
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  return (data ?? []).map(normalizeCustomer);
}

async function saveCustomer(passId: string, patch: Partial<{
  mg_email: string | null;
  mg_shopify_customer_id: string | null;
  mg_display_name: string | null;
  mg_credits: number;
  mg_expires_at: string | null;
  mg_disabled: boolean;
}>) {
  const { error } = await supabase
    .from(MEGA_CUSTOMERS_TABLE)
    .update({ ...patch, mg_updated_at: nowIso() })
    .eq("mg_pass_id", passId);

  if (error) throw new Error(error.message);
}

async function topupCustomer(passId: string, delta: number, reason: string) {
  // simple (non-atomic) admin topup:
  // 1) read current credits
  // 2) update customer credits
  // 3) write ledger record_type=credit_transaction
  const { data: cust, error } = await supabase
    .from(MEGA_CUSTOMERS_TABLE)
    .select("mg_credits")
    .eq("mg_pass_id", passId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  const current = Number(cust?.mg_credits ?? 0);
  const next = current + Number(delta || 0);

  const { error: upErr } = await supabase
    .from(MEGA_CUSTOMERS_TABLE)
    .update({ mg_credits: next, mg_updated_at: nowIso(), mg_last_active: nowIso() })
    .eq("mg_pass_id", passId);

  if (upErr) throw new Error(upErr.message);

  const mgId = `ct:${randomId()}`;
  const row = {
    mg_id: mgId,
    mg_record_type: "credit_transaction",
    mg_pass_id: passId,
    mg_delta: Number(delta || 0),
    mg_reason: String(reason || "admin_topup"),
    mg_source: "admin_dashboard",
    mg_status: "ok",
    mg_created_at: nowIso(),
    mg_updated_at: nowIso(),
  };

  const { error: insErr } = await supabase.from(MEGA_GENERATIONS_TABLE).insert(row);
  if (insErr) throw new Error(insErr.message);

  return next;
}

/* -----------------------------
   Activity (MEGA_GENERATIONS)
------------------------------ */

type LedgerRow = {
  mg_id: string;
  mg_record_type: string;
  mg_pass_id: string;
  mg_created_at: string | null;
  mg_platform: string | null;
  mg_title: string | null;
  mg_type: string | null;
  mg_provider: string | null;
  mg_model: string | null;
  mg_status: string | null;
  mg_error: string | null;
  mg_output_url: string | null;
  mg_session_id: string | null;
  mg_generation_id: string | null;
  mg_meta: any;
  raw: any;
};

function normalizeLedger(r: any): LedgerRow {
  return {
    mg_id: pickString(r, ["mg_id"], ""),
    mg_record_type: pickString(r, ["mg_record_type"], ""),
    mg_pass_id: pickString(r, ["mg_pass_id"], ""),
    mg_created_at: pickString(r, ["mg_created_at"], "") || null,
    mg_platform: pickString(r, ["mg_platform"], "") || null,
    mg_title: pickString(r, ["mg_title"], "") || null,
    mg_type: pickString(r, ["mg_type"], "") || null,
    mg_provider: pickString(r, ["mg_provider"], "") || null,
    mg_model: pickString(r, ["mg_model"], "") || null,
    mg_status: pickString(r, ["mg_status"], "") || null,
    mg_error: pickString(r, ["mg_error"], "") || null,
    mg_output_url: pickString(r, ["mg_output_url"], "") || null,
    mg_session_id: pickString(r, ["mg_session_id"], "") || null,
    mg_generation_id: pickString(r, ["mg_generation_id"], "") || null,
    mg_meta: r?.mg_meta ?? {},
    raw: r,
  };
}

async function loadLedger(opts: {
  passId?: string;
  recordType?: string;
  q?: string;
  status?: string;
  limit?: number;
}) {
  const passId = (opts.passId || "").trim();
  const recordType = (opts.recordType || "").trim();
  const q = (opts.q || "").trim();
  const status = (opts.status || "").trim();
  const limit = Math.min(Math.max(Number(opts.limit ?? 250), 1), 900);

  let query = supabase
    .from(MEGA_GENERATIONS_TABLE)
    .select(
      [
        "mg_id",
        "mg_record_type",
        "mg_pass_id",
        "mg_created_at",
        "mg_platform",
        "mg_title",
        "mg_type",
        "mg_provider",
        "mg_model",
        "mg_status",
        "mg_error",
        "mg_output_url",
        "mg_session_id",
        "mg_generation_id",
        "mg_meta",
      ].join(",")
    )
    .is("mg_deleted_at", null)
    .order("mg_created_at", { ascending: false })
    .limit(limit);

  if (passId) query = query.eq("mg_pass_id", passId);
  if (recordType && recordType !== "all") query = query.eq("mg_record_type", recordType);
  if (status) query = query.eq("mg_status", status);

  if (q) {
    query = query.or(
      [
        `mg_id.ilike.%${q}%`,
        `mg_pass_id.ilike.%${q}%`,
        `mg_title.ilike.%${q}%`,
        `mg_prompt.ilike.%${q}%`,
        `mg_error.ilike.%${q}%`,
        `mg_provider.ilike.%${q}%`,
        `mg_model.ilike.%${q}%`,
      ].join(",")
    );
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []).map(normalizeLedger);
}

async function softDeleteLedgerRow(mgId: string) {
  const { error } = await supabase
    .from(MEGA_GENERATIONS_TABLE)
    .update({ mg_deleted_at: nowIso(), mg_updated_at: nowIso() })
    .eq("mg_id", mgId);
  if (error) throw new Error(error.message);
}

/* -----------------------------
   Logs (MEGA_ADMIN + errors from MEGA_GENERATIONS)
------------------------------ */

type AdminLog = {
  mg_id: string;
  mg_record_type: string;
  mg_created_at: string | null;
  mg_email: string | null;
  mg_action: string | null;
  mg_route: string | null;
  mg_method: string | null;
  mg_status: number | null;
  mg_detail: any;
  raw: any;
};

function normalizeAdminLog(r: any): AdminLog {
  return {
    mg_id: pickString(r, ["mg_id"], ""),
    mg_record_type: pickString(r, ["mg_record_type"], ""),
    mg_created_at: pickString(r, ["mg_created_at"], "") || null,
    mg_email: pickString(r, ["mg_email"], "") || null,
    mg_action: pickString(r, ["mg_action"], "") || null,
    mg_route: pickString(r, ["mg_route"], "") || null,
    mg_method: pickString(r, ["mg_method"], "") || null,
    mg_status: (typeof r?.mg_status === "number" ? r.mg_status : null) as number | null,
    mg_detail: r?.mg_detail ?? {},
    raw: r,
  };
}

async function loadAdminLogs(opts: { recordType?: string; limit?: number } = {}) {
  const recordType = (opts.recordType || "").trim();
  const limit = Math.min(Math.max(Number(opts.limit ?? 600), 1), 2000);

  let query = supabase
    .from(MEGA_ADMIN_TABLE)
    .select("mg_id, mg_record_type, mg_created_at, mg_email, mg_action, mg_route, mg_method, mg_status, mg_detail")
    .is("mg_deleted_at", null)
    .order("mg_created_at", { ascending: false })
    .limit(limit);

  if (recordType && recordType !== "all") query = query.eq("mg_record_type", recordType);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []).map(normalizeAdminLog);
}

async function loadRecentErrors(limit = 300) {
  const { data, error } = await supabase
    .from(MEGA_GENERATIONS_TABLE)
    .select("mg_id, mg_record_type, mg_pass_id, mg_created_at, mg_provider, mg_model, mg_status, mg_error, mg_meta")
    .is("mg_deleted_at", null)
    .not("mg_error", "is", null)
    .order("mg_created_at", { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 900));

  if (error) throw new Error(error.message);
  return (data ?? []).map(normalizeLedger);
}

/* -----------------------------
   Raw Viewer (expand-only)
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
          <strong>Important fields</strong>
          <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
            {highlights.map((k) => (
              <div key={k} style={{ border: "1px solid #eee", borderRadius: 10, padding: 10 }}>
                <div style={{ fontWeight: 800, marginBottom: 6 }}>{k}</div>
                <pre style={{ whiteSpace: "pre-wrap", margin: 0 }}>{safeJson(row?.[k])}</pre>
              </div>
            ))}
          </div>
        </div>
      )}

      <Expandable title="Raw JSON (everything)">
        <pre style={{ whiteSpace: "pre-wrap" }}>{safeJson(row)}</pre>
      </Expandable>
    </div>
  );
}

/* -----------------------------
   CONFIG TAB (MEGA_ADMIN)
------------------------------ */

type AiDraft = {
  defaultProvider: string;
  defaultModel: string;
  temperature: number;
  topP: number;
  maxTokens: number;
  context: string;
};

function getAiDraftFromConfig(cfg: any): AiDraft {
  const ai = cfg?.ai ?? {};
  const pricing = cfg?.pricing ?? {};
  return {
    defaultProvider: String(ai?.defaultProvider ?? ""),
    defaultModel: String(ai?.defaultModel ?? ""),
    temperature: Number(ai?.temperature ?? 0.7),
    topP: Number(ai?.topP ?? 1),
    maxTokens: Number(ai?.maxTokens ?? 1024),
    context: String(ai?.context ?? ""),
  };
}

function applyAiDraftToConfig(cfg: any, draft: AiDraft) {
  const next = { ...(cfg ?? {}) };
  if (!next.ai) next.ai = {};
  next.ai.defaultProvider = draft.defaultProvider;
  next.ai.defaultModel = draft.defaultModel;
  next.ai.temperature = draft.temperature;
  next.ai.topP = draft.topP;
  next.ai.maxTokens = draft.maxTokens;
  next.ai.context = draft.context;
  return next;
}

function ConfigTab({
  appConfig,
  setAppConfig,
  appLoading,
  appError,
  onReloadApp,
  onSaveApp,
  savingApp,
  runtimeConfig,
  runtimeLoading,
  runtimeError,
  onReloadRuntime,
  onSaveRuntime,
  savingRuntime,
}: {
  appConfig: any | null;
  setAppConfig: (v: any) => void;
  appLoading: boolean;
  appError: string | null;
  onReloadApp: () => void;
  onSaveApp: () => void;
  savingApp: boolean;

  runtimeConfig: any | null;
  runtimeLoading: boolean;
  runtimeError: string | null;
  onReloadRuntime: () => void;
  onSaveRuntime: (next: any) => void;
  savingRuntime: boolean;
}) {
  const [aiDraft, setAiDraft] = useState<AiDraft>(() => getAiDraftFromConfig(appConfig ?? {}));
  const [aiDirty, setAiDirty] = useState(false);
  const [jsonText, setJsonText] = useState<string>(() => safeJson(appConfig ?? {}));
  const [jsonDirty, setJsonDirty] = useState(false);

  useEffect(() => {
    setAiDraft(getAiDraftFromConfig(appConfig ?? {}));
    setAiDirty(false);
    setJsonText(safeJson(appConfig ?? {}));
    setJsonDirty(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appLoading]);

  const saveAi = () => {
    const next = applyAiDraftToConfig(appConfig ?? {}, aiDraft);
    setAppConfig(next);
    setAiDirty(false);
    setJsonText(safeJson(next));
    setJsonDirty(false);
    onSaveApp();
  };

  const saveJson = () => {
    let parsed: any = {};
    try {
      parsed = jsonText?.trim() ? JSON.parse(jsonText) : {};
    } catch {
      alert("Config JSON is invalid. Fix before saving.");
      return;
    }
    setAppConfig(parsed);
    setAiDraft(getAiDraftFromConfig(parsed));
    setAiDirty(false);
    setJsonDirty(false);
    onSaveApp();
  };

  return (
    <div className="admin-grid">
      <Section
        title="AI Config (MEGA)"
        description={`Stored in "${MEGA_ADMIN_TABLE}" as record_type="${APP_CONFIG_RECORD_TYPE}" key="${CONFIG_KEY}".`}
        right={
          <div className="admin-inline">
            <button className="admin-button ghost" type="button" onClick={onReloadApp} disabled={appLoading || savingApp}>
              {appLoading ? "Loading..." : "Reload"}
            </button>
            <button className="admin-button" type="button" onClick={saveAi} disabled={savingApp || !aiDirty}>
              {savingApp ? "Saving..." : "Save"}
            </button>
          </div>
        }
      >
        {appError && (
          <div style={{ padding: 12, marginTop: 10, border: "1px solid crimson", color: "crimson", borderRadius: 8 }}>
            <strong>Config load error:</strong> {appError}
            <div style={{ marginTop: 6, color: "#333" }}>
              Usually: RLS blocked admin, missing mega_admin table, or wrong permissions.
            </div>
          </div>
        )}

        <div className="admin-inline" style={{ marginTop: 12 }}>
          <label>
            <strong>Default provider</strong>
            <input
              value={aiDraft.defaultProvider}
              onChange={(e) => {
                setAiDraft((d) => ({ ...d, defaultProvider: e.target.value }));
                setAiDirty(true);
              }}
            />
          </label>

          <label>
            <strong>Default model</strong>
            <input
              value={aiDraft.defaultModel}
              onChange={(e) => {
                setAiDraft((d) => ({ ...d, defaultModel: e.target.value }));
                setAiDirty(true);
              }}
            />
          </label>

          <label>
            <strong>Temperature</strong>
            <input
              type="number"
              step="0.1"
              value={aiDraft.temperature}
              onChange={(e) => {
                setAiDraft((d) => ({ ...d, temperature: Number(e.target.value) || 0 }));
                setAiDirty(true);
              }}
            />
          </label>

          <label>
            <strong>top_p</strong>
            <input
              type="number"
              step="0.05"
              value={aiDraft.topP}
              onChange={(e) => {
                setAiDraft((d) => ({ ...d, topP: Number(e.target.value) || 0 }));
                setAiDirty(true);
              }}
            />
          </label>

          <label>
            <strong>Max tokens</strong>
            <input
              type="number"
              value={aiDraft.maxTokens}
              onChange={(e) => {
                setAiDraft((d) => ({ ...d, maxTokens: Number(e.target.value) || 0 }));
                setAiDirty(true);
              }}
            />
          </label>
        </div>

        <label style={{ display: "block", marginTop: 12 }}>
          <strong>Context (system prompt override)</strong>
          <textarea
            className="admin-textarea"
            value={aiDraft.context}
            onChange={(e) => {
              setAiDraft((d) => ({ ...d, context: e.target.value }));
              setAiDirty(true);
            }}
          />
        </label>

        <Expandable title="View more: Full app config JSON editor">
          <div className="admin-inline" style={{ marginBottom: 10 }}>
            <button className="admin-button ghost" type="button" onClick={() => setJsonText(safeJson(appConfig ?? {}))}>
              Reset JSON
            </button>
            <button className="admin-button" type="button" onClick={saveJson} disabled={savingApp || !jsonDirty}>
              {savingApp ? "Saving..." : "Save JSON"}
            </button>
            {!jsonDirty ? <span className="admin-muted">No JSON changes.</span> : <span className="admin-muted">Unsaved JSON changes.</span>}
          </div>

          <textarea
            className="admin-textarea"
            style={{ minHeight: 260, fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" }}
            value={jsonText}
            onChange={(e) => {
              setJsonText(e.target.value);
              setJsonDirty(true);
            }}
          />
        </Expandable>
      </Section>

      <Section
        title="Runtime Config"
        description="This is your existing runtime editor UI. Keep it if you like; it’s already familiar."
        right={
          <div className="admin-inline">
            <button className="admin-button ghost" type="button" onClick={onReloadRuntime} disabled={runtimeLoading || savingRuntime}>
              {runtimeLoading ? "Loading..." : "Reload"}
            </button>
          </div>
        }
      >
        {runtimeError && (
          <div style={{ padding: 12, marginTop: 10, border: "1px solid crimson", color: "crimson", borderRadius: 8 }}>
            <strong>Runtime load error:</strong> {runtimeError}
          </div>
        )}

        <div style={{ marginTop: 12 }}>
          <RuntimeConfigFlatEditor />
          <Divider h={18} />
          <Expandable title="View more: Advanced runtime JSON editor (legacy)">
            <RuntimeConfigEditor apiBase={""} />
          </Expandable>
        </div>
      </Section>
    </div>
  );
}

/* -----------------------------
   CUSTOMERS TAB
------------------------------ */

function CustomersTab({
  rows,
  loading,
  error,
  onRefresh,
  onSelect,
  selected,
  onSaveSelected,
  onTopup,
}: {
  rows: CustomerRow[];
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
  onSelect: (c: CustomerRow) => void;
  selected: CustomerRow | null;
  onSaveSelected: (next: CustomerRow) => void;
  onTopup: (passId: string, delta: number, reason: string) => void;
}) {
  const [local, setLocal] = useState<CustomerRow | null>(null);
  const [topupDelta, setTopupDelta] = useState<number>(5);
  const [topupReason, setTopupReason] = useState<string>("admin_topup");

  useEffect(() => {
    setLocal(selected);
  }, [selected]);

  const dirty = useMemo(() => {
    if (!local || !selected) return false;
    return (
      local.email !== selected.email ||
      local.displayName !== selected.displayName ||
      local.shopifyCustomerId !== selected.shopifyCustomerId ||
      local.credits !== selected.credits ||
      (local.expiresAt || "") !== (selected.expiresAt || "") ||
      local.disabled !== selected.disabled
    );
  }, [local, selected]);

  return (
    <div className="admin-grid admin-split">
      <Section
        title="Customers (MEGA)"
        description={`From "${MEGA_CUSTOMERS_TABLE}" (Pass ID is the identity).`}
        right={
          <div className="admin-inline">
            <button className="admin-button ghost" type="button" onClick={onRefresh} disabled={loading}>
              {loading ? "Refreshing..." : "Refresh"}
            </button>
          </div>
        }
      >
        {error && (
          <div style={{ padding: 12, marginTop: 10, border: "1px solid crimson", color: "crimson", borderRadius: 8 }}>
            <strong>Load error:</strong> {error}
          </div>
        )}

        {!error && !loading && rows.length === 0 && (
          <div className="admin-muted" style={{ padding: 12 }}>
            No customers found.
          </div>
        )}

        <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
          {rows.slice(0, 300).map((c) => {
            const active = selected?.passId === c.passId;
            return (
              <button
                key={c.passId}
                className={`admin-grid-card ${active ? "active" : ""}`}
                onClick={() => onSelect(c)}
              >
                <div className="admin-grid-meta">
                  <div className="admin-grid-prompt" style={{ display: "flex", gap: 10, alignItems: "center" }}>
                    <strong>{c.email || c.displayName || "(no email)"}</strong>
                    {c.disabled ? <Chip tone="bad">disabled</Chip> : <Chip tone="good">active</Chip>}
                    {c.verifiedAny ? <Chip tone="good">verified</Chip> : <Chip tone="neutral">unverified</Chip>}
                  </div>
                  <div className="admin-grid-sub">
                    pass: {truncateId(c.passId)} • credits: <strong>{c.credits}</strong>
                    {c.expiresAt ? ` • exp: ${String(c.expiresAt).slice(0, 10)}` : ""}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </Section>

      <Section
        title="Customer Detail"
        description={selected ? `Pass ID: ${selected.passId}` : "Select a customer to edit / topup / inspect."}
        right={
          selected ? (
            <div className="admin-inline">
              <button
                className="admin-button"
                type="button"
                disabled={!local || !dirty}
                onClick={() => local && onSaveSelected(local)}
              >
                Save
              </button>
            </div>
          ) : null
        }
      >
        {!selected || !local ? (
          <p className="admin-muted">Select a customer.</p>
        ) : (
          <>
            <div className="admin-inline" style={{ flexWrap: "wrap", marginTop: 8 }}>
              <Chip tone="neutral">passId: {truncateId(local.passId, 38)}</Chip>
              {local.userId ? <Chip tone="neutral">userId: {truncateId(local.userId, 38)}</Chip> : null}
              {local.shopifyCustomerId ? <Chip tone="neutral">shopify: {truncateId(local.shopifyCustomerId, 38)}</Chip> : null}
            </div>

            <Divider h={12} />

            <div className="admin-inline" style={{ flexWrap: "wrap" }}>
              <label style={{ minWidth: 260 }}>
                <strong>Email</strong>
                <input
                  value={local.email || ""}
                  onChange={(e) => setLocal({ ...local, email: e.target.value || null })}
                />
              </label>

              <label style={{ minWidth: 260 }}>
                <strong>Display name</strong>
                <input
                  value={local.displayName || ""}
                  onChange={(e) => setLocal({ ...local, displayName: e.target.value || null })}
                />
              </label>

              <label style={{ minWidth: 260 }}>
                <strong>Shopify customer id</strong>
                <input
                  value={local.shopifyCustomerId || ""}
                  onChange={(e) => setLocal({ ...local, shopifyCustomerId: e.target.value || null })}
                />
              </label>
            </div>

            <Divider h={12} />

            <div className="admin-inline" style={{ flexWrap: "wrap", alignItems: "flex-end" }}>
              <label>
                <strong>Credits</strong>
                <input
                  type="number"
                  value={local.credits}
                  onChange={(e) => setLocal({ ...local, credits: Number(e.target.value) || 0 })}
                />
              </label>

              <label>
                <strong>Expires</strong>
                <input
                  type="date"
                  value={(local.expiresAt || "").slice(0, 10)}
                  onChange={(e) => setLocal({ ...local, expiresAt: e.target.value ? `${e.target.value}T00:00:00.000Z` : null })}
                />
              </label>

              <label style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
                <input
                  type="checkbox"
                  checked={local.disabled}
                  onChange={(e) => setLocal({ ...local, disabled: e.target.checked })}
                />
                <strong>Disabled</strong>
              </label>
            </div>

            <Divider h={14} />

            <Section
              title="Topup"
              description="Adds credits + writes a credit_transaction ledger row."
            >
              <div className="admin-inline" style={{ flexWrap: "wrap", alignItems: "flex-end" }}>
                <label>
                  <strong>Delta</strong>
                  <input type="number" value={topupDelta} onChange={(e) => setTopupDelta(Number(e.target.value) || 0)} />
                </label>

                <label style={{ minWidth: 240 }}>
                  <strong>Reason</strong>
                  <input value={topupReason} onChange={(e) => setTopupReason(e.target.value)} />
                </label>

                <button
                  className="admin-button"
                  type="button"
                  onClick={() => onTopup(local.passId, topupDelta, topupReason)}
                >
                  Apply topup
                </button>

                <span className="admin-muted" style={{ fontSize: 12 }}>
                  Current credits: <strong>{local.credits}</strong>
                </span>
              </div>
            </Section>

            <Expandable title="View more: Raw customer JSON">
              <pre style={{ whiteSpace: "pre-wrap" }}>{safeJson(local.raw)}</pre>
            </Expandable>
          </>
        )}
      </Section>
    </div>
  );
}

/* -----------------------------
   ACTIVITY TAB
------------------------------ */

function ActivityTab({
  rows,
  loading,
  error,
  onRefresh,
  selected,
  onSelect,
  onSoftDelete,
  filterBar,
}: {
  rows: LedgerRow[];
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
  selected: LedgerRow | null;
  onSelect: (r: LedgerRow) => void;
  onSoftDelete: (mgId: string) => void;
  filterBar: React.ReactNode;
}) {
  const [deleting, setDeleting] = useState(false);

  const doDelete = async () => {
    if (!selected) return;
    const ok = window.confirm(`Soft-delete this ledger row?\n\nmg_id: ${selected.mg_id}`);
    if (!ok) return;

    setDeleting(true);
    try {
      await onSoftDelete(selected.mg_id);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="admin-grid admin-split">
      <Section
        title="Activity (MEGA ledger)"
        description={`From "${MEGA_GENERATIONS_TABLE}" with record_type = generation/session/feedback/credit_transaction.`}
        right={
          <div className="admin-inline">
            {filterBar}
            <button className="admin-button ghost" type="button" onClick={onRefresh} disabled={loading}>
              {loading ? "Refreshing..." : "Refresh"}
            </button>
            <button
              className="admin-button"
              type="button"
              onClick={doDelete}
              disabled={!selected || deleting}
              title={!selected ? "Select a row first" : "Soft-delete selected"}
            >
              {deleting ? "Deleting..." : "Delete selected"}
            </button>
          </div>
        }
      >
        {error && (
          <div style={{ padding: 12, marginTop: 10, border: "1px solid crimson", color: "crimson", borderRadius: 8 }}>
            <strong>Load error:</strong> {error}
          </div>
        )}

        {!error && !loading && rows.length === 0 && (
          <div className="admin-muted" style={{ padding: 12 }}>
            No rows found.
          </div>
        )}

        <div className="admin-grid-gallery">
          {rows.slice(0, 280).map((r) => {
            const url = extractLikelyImageUrl(r.raw);
            const active = selected?.mg_id === r.mg_id;
            const label =
              r.mg_title ||
              (r.mg_error ? `❌ ${r.mg_error}` : "") ||
              `${r.mg_record_type} • ${r.mg_provider || ""} ${r.mg_model || ""}`.trim() ||
              r.mg_id;

            return (
              <button
                key={r.mg_id}
                className={`admin-grid-card ${active ? "active" : ""}`}
                onClick={() => onSelect(r)}
              >
                {url ? <img src={url} alt={label} loading="lazy" /> : <div className="admin-placeholder">no preview</div>}
                <div className="admin-grid-meta">
                  <div className="admin-grid-prompt" style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <strong>{label}</strong>
                    {r.mg_error ? <Chip tone="bad">error</Chip> : r.mg_status ? <Chip tone="neutral">{r.mg_status}</Chip> : null}
                    <Chip tone="neutral">{r.mg_record_type}</Chip>
                  </div>
                  <div className="admin-grid-sub">
                    pass: {truncateId(r.mg_pass_id)} • {r.mg_created_at || "—"}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </Section>

      <Section title="Details" description="Summary first, expand for raw fields.">
        {!selected ? (
          <p className="admin-muted">Select a row to inspect.</p>
        ) : (
          <>
            <div className="admin-inline" style={{ flexWrap: "wrap" }}>
              <Chip tone="neutral">mg_id: {truncateId(selected.mg_id, 38)}</Chip>
              <Chip tone="neutral">type: {selected.mg_record_type}</Chip>
              <Chip tone="neutral">pass: {truncateId(selected.mg_pass_id, 38)}</Chip>
              {selected.mg_provider ? <Chip tone="neutral">provider: {selected.mg_provider}</Chip> : null}
              {selected.mg_model ? <Chip tone="neutral">model: {selected.mg_model}</Chip> : null}
              {selected.mg_status ? <Chip tone="neutral">status: {selected.mg_status}</Chip> : null}
              {selected.mg_error ? <Chip tone="bad">error: {truncateId(selected.mg_error, 40)}</Chip> : null}
            </div>

            <Divider h={12} />

            <Expandable title="View more: Important fields + raw JSON" defaultOpen>
              <RawViewer row={selected.raw} />
            </Expandable>
          </>
        )}
      </Section>
    </div>
  );
}

/* -----------------------------
   LOGS TAB
------------------------------ */

function emojiForStatus(status: number | null) {
  if (!status) return "ℹ️";
  if (status >= 500) return "❌";
  if (status >= 400) return "⚠️";
  return "✅";
}

function LogsTab({
  logs,
  errors,
  loadingLogs,
  loadingErrors,
  errLogs,
  errErrors,
  onReloadLogs,
  onReloadErrors,
}: {
  logs: AdminLog[];
  errors: LedgerRow[];
  loadingLogs: boolean;
  loadingErrors: boolean;
  errLogs: string | null;
  errErrors: string | null;
  onReloadLogs: () => void;
  onReloadErrors: () => void;
}) {
  const [view, setView] = useState<"admin" | "errors">("admin");
  const [paused, setPaused] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const visibleLines = useMemo(() => {
    if (view === "admin") return logs;
    return [];
  }, [logs, view]);

  const scrollToBottom = () => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  };

  useEffect(() => {
    if (paused) return;
    setTimeout(scrollToBottom, 30);
  }, [paused, logs.length]);

  return (
    <div className="admin-grid">
      <Section
        title="Logs / Errors"
        description="Admin audit comes from mega_admin. Errors come from mega_generations where mg_error is set."
        right={
          <div className="admin-inline">
            <button
              className={`admin-button ghost`}
              type="button"
              onClick={() => setView("admin")}
              style={{ opacity: view === "admin" ? 1 : 0.65 }}
            >
              Admin audit
            </button>
            <button
              className={`admin-button ghost`}
              type="button"
              onClick={() => setView("errors")}
              style={{ opacity: view === "errors" ? 1 : 0.65 }}
            >
              Errors
            </button>

            <button className="admin-button ghost" type="button" onClick={() => setPaused((p) => !p)}>
              {paused ? "Resume" : "Pause"}
            </button>

            {view === "admin" ? (
              <button className="admin-button ghost" type="button" onClick={onReloadLogs} disabled={loadingLogs}>
                {loadingLogs ? "Loading..." : "Reload"}
              </button>
            ) : (
              <button className="admin-button ghost" type="button" onClick={onReloadErrors} disabled={loadingErrors}>
                {loadingErrors ? "Loading..." : "Reload"}
              </button>
            )}
          </div>
        }
      >
        {view === "admin" && errLogs && (
          <div style={{ padding: 12, marginTop: 10, border: "1px solid crimson", color: "crimson", borderRadius: 8 }}>
            <strong>Logs error:</strong> {errLogs}
          </div>
        )}

        {view === "errors" && errErrors && (
          <div style={{ padding: 12, marginTop: 10, border: "1px solid crimson", color: "crimson", borderRadius: 8 }}>
            <strong>Errors load error:</strong> {errErrors}
          </div>
        )}

        {view === "admin" ? (
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
            {visibleLines.length === 0 ? (
              <div className="admin-muted">{loadingLogs ? "Loading…" : "No admin logs yet."}</div>
            ) : (
              visibleLines.map((l) => (
                <div key={l.mg_id} style={{ whiteSpace: "pre-wrap", marginBottom: 8 }}>
                  {emojiForStatus(l.mg_status)}{" "}
                  <span style={{ opacity: 0.75 }}>[{l.mg_created_at || "—"}]</span>{" "}
                  <span style={{ fontWeight: 800 }}>{l.mg_action || l.mg_record_type}</span>{" "}
                  <span style={{ opacity: 0.8 }}>{l.mg_method || ""}</span>{" "}
                  <span style={{ opacity: 0.8 }}>{l.mg_route || ""}</span>{" "}
                  <span style={{ opacity: 0.75 }}>
                    {l.mg_email ? `(${l.mg_email})` : ""}
                  </span>
                  <Expandable title="View more: detail">
                    <pre style={{ whiteSpace: "pre-wrap" }}>{safeJson(l.mg_detail)}</pre>
                  </Expandable>
                </div>
              ))
            )}
          </div>
        ) : (
          <div style={{ marginTop: 12 }}>
            {errors.length === 0 ? (
              <div className="admin-muted">{loadingErrors ? "Loading…" : "No errors found."}</div>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                {errors.slice(0, 250).map((e) => (
                  <div key={e.mg_id} style={{ border: "1px solid #eee", borderRadius: 12, padding: 12, background: "white" }}>
                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                      <Chip tone="bad">error</Chip>
                      <Chip tone="neutral">{e.mg_record_type}</Chip>
                      <Chip tone="neutral">pass: {truncateId(e.mg_pass_id, 38)}</Chip>
                      {e.mg_provider ? <Chip tone="neutral">provider: {e.mg_provider}</Chip> : null}
                      {e.mg_model ? <Chip tone="neutral">model: {e.mg_model}</Chip> : null}
                      <span style={{ fontWeight: 900 }}>{e.mg_error}</span>
                    </div>
                    <div className="admin-muted" style={{ marginTop: 6, fontSize: 12 }}>
                      {e.mg_created_at || "—"} • mg_id: {truncateId(e.mg_id, 40)}
                    </div>
                    <Expandable title="View more: raw error row">
                      <RawViewer row={e.raw} />
                    </Expandable>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
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

  // Filters (shared)
  const [search, setSearch] = useState<string>("");

  // Counts for header
  const [countCustomers, setCountCustomers] = useState(0);
  const [countLedger, setCountLedger] = useState(0);
  const [countErrors, setCountErrors] = useState(0);

  // CONFIG (app + runtime) in mega_admin
  const [appConfig, setAppConfig] = useState<any | null>(null);
  const [appLoading, setAppLoading] = useState(false);
  const [appSaving, setAppSaving] = useState(false);
  const [appError, setAppError] = useState<string | null>(null);

  const [runtimeConfig, setRuntimeConfig] = useState<any | null>(null);
  const [runtimeLoading, setRuntimeLoading] = useState(false);
  const [runtimeSaving, setRuntimeSaving] = useState(false);
  const [runtimeError, setRuntimeError] = useState<string | null>(null);

  // Customers
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [customersLoading, setCustomersLoading] = useState(false);
  const [customersError, setCustomersError] = useState<string | null>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerRow | null>(null);

  // Activity / ledger
  const [ledger, setLedger] = useState<LedgerRow[]>([]);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [ledgerError, setLedgerError] = useState<string | null>(null);
  const [selectedLedger, setSelectedLedger] = useState<LedgerRow | null>(null);

  const [recordType, setRecordType] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("");

  // Logs
  const [adminLogs, setAdminLogs] = useState<AdminLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logsError, setLogsError] = useState<string | null>(null);

  const [errors, setErrors] = useState<LedgerRow[]>([]);
  const [errorsLoading, setErrorsLoading] = useState(false);
  const [errorsError, setErrorsError] = useState<string | null>(null);

  const firstLoadRef = useRef(false);

  /* -------- load functions -------- */

  const reloadAppConfig = async () => {
    setAppLoading(true);
    setAppError(null);
    try {
      const row = await loadMegaConfig(APP_CONFIG_RECORD_TYPE);
      setAppConfig(row.mg_value ?? {});
    } catch (e: any) {
      setAppError(e?.message ?? "Failed to load app config");
      setAppConfig({});
    } finally {
      setAppLoading(false);
    }
  };

  const saveAppConfig = async () => {
    setAppSaving(true);
    setAppError(null);
    try {
      await saveMegaConfig(APP_CONFIG_RECORD_TYPE, appConfig ?? {});
      await reloadAppConfig();
      alert("AI config saved ✅");
    } catch (e: any) {
      setAppError(e?.message ?? "Save failed");
      alert(e?.message ?? "Save failed");
    } finally {
      setAppSaving(false);
    }
  };

  const reloadRuntimeConfig = async () => {
    setRuntimeLoading(true);
    setRuntimeError(null);
    try {
      const row = await loadMegaConfig(RUNTIME_CONFIG_RECORD_TYPE);
      setRuntimeConfig(row.mg_value ?? {});
    } catch (e: any) {
      setRuntimeError(e?.message ?? "Failed to load runtime config");
      setRuntimeConfig({});
    } finally {
      setRuntimeLoading(false);
    }
  };

  const saveRuntimeConfig = async (next: any) => {
    setRuntimeSaving(true);
    setRuntimeError(null);
    try {
      await saveMegaConfig(RUNTIME_CONFIG_RECORD_TYPE, next ?? {});
      await reloadRuntimeConfig();
      alert("Runtime config saved ✅");
    } catch (e: any) {
      setRuntimeError(e?.message ?? "Save failed");
      alert(e?.message ?? "Save failed");
    } finally {
      setRuntimeSaving(false);
    }
  };

  const refreshCustomers = async () => {
    setCustomersLoading(true);
    setCustomersError(null);
    try {
      const rows = await loadCustomers({ q: search, limit: 350 });
      setCustomers(rows);
      setCountCustomers(rows.length);
      // keep selection if still exists
      if (selectedCustomer) {
        const nextSel = rows.find((x) => x.passId === selectedCustomer.passId) || null;
        setSelectedCustomer(nextSel);
      }
    } catch (e: any) {
      setCustomersError(e?.message ?? "Failed to load customers");
      setCustomers([]);
      setCountCustomers(0);
      setSelectedCustomer(null);
    } finally {
      setCustomersLoading(false);
    }
  };

  const refreshLedger = async () => {
    setLedgerLoading(true);
    setLedgerError(null);
    try {
      const rows = await loadLedger({
        passId: "", // optional (we filter by search instead)
        recordType,
        q: search,
        status: statusFilter,
        limit: 350,
      });
      setLedger(rows);
      setCountLedger(rows.length);
      if (selectedLedger) {
        const nextSel = rows.find((x) => x.mg_id === selectedLedger.mg_id) || null;
        setSelectedLedger(nextSel);
      }
    } catch (e: any) {
      setLedgerError(e?.message ?? "Failed to load activity");
      setLedger([]);
      setCountLedger(0);
      setSelectedLedger(null);
    } finally {
      setLedgerLoading(false);
    }
  };

  const refreshLogs = async () => {
    setLogsLoading(true);
    setLogsError(null);
    try {
      const rows = await loadAdminLogs({ recordType: "all", limit: 700 });
      setAdminLogs(rows);
    } catch (e: any) {
      setLogsError(e?.message ?? "Failed to load logs");
      setAdminLogs([]);
    } finally {
      setLogsLoading(false);
    }
  };

  const refreshErrors = async () => {
    setErrorsLoading(true);
    setErrorsError(null);
    try {
      const rows = await loadRecentErrors(300);
      setErrors(rows);
      setCountErrors(rows.length);
    } catch (e: any) {
      setErrorsError(e?.message ?? "Failed to load errors");
      setErrors([]);
      setCountErrors(0);
    } finally {
      setErrorsLoading(false);
    }
  };

  /* -------- actions -------- */

  const saveSelectedCustomer = async (next: CustomerRow) => {
    try {
      await saveCustomer(next.passId, {
        mg_email: next.email,
        mg_display_name: next.displayName,
        mg_shopify_customer_id: next.shopifyCustomerId,
        mg_credits: next.credits,
        mg_expires_at: next.expiresAt,
        mg_disabled: next.disabled,
      });
      alert("Customer saved ✅");
      await refreshCustomers();
    } catch (e: any) {
      alert(e?.message ?? "Save failed");
    }
  };

  const applyTopup = async (passId: string, delta: number, reason: string) => {
    if (!delta || !Number.isFinite(delta)) {
      alert("Delta must be a number");
      return;
    }
    try {
      const nextCredits = await topupCustomer(passId, delta, reason);
      alert(`Topup applied ✅ New credits: ${nextCredits}`);
      await refreshCustomers();
      await refreshLedger();
      await refreshErrors();
    } catch (e: any) {
      alert(e?.message ?? "Topup failed");
    }
  };

  const doSoftDelete = async (mgId: string) => {
    try {
      await softDeleteLedgerRow(mgId);
      alert("Row deleted (soft) ✅");
      await refreshLedger();
      await refreshErrors();
    } catch (e: any) {
      alert(e?.message ?? "Delete failed");
    }
  };

  /* -------- initial load -------- */

  useEffect(() => {
    if (allowed !== true) return;
    if (firstLoadRef.current) return;
    firstLoadRef.current = true;

    void reloadAppConfig();
    void reloadRuntimeConfig();
    void refreshCustomers();
    void refreshLedger();
    void refreshLogs();
    void refreshErrors();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowed]);

  const applyFilter = () => {
    void refreshCustomers();
    void refreshLedger();
  };

  if (allowed === null) return <div style={{ padding: 24 }}>Loading admin…</div>;
  if (allowed === false) return null;

  const rightStatus = (
    <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
      <span className="admin-muted" style={{ fontSize: 12 }}>
        Customers: <strong>{countCustomers}</strong>
      </span>
      <span className="admin-muted" style={{ fontSize: 12 }}>
        Activity: <strong>{countLedger}</strong>
      </span>
      <span className="admin-muted" style={{ fontSize: 12 }}>
        Errors: <strong>{countErrors}</strong>
      </span>
    </div>
  );

  const filterBar = (
    <>
      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search: passId/email/userId/shopify/provider/model/error…"
        style={{ minWidth: 360 }}
      />
      <button className="admin-button ghost" type="button" onClick={applyFilter}>
        Apply
      </button>
      <button
        className="admin-button ghost"
        type="button"
        onClick={() => {
          setSearch("");
          setTimeout(() => applyFilter(), 0);
        }}
      >
        Clear
      </button>
    </>
  );

  const activityFilters = (
    <>
      <select value={recordType} onChange={(e) => setRecordType(e.target.value)}>
        <option value="all">All types</option>
        <option value="generation">generation</option>
        <option value="session">session</option>
        <option value="feedback">feedback</option>
        <option value="credit_transaction">credit_transaction</option>
      </select>

      <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
        <option value="">Any status</option>
        <option value="ok">ok</option>
        <option value="error">error</option>
        <option value="queued">queued</option>
        <option value="running">running</option>
      </select>
    </>
  );

  return (
    <div className="admin-shell">
      <AdminHeader rightStatus={rightStatus} />

      <StickyTabs active={tab} onChange={setTab} />

      <div className="admin-content">
        {tab === "runtime" && (
          <ConfigTab
            appConfig={appConfig}
            setAppConfig={setAppConfig}
            appLoading={appLoading}
            appError={appError}
            onReloadApp={() => void reloadAppConfig()}
            onSaveApp={() => void saveAppConfig()}
            savingApp={appSaving}
            runtimeConfig={runtimeConfig}
            runtimeLoading={runtimeLoading}
            runtimeError={runtimeError}
            onReloadRuntime={() => void reloadRuntimeConfig()}
            onSaveRuntime={(next) => void saveRuntimeConfig(next)}
            savingRuntime={runtimeSaving}
          />
        )}

        {tab === "ai" && (
          <ConfigTab
            appConfig={appConfig}
            setAppConfig={setAppConfig}
            appLoading={appLoading}
            appError={appError}
            onReloadApp={() => void reloadAppConfig()}
            onSaveApp={() => void saveAppConfig()}
            savingApp={appSaving}
            runtimeConfig={runtimeConfig}
            runtimeLoading={runtimeLoading}
            runtimeError={runtimeError}
            onReloadRuntime={() => void reloadRuntimeConfig()}
            onSaveRuntime={(next) => void saveRuntimeConfig(next)}
            savingRuntime={runtimeSaving}
          />
        )}

        {tab === "customers" && (
          <>
            <div className="admin-grid">
              <Section title="Search" description="Filter customers + activity with one search input.">
                <div className="admin-inline">{filterBar}</div>
              </Section>
            </div>

            <CustomersTab
              rows={customers}
              loading={customersLoading}
              error={customersError}
              onRefresh={() => void refreshCustomers()}
              selected={selectedCustomer}
              onSelect={(c) => setSelectedCustomer(c)}
              onSaveSelected={(next) => void saveSelectedCustomer(next)}
              onTopup={(passId, delta, reason) => void applyTopup(passId, delta, reason)}
            />
          </>
        )}

        {tab === "activity" && (
          <>
            <div className="admin-grid">
              <Section title="Filters" description="Search + record type + status.">
                <div className="admin-inline">
                  {filterBar}
                  {activityFilters}
                  <button className="admin-button ghost" type="button" onClick={() => void refreshLedger()} disabled={ledgerLoading}>
                    {ledgerLoading ? "Loading..." : "Reload"}
                  </button>
                </div>
              </Section>
            </div>

            <ActivityTab
              rows={ledger}
              loading={ledgerLoading}
              error={ledgerError}
              onRefresh={() => void refreshLedger()}
              selected={selectedLedger}
              onSelect={(r) => setSelectedLedger(r)}
              onSoftDelete={(mgId) => void doSoftDelete(mgId)}
              filterBar={<span className="admin-muted" style={{ fontSize: 12 }}>Showing: {ledger.length}</span>}
            />
          </>
        )}

        {tab === "logs" && (
          <LogsTab
            logs={adminLogs}
            errors={errors}
            loadingLogs={logsLoading}
            loadingErrors={errorsLoading}
            errLogs={logsError}
            errErrors={errorsError}
            onReloadLogs={() => void refreshLogs()}
            onReloadErrors={() => void refreshErrors()}
          />
        )}
      </div>

      <div className="admin-footer">
        <span>
          MEGA tables: <strong>{MEGA_CUSTOMERS_TABLE}</strong> • <strong>{MEGA_GENERATIONS_TABLE}</strong> •{" "}
          <strong>{MEGA_ADMIN_TABLE}</strong>
        </span>
      </div>
    </div>
  );
}
