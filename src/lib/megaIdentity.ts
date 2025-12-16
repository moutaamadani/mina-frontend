// src/lib/megaIdentity.ts
import { supabase } from "./supabaseClient";

const PASS_ID_STORAGE_KEY = "minaPassId";

/** Crockford Base32 for ULID-like ids */
const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

function encodeTime(ms: number, len = 10) {
  let out = "";
  let v = ms;
  for (let i = 0; i < len; i++) {
    out = CROCKFORD[v % 32] + out;
    v = Math.floor(v / 32);
  }
  return out;
}

function encodeRandom(len = 16) {
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    out += CROCKFORD[bytes[i] % 32];
  }
  return out;
}

export function generatePassId() {
  // Stable, sortable-ish id without deps
  return `pass_${encodeTime(Date.now())}${encodeRandom(16)}`;
}

export function readStoredPassId(): string | null {
  try {
    const v = window.localStorage.getItem(PASS_ID_STORAGE_KEY);
    const s = (v || "").trim();
    return s ? s : null;
  } catch {
    return null;
  }
}

export function persistPassId(passId: string) {
  try {
    window.localStorage.setItem(PASS_ID_STORAGE_KEY, passId);
  } catch {
    // ignore
  }
}

export function clearStoredPassId() {
  try {
    window.localStorage.removeItem(PASS_ID_STORAGE_KEY);
  } catch {
    // ignore
  }
}

export type MegaCustomerRow = {
  mg_pass_id: string;
  mg_user_id: string | null;
  mg_email: string | null;
  mg_shopify_customer_id: string | null;
  mg_credits: number;
  mg_expires_at: string | null;
  mg_last_active: string | null;
  mg_disabled: boolean;
  mg_verified_email?: boolean;
  mg_verified_google?: boolean;
  mg_verified_apple?: boolean;
  [k: string]: any;
};

export type EnsurePassResult = {
  passId: string;
  customer: MegaCustomerRow | null;
  userId: string | null;
  email: string | null;
  source: "existing_by_user" | "linked_local" | "created_new" | "anon_local";
};

async function resolveFirstWorkingTable(candidates: string[]) {
  for (const t of candidates) {
    const probe = await supabase.from(t).select("*").limit(1);
    if (!probe.error) return t;
  }
  return null;
}

export async function resolveMegaTables() {
  const customersTable =
    (await resolveFirstWorkingTable(["mega_customers", "MEGA_CUSTOMERS"])) || "mega_customers";
  const ledgerTable =
    (await resolveFirstWorkingTable(["mega_generations", "MEGA_GENERATIONS"])) || "mega_generations";
  return { customersTable, ledgerTable };
}

function isLegacyBadPassId(passId: string) {
  return /^pass:(user|shopify):/i.test(passId);
}

async function getCustomerByUserId(customersTable: string, userId: string) {
  const { data, error } = await supabase
    .from(customersTable)
    .select("*")
    .eq("mg_user_id", userId)
    .is("mg_deleted_at", null)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return (data as MegaCustomerRow) || null;
}

