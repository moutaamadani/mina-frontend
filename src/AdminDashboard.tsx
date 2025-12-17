// AdminDashboard.tsx (MEGA-first)
// - Frontend reads/writes Supabase tables directly
// - Config: mina_admin_config (singleton JSON)  ✅ ONE config table
// - Customers: mega_customers                  ✅ Pass ID = mg_pass_id
// - Activity: mega_generations (ledger)        ✅ all AI fields available in details
// - Logs/Errors: logs table (if present)

import React, { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "./lib/supabaseClient";
import { isAdmin } from "./lib/adminConfig";
import "./admin.css";

type TabKey = "config" | "customers" | "activity" | "logs";

const TAB_LABELS: Record<TabKey, string> = {
  config: "Config",
  customers: "Customers",
  activity: "Activity",
  logs: "Logs / Errors",
};

/** Candidates (we auto-pick the first that works in YOUR DB) */
const TABLE_CANDIDATES = {
  CONFIG: ["mega_admin"],
  SECRETS: ["mega_admin"],
  CUSTOMERS: ["mega_customers", "MEGA_CUSTOMERS"],
  LEDGER: ["mega_generations", "MEGA_GENERATIONS"],
  LOGS: ["mega_admin"],
} as const;

/* ---------------------------------------------
   Small UI components (reuse your admin.css)
---------------------------------------------- */

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
        <div className="admin-subtitle">MEGA dashboard (Supabase live)</div>
      </div>
      <div className="admin-actions">
        {rightStatus}
        {rightActions}
      </div>
    </header>
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
          type="button"
        >
          {TAB_LABELS[key]}
        </button>
      ))}
    </nav>
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
      <header style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
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
        fontWeight: 700,
        lineHeight: 1,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}