export async function getCustomerByPassId(customersTable: string, passId: string) {
  const { data, error } = await supabase
    .from(customersTable)
    .select("*")
    .eq("mg_pass_id", passId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return (data as MegaCustomerRow) || null;
}

async function upsertCustomer(customersTable: string, row: Partial<MegaCustomerRow> & { mg_pass_id: string }) {
  const patch: any = {
    ...row,
    mg_updated_at: new Date().toISOString(),
  };

  // keep created_at if schema expects it
  if (patch.mg_created_at == null) patch.mg_created_at = new Date().toISOString();
  if (patch.mg_last_active == null) patch.mg_last_active = new Date().toISOString();

  const { error } = await supabase.from(customersTable).upsert(patch, { onConflict: "mg_pass_id" });
  if (error) throw new Error(error.message);
}

export async function ensurePassId(opts?: { createAnonRow?: boolean }) : Promise<EnsurePassResult> {
  const { customersTable } = await resolveMegaTables();

  const stored = readStoredPassId();
  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData.session?.user?.id ?? null;
  const email = (sessionData.session?.user?.email ?? "").toLowerCase() || null;

  // ---------------------------
  // Logged in: prefer existing row by mg_user_id
  // ---------------------------
  if (userId) {
    const existing = await getCustomerByUserId(customersTable, userId);
    if (existing?.mg_pass_id) {
      // Persist the canonical pass id
      persistPassId(existing.mg_pass_id);

      // Touch the row (best effort)
      try {
        await upsertCustomer(customersTable, {
          mg_pass_id: existing.mg_pass_id,
          mg_user_id: userId,
          mg_email: email ?? existing.mg_email ?? null,
          mg_last_active: new Date().toISOString(),
        });
      } catch {
        // ignore if RLS blocks update
      }

      return {
        passId: existing.mg_pass_id,
        customer: existing,
        userId,
        email,
        source: "existing_by_user",
      };
    }

    // No row by userId. Try to "claim" stored anon passId if present.
    if (stored) {
      const localRow = await getCustomerByPassId(customersTable, stored).catch(() => null);
      if (localRow) {
        // Link local pass row to this user
        await upsertCustomer(customersTable, {
          mg_pass_id: stored,
          mg_user_id: userId,
          mg_email: email ?? localRow.mg_email ?? null,
          mg_last_active: new Date().toISOString(),
        });
        const updated = await getCustomerByPassId(customersTable, stored);
        persistPassId(stored);
        return { passId: stored, customer: updated, userId, email, source: "linked_local" };
      }
    }

    // Create a brand new pass id row for this user
    const passId = generatePassId();
    await upsertCustomer(customersTable, {
      mg_pass_id: passId,
      mg_user_id: userId,
      mg_email: email,
      mg_credits: 0,
      mg_disabled: false,
      mg_last_active: new Date().toISOString(),
    });
    const created = await getCustomerByPassId(customersTable, passId);
    persistPassId(passId);
    return { passId, customer: created, userId, email, source: "created_new" };
  }

  // ---------------------------
  // Anonymous: use local storage only
  // ---------------------------
  const passId = stored || generatePassId();
  persistPassId(passId);

  if (opts?.createAnonRow) {
    // Best-effort insert/update (may be blocked by RLS)
    try {
      await upsertCustomer(customersTable, {
        mg_pass_id: passId,
        mg_user_id: null,
        mg_email: null,
        mg_credits: 0,
        mg_disabled: false,
        mg_last_active: new Date().toISOString(),
      });
    } catch {
      // ignore if RLS blocks anon inserts
    }
  }

  const maybe = await getCustomerByPassId(customersTable, passId).catch(() => null);
  return { passId, customer: maybe, userId: null, email: null, source: "anon_local" };
}

/**
 * Optional: fix bad legacy pass ids like "pass:user:xxx" by migrating ledger + customer
 * Only works if your RLS allows updates.
 */
export async function migrateLegacyPassIdIfNeeded() {
  const { customersTable, ledgerTable } = await resolveMegaTables();
  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData.session?.user?.id ?? null;
  const email = (sessionData.session?.user?.email ?? "").toLowerCase() || null;
  if (!userId) throw new Error("Must be logged in.");

  const existing = await getCustomerByUserId(customersTable, userId);
  if (!existing?.mg_pass_id) throw new Error("No customer row found for this user.");
  if (!isLegacyBadPassId(existing.mg_pass_id)) return { changed: false, passId: existing.mg_pass_id };

  const oldPass = existing.mg_pass_id;
  const newPass = generatePassId();

  // 1) Create new customer row copying key fields
  await upsertCustomer(customersTable, {
    ...existing,
    mg_pass_id: newPass,
    mg_user_id: userId,
    mg_email: email ?? existing.mg_email ?? null,
    mg_last_active: new Date().toISOString(),
  });

  // 2) Move ledger rows to new pass id
  const { error: ledErr } = await supabase
    .from(ledgerTable)
    .update({ mg_pass_id: newPass, mg_updated_at: new Date().toISOString() } as any)
    .eq("mg_pass_id", oldPass);

  if (ledErr) throw new Error(`Customer migrated, but ledger update failed: ${ledErr.message}`);

  // 3) Soft delete old customer row if schema supports it; else disable it
  const { error: delErr } = await supabase
    .from(customersTable)
    .update({ mg_deleted_at: new Date().toISOString(), mg_updated_at: new Date().toISOString() } as any)
    .eq("mg_pass_id", oldPass);

  if (delErr) {
    // fallback: just disable it
    await supabase.from(customersTable).update({ mg_disabled: true } as any).eq("mg_pass_id", oldPass);
  }

  persistPassId(newPass);
  return { changed: true, passId: newPass, oldPass };
}