function MonoBox({ label, value, collapsedLines = 6 }: { label: string; value: string; collapsedLines?: number }) {
  const [open, setOpen] = useState(false);
  const lines = value.split("\n");
  const shouldCollapse = lines.length > collapsedLines;

  return (
    <div style={{ border: "1px solid #eee", borderRadius: 12, padding: 12, background: "white" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <div style={{ fontWeight: 900 }}>{label}</div>
        {shouldCollapse && (
          <button className="admin-button ghost" type="button" onClick={() => setOpen((v) => !v)}>
            {open ? "Collapse" : "View more"}
          </button>
        )}
      </div>
      <pre style={{ margin: "10px 0 0", whiteSpace: "pre-wrap" }}>
        {shouldCollapse && !open ? lines.slice(0, collapsedLines).join("\n") + "\n…" : value}
      </pre>
    </div>
  );
}

/* ---------------------------------------------
   Helpers
---------------------------------------------- */

function safeJson(obj: any) {
  try {
    return JSON.stringify(obj ?? {}, null, 2);
  } catch {
    return String(obj);
  }
}

function truncateId(s: string, max = 24) {
  if (!s) return "";
  if (s.length <= max) return s;
  const head = Math.max(10, Math.floor(max / 2));
  const tail = Math.max(8, max - head - 1);
  return `${s.slice(0, head)}…${s.slice(-tail)}`;
}

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

function extractLikelyAssetUrl(row: any): string | null {
  if (!row) return null;
  const candidates = [
    "mg_output_url",
    "mg_image_url",
    "mg_video_url",
    "mg_output",
    "output_url",
    "image_url",
    "video_url",
    "url",
  ];
  for (const k of candidates) {
    const v = row?.[k];
    if (typeof v === "string" && v.startsWith("http")) return v;
  }
  for (const k of Object.keys(row)) {
    const v = row[k];
    if (typeof v === "string" && v.startsWith("http") && /url|image|video|output/i.test(k)) return v;
  }
  return null;
}

function isProbablyImage(url: string) {
  return /\.(png|jpe?g|webp|gif)$/i.test(url) || /image/i.test(url);
}

async function resolveFirstWorkingTable(candidates: readonly string[]) {
  for (const t of candidates) {
    const probe = await supabase.from(t).select("*").limit(1);
    if (!probe.error) return t;
  }
  return null;
}

async function loadWithOrderFallback(table: string, limit: number, orderCols: string[]) {
  for (const col of orderCols) {
    const q = await supabase.from(table).select("*").order(col, { ascending: false }).limit(limit);
    if (!q.error) return q.data ?? [];
  }
  const fallback = await supabase.from(table).select("*").limit(limit);
  if (fallback.error) throw new Error(fallback.error.message);
  return fallback.data ?? [];
}

/* ---------------------------------------------
   Admin guard
---------------------------------------------- */

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

/* ---------------------------------------------
   CONFIG (ONE TABLE): mina_admin_config
---------------------------------------------- */

type MinaConfig = any;

const ADMIN_CONFIG_RECORD_TYPE = "admin_config";
const PROVIDER_SECRET_RECORD_TYPE = "provider_secret";

function scrubSecretsDeep(config: any) {
  // Frontend safety: never write raw `secret` keys if someone pasted them.
  const secretish = new Set([
    "secret",
    "apiKey",
    "apikey",
    "token",
    "password",
    "serviceRoleKey",
    "service_role_key",
    "privateKey",
  ]);

  const walk = (v: any): any => {
    if (Array.isArray(v)) return v.map(walk);
    if (!v || typeof v !== "object") return v;

    const out: any = {};
    for (const k of Object.keys(v)) {
      if (secretish.has(k)) continue;
      out[k] = walk(v[k]);
    }
    return out;
  };

  return walk(config ?? {});
}

async function loadSingletonConfig(configTable: string) {
  const { data, error } = await supabase
    .from(configTable)
    .select("mg_value, mg_updated_at, mg_created_at, mg_meta")
    .eq("mg_record_type", ADMIN_CONFIG_RECORD_TYPE)
    .eq("mg_key", "singleton")
    .maybeSingle();

  if (error) throw new Error(error.message);
  return (data?.mg_value ?? {}) as MinaConfig;
}

async function saveSingletonConfig(configTable: string, nextConfig: MinaConfig, updatedByEmail?: string | null) {
  const patch = {
    mg_id: `${ADMIN_CONFIG_RECORD_TYPE}:singleton`,
    mg_record_type: ADMIN_CONFIG_RECORD_TYPE,
    mg_key: "singleton",
    mg_value: scrubSecretsDeep(nextConfig),
    mg_meta: { updated_by: updatedByEmail ?? null },
    mg_updated_at: new Date().toISOString(),
  };

  const { error } = await supabase.from(configTable).upsert(patch, { onConflict: "mg_id" });
  if (error) throw new Error(error.message);
}

/* ---------------------------------------------
   CUSTOMERS: mega_customers
---------------------------------------------- */

type MegaCustomer = {
  mg_pass_id: string;
  mg_email: string | null;
  mg_user_id: string | null;
  mg_shopify_customer_id: string | null;
  mg_credits: number;
  mg_expires_at: string | null;
  mg_last_active: string | null;
  mg_disabled: boolean;
  mg_verified_email?: boolean;
  mg_verified_google?: boolean;
  mg_verified_apple?: boolean;
  raw: any;
};

function normalizeCustomers(rows: any[]): MegaCustomer[] {
  return rows
    .map((r) => {
      const passId = pickString(r, ["mg_pass_id"], "");
      if (!passId) return null;

      return {
        mg_pass_id: passId,
        mg_email: pickString(r, ["mg_email"], "") || null,
        mg_user_id: pickString(r, ["mg_user_id"], "") || null,
        mg_shopify_customer_id: pickString(r, ["mg_shopify_customer_id"], "") || null,
        mg_credits: pickNumber(r, ["mg_credits"], 0),
        mg_expires_at: pickString(r, ["mg_expires_at"], "") || null,
        mg_last_active: pickString(r, ["mg_last_active", "mg_updated_at"], "") || null,
        mg_disabled: Boolean(r?.mg_disabled ?? false),
        mg_verified_email: Boolean(r?.mg_verified_email ?? false),
        mg_verified_google: Boolean(r?.mg_verified_google ?? false),
        mg_verified_apple: Boolean(r?.mg_verified_apple ?? false),
        raw: r,
      };
    })
    .filter(Boolean) as MegaCustomer[];
}

async function updateCustomerRow(customersTable: string, passId: string, patch: any) {
  const { error } = await supabase.from(customersTable).update(patch).eq("mg_pass_id", passId);
  if (error) throw new Error(error.message);
}

/* ---------------------------------------------
   LEDGER: mega_generations (Activity)
---------------------------------------------- */

type LedgerType = "generation" | "session" | "feedback" | "credit_transaction" | "all";

type LedgerRow = {
  mg_id: string;
  mg_record_type: string;
  mg_pass_id: string;
  mg_created_at: string;
  raw: any;
};

function normalizeLedger(rows: any[]): LedgerRow[] {
  return rows
    .map((r) => {
      const id = pickString(r, ["mg_id"], "");
      const t = pickString(r, ["mg_record_type"], "");
      const pass = pickString(r, ["mg_pass_id", "mg_actor_pass_id"], "");
      const at = pickString(r, ["mg_event_at", "mg_created_at", "mg_updated_at"], "") || new Date().toISOString();
      if (!id) return null;
      return { mg_id: id, mg_record_type: t || "unknown", mg_pass_id: pass || "(no pass)", mg_created_at: at, raw: r };
    })
    .filter(Boolean) as LedgerRow[];
}

async function deleteLedgerRow(ledgerTable: string, mgId: string) {
  const { error } = await supabase.from(ledgerTable).delete().eq("mg_id", mgId);
  if (error) throw new Error(error.message);
}

/* Optional: topup by writing customers + ledger (best effort) */
async function addCreditsWithLedger(opts: {
  customersTable: string;
  ledgerTable: string;
  passId: string;
  delta: number;
  reason: string;
  source?: string;
  adminEmail?: string | null;
}) {
  const { customersTable, ledgerTable, passId, delta, reason, source, adminEmail } = opts;

  // Step 1: read current credits
  const cur = await supabase.from(customersTable).select("mg_credits").eq("mg_pass_id", passId).maybeSingle();
  if (cur.error) throw new Error(cur.error.message);

  const current = Number(cur.data?.mg_credits ?? 0);
  const next = current + delta;

  // Step 2: update customer
  const upd = await supabase.from(customersTable).update({ mg_credits: next, mg_last_active: new Date().toISOString() }).eq("mg_pass_id", passId);
  if (upd.error) throw new Error(upd.error.message);

  // Step 3: insert ledger row (non-atomic but gives visibility)
  const mgId = `credit_${crypto.randomUUID()}`;
  const ins = await supabase.from(ledgerTable).insert({
    mg_id: mgId,
    mg_record_type: "credit_transaction",
    mg_pass_id: passId,
    mg_delta: delta,
    mg_reason: reason,
    mg_source: source ?? "admin",
    mg_ref_type: "admin",
    mg_ref_id: adminEmail ?? null,
    mg_meta: { adminEmail: adminEmail ?? null },
    mg_created_at: new Date().toISOString(),
    mg_updated_at: new Date().toISOString(),
  } as any);

  if (ins.error) {
    // We don't fail the whole operation, but we DO surface it.
    throw new Error(`Credits updated, but failed to write ledger row: ${ins.error.message}`);
  }
}

/* ---------------------------------------------
   LOGS: logs table (if present)
---------------------------------------------- */

type LogLine = {
  at: string;
  level: string;
  source: string;
  message: string;
  raw: any;
};

function normalizeLog(r: any): LogLine {
  // logs table shape
  const at = pickString(r, ["mg_event_at", "mg_created_at", "mg_updated_at"], "") || new Date().toISOString();

  const level = pickString(r, ["mg_record_type"], "") || (pickNumber(r, ["mg_status"], 200) >= 400 ? "error" : "info");

  const source = pickString(r, ["mg_route", "mg_action"], "") || pickString(r, ["mg_record_type"], "admin");

  const message =
    pickString(r, ["message", "msg", "text"], "") ||
    pickString(r, ["mg_action"], "") ||
    pickString(r, ["mg_route"], "") ||
    safeJson(r);

  return { at, level: level || "info", source: source || "logs", message, raw: r };
}

function emojiForLevel(level: string) {
  const l = (level || "").toLowerCase();
  if (l.includes("error") || l === "err") return "❌";
  if (l.includes("warn")) return "⚠️";
  if (l.includes("debug")) return "🪲";
  return "ℹ️";
}

/* ---------------------------------------------
   MAIN
---------------------------------------------- */

export default function AdminDashboard() {
  const allowed = useAdminGuard();

  const [tab, setTab] = useState<TabKey>("customers");

  // resolved table names (auto-detected)
  const [tConfig, setTConfig] = useState<string | null>(null);
  const [tSecrets, setTSecrets] = useState<string | null>(null);
  const [tCustomers, setTCustomers] = useState<string | null>(null);
  const [tLedger, setTLedger] = useState<string | null>(null);
  const [tLogs, setTLogs] = useState<string | null>(null);

  // config
  const [config, setConfig] = useState<MinaConfig>({});
  const [configRawJson, setConfigRawJson] = useState<string>("{}");
  const [configLoading, setConfigLoading] = useState(false);
  const [configSaving, setConfigSaving] = useState(false);
  const [configError, setConfigError] = useState<string | null>(null);
  const [configDirty, setConfigDirty] = useState(false);

  // customers
  const [customers, setCustomers] = useState<MegaCustomer[]>([]);
  const [customersLoading, setCustomersLoading] = useState(false);
  const [customersError, setCustomersError] = useState<string | null>(null);
  const [customerSearch, setCustomerSearch] = useState("");

  // activity
  const [ledger, setLedger] = useState<LedgerRow[]>([]);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [ledgerError, setLedgerError] = useState<string | null>(null);
  const [ledgerSelected, setLedgerSelected] = useState<LedgerRow | null>(null);
  const [ledgerSearch, setLedgerSearch] = useState("");
  const [ledgerType, setLedgerType] = useState<LedgerType>("all");
  const [ledgerStatus, setLedgerStatus] = useState<string>("all");

  // logs
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logsError, setLogsError] = useState<string | null>(null);
  const [logsPaused, setLogsPaused] = useState(false);
  const [logsOnlyErrors, setLogsOnlyErrors] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const firstLoadRef = useRef(false);

  // current user email (for audit fields)
  const [adminEmail, setAdminEmail] = useState<string | null>(null);

  useEffect(() => {
    const run = async () => {
      const { data } = await supabase.auth.getUser();
      setAdminEmail(data.user?.email?.toLowerCase() || null);
    };
    void run();
  }, []);

  // Resolve table names once
  useEffect(() => {
    if (allowed !== true) return;
    if (firstLoadRef.current) return;
    firstLoadRef.current = true;

    const init = async () => {
      const resolvedConfig = await resolveFirstWorkingTable(TABLE_CANDIDATES.CONFIG);
      const resolvedSecrets = await resolveFirstWorkingTable(TABLE_CANDIDATES.SECRETS);
      const resolvedCustomers = await resolveFirstWorkingTable(TABLE_CANDIDATES.CUSTOMERS);
      const resolvedLedger = await resolveFirstWorkingTable(TABLE_CANDIDATES.LEDGER);
      const resolvedLogs = await resolveFirstWorkingTable(TABLE_CANDIDATES.LOGS);

      setTConfig(resolvedConfig);
      setTSecrets(resolvedSecrets);
      setTCustomers(resolvedCustomers);
      setTLedger(resolvedLedger);
      setTLogs(resolvedLogs);

      // Load initial data
      if (resolvedConfig) void refreshConfig(resolvedConfig);
      if (resolvedCustomers) void refreshCustomers(resolvedCustomers);
      if (resolvedLedger) void refreshLedger(resolvedLedger);
      void refreshLogs(resolvedLogs);
    };

    void init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowed]);

  const refreshConfig = async (configTable: string) => {
    setConfigLoading(true);
    setConfigError(null);
    try {
      const c = await loadSingletonConfig(configTable);
      setConfig(c);
      setConfigRawJson(safeJson(c));
      setConfigDirty(false);
    } catch (e: any) {
      setConfigError(e?.message ?? "Failed to load config");
      setConfig({});
      setConfigRawJson("{}");
      setConfigDirty(false);
    } finally {
      setConfigLoading(false);
    }
  };

  const saveConfig = async () => {
    if (!tConfig) return;
    setConfigSaving(true);
    setConfigError(null);
    try {
      let next = config;
      // If user edited raw JSON, parse it (optional)
      try {
        const parsed = configRawJson?.trim() ? JSON.parse(configRawJson) : {};
        next = parsed;
      } catch {
        // keep current `config` if JSON invalid
      }

      await saveSingletonConfig(tConfig, next, adminEmail);
      await refreshConfig(tConfig);
      alert("Config saved ✅");
    } catch (e: any) {
      setConfigError(e?.message ?? "Save failed");
      alert(e?.message ?? "Save failed");
    } finally {
      setConfigSaving(false);
    }
  };

  const refreshCustomers = async (customersTable: string) => {
    setCustomersLoading(true);
    setCustomersError(null);
    try {
      let rows = await loadWithOrderFallback(customersTable, 900, ["mg_updated_at", "mg_last_active", "mg_created_at"]);
      const q = customerSearch.trim().toLowerCase();
      if (q) {
        rows = (rows as any[]).filter((r) => {
          const passId = pickString(r, ["mg_pass_id"], "").toLowerCase();
          const email = pickString(r, ["mg_email"], "").toLowerCase();
          const uid = pickString(r, ["mg_user_id"], "").toLowerCase();
          const shop = pickString(r, ["mg_shopify_customer_id"], "").toLowerCase();
          return passId.includes(q) || email.includes(q) || uid.includes(q) || shop.includes(q);
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

  const refreshLedger = async (ledgerTable: string) => {
    setLedgerLoading(true);
    setLedgerError(null);
    try {
      let rows = await loadWithOrderFallback(ledgerTable, 950, ["mg_event_at", "mg_created_at", "mg_updated_at"]);
      const q = ledgerSearch.trim().toLowerCase();
      const t = ledgerType;
      const st = ledgerStatus;

      rows = (rows as any[]).filter((r) => {
        const recordType = pickString(r, ["mg_record_type"], "").toLowerCase();
        const status = pickString(r, ["mg_status"], "").toLowerCase();
        const pass = pickString(r, ["mg_pass_id", "mg_actor_pass_id"], "").toLowerCase();
        const email = pickString(r, ["mg_email"], "").toLowerCase();
        const provider = pickString(r, ["mg_provider"], "").toLowerCase();
        const model = pickString(r, ["mg_model"], "").toLowerCase();
        const err = pickString(r, ["mg_error", "error"], "").toLowerCase();

        if (t !== "all" && recordType !== t) return false;
        if (st !== "all" && status !== st) return false;

        if (!q) return true;
        return (
          pass.includes(q) ||
          email.includes(q) ||
          provider.includes(q) ||
          model.includes(q) ||
          recordType.includes(q) ||
          status.includes(q) ||
          err.includes(q)
        );
      });

      const norm = normalizeLedger(rows as any[]);
      setLedger(norm);
      // auto-clear selection if it disappeared
      setLedgerSelected((prev) => {
        if (!prev) return null;
        return norm.find((x) => x.mg_id === prev.mg_id) ? prev : null;
      });
    } catch (e: any) {
      setLedgerError(e?.message ?? "Failed to load activity");
      setLedger([]);
      setLedgerSelected(null);
    } finally {
      setLedgerLoading(false);
    }
  };

  const refreshLogs = async (logsTable: string | null) => {
    setLogsLoading(true);
    setLogsError(null);
    try {
      if (logsTable) {
        const rows = await loadWithOrderFallback(logsTable, 800, ["mg_event_at", "mg_created_at", "mg_updated_at"]);
        setLogs((rows as any[]).reverse().map(normalizeLog));
      } else {
        setLogs([]);
        setLogsError("No logs table found.");
      }
    } catch (e: any) {
      setLogsError(e?.message ?? "Failed to load logs");
      setLogs([]);
    } finally {
      setLogsLoading(false);
      setTimeout(() => {
        const el = scrollRef.current;
        if (el) el.scrollTop = el.scrollHeight;
      }, 50);
    }
  };

  // Realtime logs subscription
  useEffect(() => {
    if (allowed !== true) return;
    if (logsPaused) return;

    const table = tLogs;
    if (!table) return;

    // Subscribe to inserts (best effort)
    const channel = supabase
      .channel(`realtime:${table}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table }, (payload: any) => {
        const next = normalizeLog(payload.new);
        setLogs((prev) => [...prev, next].slice(-2000));
        setTimeout(() => {
          const el = scrollRef.current;
          if (el) el.scrollTop = el.scrollHeight;
        }, 0);
      })
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [allowed, logsPaused, tLogs]);

  const rightStatus = (
    <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
      <span className="admin-muted" style={{ fontSize: 12 }}>
        Customers: <strong>{customers.length}</strong>
      </span>
      <span className="admin-muted" style={{ fontSize: 12 }}>
        Activity: <strong>{ledger.length}</strong>
      </span>
      <span className="admin-muted" style={{ fontSize: 12 }}>
        Logs: <strong>{logs.length}</strong>
      </span>
    </div>
  );

  const rightActions =
    tab === "config" ? (
      <button className="admin-button" type="button" onClick={() => void saveConfig()} disabled={!configDirty || configSaving}>
        {configSaving ? "Saving..." : "Save"}
      </button>
    ) : null;

  if (allowed === null) return <div style={{ padding: 24 }}>Loading admin…</div>;
  if (allowed === false) return null;

  // Derived status-filter options from current ledger
  const ledgerStatusOptions = useMemo(() => {
    const s = new Set<string>();
    ledger.forEach((r) => {
      const v = pickString(r.raw, ["mg_status", "status"], "").trim();
      if (v) s.add(v);
    });
    return ["all", ...Array.from(s).sort()];
  }, [ledger]);

  // Ledger visible rows in gallery (cap)
  const ledgerVisible = useMemo(() => ledger.slice(0, 260), [ledger]);

  const logsVisible = useMemo(() => {
    const list = logsOnlyErrors
      ? logs.filter((l) => l.level.toLowerCase().includes("error") || l.level.toLowerCase().includes("err"))
      : logs;
    return list;
  }, [logs, logsOnlyErrors]);

  return (
    <div className="admin-shell">
      <AdminHeader rightStatus={rightStatus} rightActions={rightActions} />
      <StickyTabs active={tab} onChange={setTab} />

      <div className="admin-content">
        {/* CONFIG TAB */}
        {tab === "config" && (
          <div className="admin-grid">
            <Section
              title="Config (ONE table)"
              description={
                tConfig
                  ? `Reads/writes "${tConfig}" row id="singleton" (config JSON).`
                  : "Config table not found / blocked by RLS."
              }
              right={
                <div className="admin-inline">
                  <button
                    className="admin-button ghost"
                    type="button"
                    onClick={() => tConfig && refreshConfig(tConfig)}
                    disabled={!tConfig || configLoading}
                  >
                    {configLoading ? "Loading..." : "Reload"}
                  </button>
                  <button
                    className="admin-button"
                    type="button"
                    onClick={() => void saveConfig()}
                    disabled={!tConfig || configSaving || !configDirty}
                  >
                    {configSaving ? "Saving..." : "Save"}
                  </button>
                </div>
              }
            >
              {configError && (
                <div style={{ padding: 12, marginTop: 10, border: "1px solid crimson", color: "crimson", borderRadius: 8 }}>
                  <strong>Config error:</strong> {configError}
                </div>
              )}

              {!tConfig ? (
                <div className="admin-muted" style={{ padding: 12 }}>
                  Could not access config table. This is usually **RLS** (policy missing).
                </div>
              ) : (
                <>
                  <div className="admin-inline" style={{ marginTop: 8 }}>
                    <Chip>Table: {tConfig}</Chip>
                    {tSecrets && <Chip>Secrets table: {tSecrets}</Chip>}
                    {!tSecrets && <Chip>Secrets table: (not found)</Chip>}
                  </div>

                  <details style={{ marginTop: 12 }}>
                    <summary style={{ cursor: "pointer", fontWeight: 900 }}>Raw config JSON editor (source of truth)</summary>
                    <textarea
                      className="admin-textarea"
                      value={configRawJson}
                      onChange={(e) => {
                        setConfigRawJson(e.target.value);
                        setConfigDirty(true);
                      }}
                      style={{
                        minHeight: 320,
                        fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                        marginTop: 10,
                      }}
                    />
                    <div className="admin-muted" style={{ marginTop: 8 }}>
                      Tip: Don’t paste secrets here. This editor strips common secret keys on save.
                    </div>
                  </details>

                  <details style={{ marginTop: 12 }}>
                    <summary style={{ cursor: "pointer", fontWeight: 900 }}>View computed highlights</summary>
                    <div style={{ display: "grid", gap: 12, marginTop: 10 }}>
                      <MonoBox label="config.ai (as JSON)" value={safeJson(JSON.parse(configRawJson || "{}")?.ai ?? {})} />
                      <MonoBox label="config.runtime (as JSON)" value={safeJson(JSON.parse(configRawJson || "{}")?.runtime ?? {})} />
                      <MonoBox label="config.pricing (as JSON)" value={safeJson(JSON.parse(configRawJson || "{}")?.pricing ?? {})} />
                    </div>
                  </details>
                </>
              )}
            </Section>

            <Section
              title="Provider Secrets (optional)"
              description={
                tSecrets
                  ? `Stores secrets in "${tSecrets}" (mg_record_type=${PROVIDER_SECRET_RECORD_TYPE}). Masked values should be referenced from config.ai.providerKeys.`
                  : "Secrets table not found (optional)."
              }
            >
              {!tSecrets ? (
                <div className="admin-muted" style={{ padding: 12 }}>
                  Secrets are stored inside <strong>mega_admin</strong> with mg_record_type=
                  <strong>{PROVIDER_SECRET_RECORD_TYPE}</strong>. Ensure RLS only allows admins to write/read these rows.
                </div>
              ) : (
                <ProviderSecretSetter
                  secretsTable={tSecrets}
                  onWrote={() => tConfig && refreshConfig(tConfig)}
                  adminEmail={adminEmail}
                />
              )}
            </Section>
          </div>
        )}

        {/* CUSTOMERS TAB */}
        {tab === "customers" && (
          <div className="admin-grid">
            <Section
              title="Customers (MEGA)"
              description={
                tCustomers ? `From "${tCustomers}" (Pass ID is the primary identity).` : "Customers table not found / blocked by RLS."
              }
              right={
                <div className="admin-inline">
                  <input
                    value={customerSearch}
                    onChange={(e) => setCustomerSearch(e.target.value)}
                    placeholder="Search passId/email/userId/shopify..."
                    style={{ minWidth: 360 }}
                  />
                  <button
                    className="admin-button ghost"
                    type="button"
                    onClick={() => tCustomers && refreshCustomers(tCustomers)}
                    disabled={!tCustomers || customersLoading}
                  >
                    {customersLoading ? "Loading..." : "Reload"}
                  </button>
                </div>
              }
            >
              {customersError && (
                <div style={{ padding: 12, marginTop: 10, border: "1px solid crimson", color: "crimson", borderRadius: 8 }}>
                  <strong>Customers error:</strong> {customersError}
                </div>
              )}

              {!tCustomers ? (
                <div className="admin-muted" style={{ padding: 12 }}>
                  Could not access customers table. Usually **RLS**.
                </div>
              ) : (
                <CustomersTable
                  customers={customers}
                  customersTable={tCustomers}
                  ledgerTable={tLedger}
                  onRefresh={() => refreshCustomers(tCustomers)}
                  onLedgerRefresh={() => tLedger && refreshLedger(tLedger)}
                  adminEmail={adminEmail}
                />
              )}
            </Section>
          </div>
        )}

        {/* ACTIVITY TAB */}
        {tab === "activity" && (
          <div className="admin-grid admin-split">
            <Section
              title="Activity (MEGA ledger)"
              description={
                tLedger
                  ? `From "${tLedger}" where mg_record_type = generation/session/feedback/credit_transaction.`
                  : "Ledger table not found / blocked by RLS."
              }
              right={
                <div className="admin-inline" style={{ flexWrap: "wrap" }}>
                  <input
                    value={ledgerSearch}
                    onChange={(e) => setLedgerSearch(e.target.value)}
                    placeholder="Search: passId/email/userId/shopify/provider/model/error..."
                    style={{ minWidth: 380 }}
                  />

                  <select value={ledgerType} onChange={(e) => setLedgerType(e.target.value as LedgerType)}>
                    <option value="all">All types</option>
                    <option value="generation">generation</option>
                    <option value="session">session</option>
                    <option value="feedback">feedback</option>
                    <option value="credit_transaction">credit_transaction</option>
                  </select>

                  <select value={ledgerStatus} onChange={(e) => setLedgerStatus(e.target.value)}>
                    {ledgerStatusOptions.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>

                  <button
                    className="admin-button ghost"
                    type="button"
                    onClick={() => tLedger && refreshLedger(tLedger)}
                    disabled={!tLedger || ledgerLoading}
                  >
                    {ledgerLoading ? "Loading..." : "Reload"}
                  </button>

                  {ledgerSelected && tLedger && (
                    <button
                      className="admin-button"
                      type="button"
                      onClick={async () => {
                        const ok = window.confirm(`Delete this ledger row?\n\nmg_id: ${ledgerSelected.mg_id}`);
                        if (!ok) return;
                        try {
                          await deleteLedgerRow(tLedger, ledgerSelected.mg_id);
                          setLedgerSelected(null);
                          await refreshLedger(tLedger);
                        } catch (e: any) {
                          alert(e?.message ?? "Delete failed");
                        }
                      }}
                    >
                      Delete selected
                    </button>
                  )}
                </div>
              }
            >
              {ledgerError && (
                <div style={{ padding: 12, marginTop: 10, border: "1px solid crimson", color: "crimson", borderRadius: 8 }}>
                  <strong>Activity error:</strong> {ledgerError}
                  <div style={{ marginTop: 6, color: "#333" }}>
                    Usually: wrong table name, missing RLS policy, or column mismatch.
                  </div>
                </div>
              )}

              {!tLedger ? (
                <div className="admin-muted" style={{ padding: 12 }}>
                  Could not access ledger table. Usually **RLS**.
                </div>
              ) : (
                <div className="admin-grid-gallery">
                  {ledgerVisible.map((r) => {
                    const url = extractLikelyAssetUrl(r.raw);
                    const recordType = pickString(r.raw, ["mg_record_type"], r.mg_record_type);
                    const passId = pickString(r.raw, ["mg_pass_id"], r.mg_pass_id);
                    const provider = pickString(r.raw, ["mg_provider"], "");
                    const model = pickString(r.raw, ["mg_model"], "");
                    const status = pickString(r.raw, ["mg_status"], "");
                    const err = pickString(r.raw, ["mg_error"], "");
                    const label =
                      pickString(r.raw, ["mg_title", "title"], "") ||
                      pickString(r.raw, ["mg_prompt", "prompt"], "") ||
                      pickString(r.raw, ["mg_comment", "comment"], "") ||
                      recordType;

                    return (
                      <button
                        key={r.mg_id}
                        className={`admin-grid-card ${ledgerSelected?.mg_id === r.mg_id ? "active" : ""}`}
                        onClick={() => setLedgerSelected(r)}
                        type="button"
                      >
                        {url && isProbablyImage(url) ? (
                          <img src={url} alt={label} loading="lazy" />
                        ) : (
                          <div className="admin-placeholder">no preview</div>
                        )}

                        <div className="admin-grid-meta">
                          <div className="admin-grid-prompt" style={{ fontWeight: 800 }}>
                            {label || <span className="admin-muted">—</span>}
                          </div>

                          <div className="admin-grid-sub">
                            <span style={{ fontWeight: 800 }}>{recordType}</span> • {truncateId(passId)} •{" "}
                            <span style={{ opacity: 0.75 }}>{r.mg_created_at}</span>
                          </div>

                          <div className="admin-grid-sub" style={{ marginTop: 6, display: "flex", gap: 8, flexWrap: "wrap" }}>
                            {provider && <Chip>provider: {provider}</Chip>}
                            {model && <Chip>model: {truncateId(model, 18)}</Chip>}
                            {status && <Chip>status: {status}</Chip>}
                            {err && <Chip>error</Chip>}
                          </div>
                        </div>
                      </button>
                    );
                  })}

                  {!ledgerLoading && ledger.length === 0 && (
                    <div className="admin-muted" style={{ padding: 12 }}>
                      No activity rows found.
                    </div>
                  )}
                </div>
              )}
            </Section>

            <Section title="Details" description="Summary first, expand for important fields + raw JSON.">
              {!ledgerSelected ? (
                <p className="admin-muted">Select an activity row to inspect.</p>
              ) : (
                <LedgerDetails row={ledgerSelected.raw} />
              )}
            </Section>
          </div>
        )}

        {/* LOGS TAB */}
        {tab === "logs" && (
          <div className="admin-grid">
            <Section
              title="Logs / Errors (Realtime)"
              description={tLogs ? `Streaming INSERTs from "${tLogs}".` : "No logs table found."}
              right={
                <div className="admin-inline" style={{ flexWrap: "wrap" }}>
                  <button
                    className="admin-button ghost"
                    type="button"
                    onClick={() => void refreshLogs(tLogs)}
                    disabled={logsLoading}
                  >
                    {logsLoading ? "Loading..." : "Reload"}
                  </button>

                  <button className="admin-button ghost" type="button" onClick={() => setLogsPaused((p) => !p)}>
                    {logsPaused ? "Resume" : "Pause"}
                  </button>

                  <label style={{ display: "inline-flex", gap: 8, alignItems: "center", fontSize: 12, fontWeight: 800 }}>
                    <input type="checkbox" checked={logsOnlyErrors} onChange={(e) => setLogsOnlyErrors(e.target.checked)} />
                    Only errors
                  </label>

                  <button className="admin-button ghost" type="button" onClick={() => setLogs([])}>
                    Clear (local)
                  </button>

                  <button
                    className="admin-button ghost"
                    type="button"
                    onClick={() => navigator.clipboard?.writeText(logsVisible.map((l) => `${l.at} ${l.source} ${l.level} ${l.message}`).join("\n"))}
                  >
                    Copy lines
                  </button>
                </div>
              }
            >
              {logsError && (
                <div style={{ padding: 12, marginTop: 10, border: "1px solid crimson", color: "crimson", borderRadius: 8 }}>
                  <strong>Logs error:</strong> {logsError}
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
                  lineHeight: 1.45,
                  background: "white",
                }}
              >
                {logsVisible.length === 0 ? (
                  <div className="admin-muted">{logsLoading ? "Loading…" : "No logs yet."}</div>
                ) : (
                  logsVisible.map((l, i) => (
                    <details key={`${l.at}-${i}`} style={{ marginBottom: 6 }}>
                      <summary style={{ cursor: "pointer" }}>
                        {emojiForLevel(l.level)} <span style={{ opacity: 0.75 }}>[{l.at}]</span>{" "}
                        <span style={{ fontWeight: 900 }}>{l.source}</span>{" "}
                        <span style={{ opacity: 0.75 }}>{l.level}</span>{" "}
                        <span style={{ marginLeft: 8 }}>{l.message}</span>
                      </summary>
                      <pre style={{ whiteSpace: "pre-wrap", marginTop: 8 }}>{safeJson(l.raw)}</pre>
                    </details>
                  ))
                )}
              </div>
            </Section>
          </div>
        )}
      </div>

      <div className="admin-footer">
        MEGA-first admin. Tables:{" "}
        <span className="admin-muted">
          config=<strong>{tConfig || "?"}</strong> • customers=<strong>{tCustomers || "?"}</strong> • ledger=<strong>{tLedger || "?"}</strong> • logs=<strong>{tLogs || "?"}</strong>
        </span>
      </div>
    </div>
  );
}

/* ---------------------------------------------
   Ledger details panel (important fields + raw)
---------------------------------------------- */

function LedgerDetails({ row }: { row: any }) {
  const url = extractLikelyAssetUrl(row);
  const recordType = pickString(row, ["mg_record_type"], "unknown");
  const passId = pickString(row, ["mg_pass_id", "mg_actor_pass_id"], "(no pass)");
  const mgId = pickString(row, ["mg_id"], "");
  const status = pickString(row, ["mg_status"], "");
  const provider = pickString(row, ["mg_provider"], "");
  const model = pickString(row, ["mg_model"], "");
  const err = pickString(row, ["mg_error"], "");

  // These are the “every column matters” fields you asked for:
  const importantKeys = [
    "mg_title",
    "mg_type",
    "mg_platform",
    "mg_provider",
    "mg_model",
    "mg_status",
    "mg_error",
    "mg_prompt",
    "mg_output_url",
    "mg_output_key",
    "mg_input_chars",
    "mg_output_chars",
    "mg_input_tokens",
    "mg_output_tokens",
    "mg_latency_ms",
    "mg_content_type",
    "mg_session_id",
    "mg_generation_id",
    "mg_result_type",
    "mg_comment",
    "mg_delta",
    "mg_reason",
    "mg_source",
    "mg_ref_type",
    "mg_ref_id",
    "mg_meta",
  ];

  const presentImportant = importantKeys.filter((k) => row && Object.prototype.hasOwnProperty.call(row, k));

  return (
    <div className="admin-detail">
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
        {mgId && <Chip>mg_id: {truncateId(mgId, 36)}</Chip>}
        <Chip>type: {recordType}</Chip>
        <Chip>pass: {truncateId(passId, 36)}</Chip>
        {provider && <Chip>provider: {provider}</Chip>}
        {model && <Chip>model: {truncateId(model, 24)}</Chip>}
        {status && <Chip>status: {status}</Chip>}
        {err && <Chip>error</Chip>}
      </div>

      {url && isProbablyImage(url) && (
        <div style={{ marginBottom: 12 }}>
          <strong>Preview</strong>
          <div style={{ marginTop: 8 }}>
            <img src={url} alt="output" style={{ maxWidth: "100%", borderRadius: 12 }} />
          </div>
        </div>
      )}

      <details open>
        <summary style={{ cursor: "pointer", fontWeight: 900 }}>Important fields</summary>
        <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
          {presentImportant.length === 0 ? (
            <div className="admin-muted">No standard MEGA fields found on this row (check your table schema).</div>
          ) : (
            presentImportant.map((k) => (
              <MonoBox key={k} label={k} value={safeJson(row?.[k])} collapsedLines={k === "mg_prompt" ? 10 : 6} />
            ))
          )}
        </div>
      </details>

      <details style={{ marginTop: 12 }}>
        <summary style={{ cursor: "pointer", fontWeight: 900 }}>Raw JSON (everything)</summary>
        <pre style={{ whiteSpace: "pre-wrap" }}>{safeJson(row)}</pre>
      </details>
    </div>
  );
}

/* ---------------------------------------------
   Customers UI
---------------------------------------------- */

function CustomersTable(props: {
  customers: MegaCustomer[];
  customersTable: string;
  ledgerTable: string | null;
  onRefresh: () => void;
  onLedgerRefresh: () => void;
  adminEmail: string | null;
}) {
  const { customers, customersTable, ledgerTable, onRefresh, onLedgerRefresh, adminEmail } = props;

  const [local, setLocal] = useState<MegaCustomer[]>([]);
  const [dirty, setDirty] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setLocal(customers);
    setDirty({});
  }, [customers]);

  const markDirty = (passId: string) => setDirty((m) => ({ ...m, [passId]: true }));

  const updateRow = (idx: number, next: MegaCustomer) => {
    const copy = [...local];
    copy[idx] = next;
    setLocal(copy);
    markDirty(next.mg_pass_id);
  };

  const anyDirty = Object.values(dirty).some(Boolean);

  const saveAll = async () => {
    setSaving(true);
    try {
      for (const c of local) {
        if (!dirty[c.mg_pass_id]) continue;
        // eslint-disable-next-line no-await-in-loop
        await updateCustomerRow(customersTable, c.mg_pass_id, {
          mg_credits: c.mg_credits,
          mg_expires_at: c.mg_expires_at,
          mg_disabled: c.mg_disabled,
        });
      }
      alert("Customers saved ✅");
      setDirty({});
      onRefresh();
    } catch (e: any) {
      alert(e?.message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const doTopup = async (c: MegaCustomer) => {
    if (!ledgerTable) {
      alert("No mega_generations table found, so I can’t write the credit_transaction ledger row.");
      return;
    }
    const deltaStr = window.prompt(`Top up credits for:\n${c.mg_email || c.mg_pass_id}\n\nEnter delta (e.g. 10):`, "10");
    if (!deltaStr) return;
    const delta = Number(deltaStr);
    if (!Number.isFinite(delta) || delta === 0) return alert("Invalid delta.");

    const reason = window.prompt("Reason (stored in ledger mg_reason):", "admin_topup") || "admin_topup";

    try {
      await addCreditsWithLedger({
        customersTable,
        ledgerTable,
        passId: c.mg_pass_id,
        delta,
        reason,
        source: "admin",
        adminEmail,
      });
      alert("Top-up done ✅");
      onRefresh();
      onLedgerRefresh();
    } catch (e: any) {
      alert(e?.message ?? "Top-up failed");
      onRefresh();
      onLedgerRefresh();
    }
  };

  return (
    <>
      <div className="admin-inline" style={{ marginTop: 10 }}>
        <button className="admin-button" type="button" onClick={saveAll} disabled={!anyDirty || saving}>
          {saving ? "Saving..." : "Save edits"}
        </button>
        {anyDirty && <span className="admin-muted">Unsaved changes.</span>}
      </div>

      <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
        {local.map((c, idx) => (
          <div key={c.mg_pass_id} style={{ border: "1px solid #eee", borderRadius: 12, padding: 12, background: "white" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
              <div style={{ display: "grid", gap: 4 }}>
                <div style={{ fontWeight: 900 }}>
                  {c.mg_email || <span className="admin-muted">(no email)</span>}
                </div>
                <div className="admin-muted" style={{ fontSize: 12 }}>
                  pass: {truncateId(c.mg_pass_id, 40)}
                  {c.mg_user_id ? ` • user: ${truncateId(c.mg_user_id, 26)}` : ""}
                  {c.mg_shopify_customer_id ? ` • shopify: ${truncateId(c.mg_shopify_customer_id, 26)}` : ""}
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 6 }}>
                  {c.mg_verified_email && <Chip>verified_email</Chip>}
                  {c.mg_verified_google && <Chip>verified_google</Chip>}
                  {c.mg_verified_apple && <Chip>verified_apple</Chip>}
                  {c.mg_disabled && <Chip>disabled</Chip>}
                </div>
              </div>

              <div className="admin-inline" style={{ alignItems: "center", flexWrap: "wrap" }}>
                <button className="admin-button ghost" type="button" onClick={() => void doTopup(c)} disabled={!ledgerTable}>
                  Top up
                </button>

                <label style={{ display: "inline-flex", gap: 8, alignItems: "center", fontSize: 12, fontWeight: 900 }}>
                  Disabled
                  <input
                    type="checkbox"
                    checked={c.mg_disabled}
                    onChange={(e) => updateRow(idx, { ...c, mg_disabled: e.target.checked })}
                  />
                </label>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginTop: 12 }}>
              <label style={{ display: "grid", gap: 6 }}>
                <strong>Credits</strong>
                <input
                  type="number"
                  value={c.mg_credits}
                  onChange={(e) => updateRow(idx, { ...c, mg_credits: Number(e.target.value) || 0 })}
                />
              </label>

              <label style={{ display: "grid", gap: 6 }}>
                <strong>Expires</strong>
                <input
                  type="date"
                  value={(c.mg_expires_at || "").slice(0, 10)}
                  onChange={(e) => updateRow(idx, { ...c, mg_expires_at: e.target.value || null })}
                />
              </label>

              <label style={{ display: "grid", gap: 6 }}>
                <strong>Last active</strong>
                <input value={(c.mg_last_active || "").slice(0, 19)} readOnly />
              </label>
            </div>

            <details style={{ marginTop: 10 }}>
              <summary style={{ cursor: "pointer", fontWeight: 900 }}>View more (raw JSON)</summary>
              <pre style={{ whiteSpace: "pre-wrap", marginTop: 10 }}>{safeJson(c.raw)}</pre>
            </details>
          </div>
        ))}
      </div>
    </>
  );
}

/* ---------------------------------------------
   Provider secrets setter (optional)
---------------------------------------------- */

function maskSecret(secret: string) {
  const s = String(secret ?? "");
  if (!s) return "";
  if (s.length <= 8) return "••••";
  return `${s.slice(0, 3)}••••••${s.slice(-4)}`;
}

function ProviderSecretSetter({
  secretsTable,
  onWrote,
  adminEmail,
}: {
  secretsTable: string;
  onWrote: () => void;
  adminEmail: string | null;
}) {
  const [provider, setProvider] = useState("");
  const [secret, setSecret] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const p = provider.trim();
    const s = secret.trim();
    if (!p) return alert("Missing provider");
    if (s.length < 6) return alert("Secret too short");

    setSaving(true);
    try {
      const masked = maskSecret(s);
      const { error } = await supabase
        .from(secretsTable)
        .upsert(
          {
            mg_id: `${PROVIDER_SECRET_RECORD_TYPE}:${p}`,
            mg_record_type: PROVIDER_SECRET_RECORD_TYPE,
            mg_key: p,
            mg_value: { secret: s, masked },
            mg_meta: { updated_by: adminEmail ?? null },
            mg_updated_at: new Date().toISOString(),
          } as any,
          { onConflict: "mg_id" }
        );

      if (error) throw new Error(error.message);

      alert("Secret stored ✅");
      setSecret("");
      onWrote();
    } catch (e: any) {
      alert(e?.message ?? "Failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ display: "grid", gap: 10, marginTop: 8 }}>
      <div className="admin-muted">
        This writes to <strong>{secretsTable}</strong>. Only admins should have RLS permission for this table.
      </div>

      <div className="admin-inline" style={{ flexWrap: "wrap" }}>
        <label style={{ display: "grid", gap: 6, minWidth: 260 }}>
          <strong>Provider</strong>
          <input value={provider} onChange={(e) => setProvider(e.target.value)} placeholder="openai / replicate / seedream..." />
        </label>

        <label style={{ display: "grid", gap: 6, minWidth: 360 }}>
          <strong>Secret</strong>
          <input value={secret} onChange={(e) => setSecret(e.target.value)} placeholder="paste key..." />
        </label>

        <button className="admin-button" type="button" onClick={() => void save()} disabled={saving}>
          {saving ? "Saving..." : "Store secret"}
        </button>
      </div>
    </div>
  );
}
