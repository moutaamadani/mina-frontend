Below is the single, unified document for adopting MEGA end-to-end (backend + frontend) with ZERO “dual id” logic in the frontend.

MEGA Architecture + Frontend Adoption (Single Pass ID Only)
Goal

Adopt a single, canonical identity everywhere:

Frontend uses exactly ONE identifier: mg_pass_id (Pass ID).

Backend stores exactly ONE Pass ID per customer in MEGA_CUSTOMERS.

No merging, no fallback IDs, no “auth UID overrides customerId”, no “legacyCustomerIdRef”, no dual history fetches.

Everything is anchored on Pass ID. Other identifiers (Supabase user_id, Shopify customer id, email) are attributes, not identities.

Core principles

Pass ID is the only identity that flows through the app.

Auth does not change identity; auth only links to the same Pass ID.

Shopify does not change identity; Shopify only links to the same Pass ID.

The frontend never “figures out” identity by itself. It always asks the backend to ensure Pass ID.

Part A — Backend data model (MEGA tables)

You already have the right 3-table concept. The key requirement for “no dual anything” is that every record in MEGA_GENERATIONS uses the same mg_pass_id for that user across anon → logged in → shopify.

Table 1: MEGA_CUSTOMERS

Primary key: mg_pass_id (TEXT)

Verification flags (keep these)

mg_verified_email

mg_verified_google

mg_verified_apple

mg_verified_any

mg_verification_method

mg_verification_at

mg_verification_keynumber

Identity link fields (NOT identities)

mg_user_id (Supabase auth user id)

mg_shopify_customer_id

mg_email

Credits are “state”

mg_credits

mg_expires_at

Table 2: MEGA_GENERATIONS (ledger)

Everything goes here:

sessions

generations

feedback

credit transactions

The frontend doesn’t need separate legacy tables or merges anymore.

Table 3: MEGA_ADMIN

Admin events/config/profile mappings.

Recommended SQL shape (idempotent)

Use this as the reference for your supabase/mega_tables.sql (key parts only; adjust as needed).

-- ============================================================================
-- MEGA TABLES (idempotent)
-- ============================================================================

create extension if not exists "uuid-ossp";

-- ----------------------------------------------------------------------------
-- Updated-at trigger
-- ----------------------------------------------------------------------------
create or replace function public.mega_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.mg_updated_at = now();
  return new;
end;
$$;

-- ----------------------------------------------------------------------------
-- MEGA_CUSTOMERS
-- ----------------------------------------------------------------------------
create table if not exists public.mega_customers (
  mg_pass_id text primary key,

  mg_shopify_customer_id text,
  mg_user_id uuid,
  mg_email text,
  mg_first_name text,
  mg_last_name text,
  mg_display_name text,
  mg_locale text,
  mg_timezone text,

  mg_marketing_opt_in boolean not null default false,
  mg_product_updates_opt_in boolean not null default false,

  mg_credits int not null default 0,
  mg_expires_at timestamptz,
  mg_last_active timestamptz,

  mg_disabled boolean not null default false,

  -- verification flags
  mg_verified_email boolean not null default false,
  mg_verified_google boolean not null default false,
  mg_verified_apple boolean not null default false,
  mg_verified_any boolean generated always as (
    coalesce(mg_verified_email,false)
    or coalesce(mg_verified_google,false)
    or coalesce(mg_verified_apple,false)
  ) stored,
  mg_verification_method text,
  mg_verification_at timestamptz,
  mg_verification_keynumber text,

  -- billing defaults
  mg_topup_default_packs int not null default 3,
  mg_auto_topup_enabled boolean not null default false,
  mg_auto_topup_monthly_limit_packs int,
  mg_last_topup_at timestamptz,
  mg_topup_source text,

  mg_meta jsonb not null default '{}'::jsonb,
  mg_source_system text,

  mg_deleted_at timestamptz,
  mg_created_at timestamptz not null default now(),
  mg_updated_at timestamptz not null default now()
);

drop trigger if exists tr_mega_customers_updated_at on public.mega_customers;
create trigger tr_mega_customers_updated_at
before update on public.mega_customers
for each row execute function public.mega_set_updated_at();

-- Uniqueness (optional but recommended)
create unique index if not exists mega_customers_user_id_uq
on public.mega_customers(mg_user_id)
where mg_user_id is not null and mg_deleted_at is null;

create unique index if not exists mega_customers_shopify_id_uq
on public.mega_customers(mg_shopify_customer_id)
where mg_shopify_customer_id is not null and mg_deleted_at is null;

create index if not exists mega_customers_email_idx
on public.mega_customers((lower(mg_email)))
where mg_email is not null and mg_deleted_at is null;

create index if not exists mega_customers_last_active_idx
on public.mega_customers(mg_last_active);

-- ----------------------------------------------------------------------------
-- MEGA_GENERATIONS (ledger)
-- ----------------------------------------------------------------------------
create table if not exists public.mega_generations (
  mg_id text primary key,
  mg_record_type text not null check (mg_record_type in (
    'generation','session','feedback','credit_transaction'
  )),

  mg_pass_id text not null references public.mega_customers(mg_pass_id),

  mg_session_id text,
  mg_generation_id text,

  mg_platform text,
  mg_title text,

  mg_type text,
  mg_prompt text,
  mg_output_url text,
  mg_output_key text,

  mg_provider text,
  mg_model text,
  mg_latency_ms int,
  mg_input_chars int,
  mg_output_chars int,
  mg_input_tokens int,
  mg_output_tokens int,

  mg_content_type text,
  mg_status text,
  mg_error text,

  -- feedback
  mg_result_type text,
  mg_comment text,
  mg_image_url text,
  mg_video_url text,

  -- credits txn
  mg_delta int,
  mg_reason text,
  mg_source text,
  mg_ref_type text,
  mg_ref_id text,

  -- client
  mg_client_version text,
  mg_os text,
  mg_browser text,
  mg_device text,

  mg_meta jsonb not null default '{}'::jsonb,
  mg_source_system text,
  mg_deleted_at timestamptz,
  mg_created_at timestamptz not null default now(),
  mg_updated_at timestamptz not null default now()
);

drop trigger if exists tr_mega_generations_updated_at on public.mega_generations;
create trigger tr_mega_generations_updated_at
before update on public.mega_generations
for each row execute function public.mega_set_updated_at();

create index if not exists mega_generations_pass_id_idx
on public.mega_generations(mg_pass_id)
where mg_deleted_at is null;

create index if not exists mega_generations_type_created_idx
on public.mega_generations(mg_record_type, mg_created_at desc)
where mg_deleted_at is null;

create index if not exists mega_generations_session_idx
on public.mega_generations(mg_session_id)
where mg_session_id is not null and mg_deleted_at is null;

-- ----------------------------------------------------------------------------
-- MEGA_ADMIN
-- ----------------------------------------------------------------------------
create table if not exists public.mega_admin (
  mg_id text primary key,
  mg_record_type text not null check (mg_record_type in (
    'admin_session','admin_audit','profile','runtime_config','app_config'
  )),

  mg_actor_pass_id text references public.mega_customers(mg_pass_id),
  mg_session_hash text,

  mg_user_id uuid,
  mg_email text,

  mg_ip text,
  mg_user_agent text,

  mg_first_seen_at timestamptz,
  mg_last_seen_at timestamptz,

  mg_profile_id uuid,
  mg_shopify_customer_id text,

  mg_action text,
  mg_route text,
  mg_method text,
  mg_status int,
  mg_detail jsonb,

  mg_runtime_id int,
  mg_runtime_flat jsonb,

  mg_key text,
  mg_value jsonb,

  mg_meta jsonb not null default '{}'::jsonb,
  mg_source_system text,
  mg_deleted_at timestamptz,
  mg_created_at timestamptz not null default now(),
  mg_updated_at timestamptz not null default now()
);

drop trigger if exists tr_mega_admin_updated_at on public.mega_admin;
create trigger tr_mega_admin_updated_at
before update on public.mega_admin
for each row execute function public.mega_set_updated_at();

create index if not exists mega_admin_record_type_idx
on public.mega_admin(mg_record_type, mg_created_at desc)
where mg_deleted_at is null;

Part B — Backend API contract needed for “NO DUAL anything”
1) /me is mandatory

The frontend must never invent identity. It must call /me and get the canonical Pass ID.

Request behavior

If user is anonymous:

backend creates (or resumes) a Pass ID

If user is logged in (JWT present):

backend links the same Pass ID to mg_user_id and sets verification flags

Recommended request (simple)

GET /me

uses Authorization header (Supabase JWT) if present

also accepts X-Mina-Pass-Id if present (anon continuity)

Response
{
  "ok": true,
  "passId": "pass_01J...ULID...",
  "email": "user@email.com",
  "credits": { "balance": 12, "expiresAt": "2026-01-10T00:00:00Z" }
}


Critical: when a user logs in, backend should NOT create a new passId.
It should attach mg_user_id to the existing pass row (or merge server-side).

2) Every other endpoint must accept/pass through Pass ID

Either:

backend derives passId via /me cookie/session mapping, or

frontend sends it consistently via header X-Mina-Pass-Id, or

include passId in body

Pick ONE approach and use it everywhere.
(Recommended: header + JWT)

Part C — Frontend adoption (NO dual, no legacy, no merge)
Single identity in the frontend
Storage

Replace minaCustomerId with minaPassId

Never store Shopify customer id as the app identity.

Never store Supabase user id as the app identity.

State

Your app should have:

passId: string | null

authUserId: string | null (display only; also used for JWT)

currentUserEmail: string | null

And nothing else identity-wise.

Part D — Exactly what to rewire in your code

You asked for “fully MEGA like the backend” and “no dual anything”.
So here’s the precise patch plan using your existing PART markers.

1) src/MinaApp.tsx
✅ Replace identity layer (PART 1)

Replace the whole block starting at:

const LIKE_STORAGE_KEY = "minaLikedMap";
const LEGACY_CUSTOMER_STORAGE_KEY = "minaLegacyCustomerId";
function readLegacyCustomerId...
function persistLegacyCustomerId...


With:

const PASS_ID_STORAGE_KEY = "minaPassId";
const LIKE_STORAGE_PREFIX = "minaLikedMap";

function readStoredPassId(): string | null {
  try {
    const v = window.localStorage.getItem(PASS_ID_STORAGE_KEY);
    return v && v.trim() ? v.trim() : null;
  } catch {
    return null;
  }
}

function persistPassId(passId: string) {
  try {
    window.localStorage.setItem(PASS_ID_STORAGE_KEY, passId);
  } catch {
    // ignore
  }
}

function likedStorageKey(passId: string | null) {
  return `${LIKE_STORAGE_PREFIX}:${passId || "unknown"}`;
}

✅ Remove getInitialCustomerId + customerId persistence (PART 3)

Delete:

getInitialCustomerId()

persistCustomerId()

any reliance on "minaCustomerId"

Replace with:

function getInitialPassId(): string | null {
  return readStoredPassId();
}

✅ Replace customer state with Pass ID (PART 4)

Find:

const [customerId, setCustomerId] = useState<string>(() => getInitialCustomerId(initialCustomerId));
const [customerIdInput, setCustomerIdInput] = useState<string>(customerId);
const legacyCustomerIdRef = useRef<string>(customerId);


Replace with:

const [passId, setPassId] = useState<string | null>(() => getInitialPassId());


Delete the entire legacy ref logic and anything that references:

customerIdInput

legacyCustomerIdRef

readLegacyCustomerId

persistLegacyCustomerId

handleChangeCustomer

Important: remove the “manual customer change” concept. In MEGA, identity is never user-editable.

✅ Likes map must be keyed by passId (PART 4)

Replace:

const [likedMap, setLikedMap] = useState<Record<string, boolean>>(() => {
  const raw = localStorage.getItem(LIKE_STORAGE_KEY);
  ...
});


With:

const [likedMap, setLikedMap] = useState<Record<string, boolean>>({});

useEffect(() => {
  if (!passId) return;
  try {
    const raw = window.localStorage.getItem(likedStorageKey(passId));
    setLikedMap(raw ? (JSON.parse(raw) as Record<string, boolean>) : {});
  } catch {
    setLikedMap({});
  }
}, [passId]);

useEffect(() => {
  if (!passId) return;
  try {
    window.localStorage.setItem(likedStorageKey(passId), JSON.stringify(likedMap));
  } catch {
    // ignore
  }
}, [passId, likedMap]);


Then delete the old LIKE_STORAGE_KEY persistence effect.

✅ API auth bridge must attach Pass ID (PART 7)

Update apiFetch so it always sends the passId (if available):

const apiFetch = async (path: string, init: RequestInit = {}) => {
  const headers = new Headers(init.headers || {});
  const token = await getSupabaseAccessToken();

  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  // ✅ attach Pass ID
  if (passId && !headers.has("X-Mina-Pass-Id")) {
    headers.set("X-Mina-Pass-Id", passId);
  }

  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  return fetch(`${API_BASE_URL}${path}`, { ...init, headers });
};

✅ Add Pass bootstrap: call /me (PART 6 or PART 7)

Add:

const ensurePass = async () => {
  try {
    const res = await apiFetch("/me");
    if (!res.ok) return;

    const json = await res.json().catch(() => ({} as any));
    const next = typeof json.passId === "string" ? json.passId : null;
    if (next && next !== passId) {
      setPassId(next);
      persistPassId(next);
    }

    // optional: hydrate credits
    if (json?.credits?.balance !== undefined) {
      setCredits((prev) => ({
        balance: Number(json.credits.balance),
        meta: { ...prev?.meta, expiresAt: json?.credits?.expiresAt ?? prev?.meta?.expiresAt ?? null,
          imageCost: prev?.meta?.imageCost ?? adminConfig.pricing?.imageCost ?? 1,
          motionCost: prev?.meta?.motionCost ?? adminConfig.pricing?.motionCost ?? 5,
        },
      }));
    }
  } catch {
    // silent
  }
};


Then call it:

once on mount

and again on auth changes

Inside your auth effect, after session changes:

void ensurePass();


Key: login must not set a new identity in the frontend. Only /me decides passId.

✅ Remove “effectiveCustomerId” (PART 5)

Delete:

const effectiveCustomerId = authUserId || customerId;


Replace all usages with passId (and guard if null).

✅ Credits / History / Sessions must not take “customerId”
Credits

Replace /credits/balance?customerId=... with:

GET /credits/balance (passId via header)

Sessions

Replace payload:

{ customerId: effectiveCustomerId, ... }


with:

{ passId, ... }


(or rely on header only)

History

Replace:

/history/customer/${cid}


with:

GET /history (passId via header), or

GET /history/pass/${passId}

And delete the entire legacy merge logic.
MEGA already unified the ledger; frontend must fetch once.

✅ R2 helpers must use Pass ID only

Replace:

customerId: effectiveCustomerId,


with:

passId,


(or rely on header)

In:

/api/r2/upload-signed

/api/r2/store-remote-signed

✅ Generation / motion / feedback payloads

Replace every { customerId: ... } with { passId: passId! } (or header-only).

Places:

/editorial/generate

/motion/suggest

/motion/generate

/feedback/like

2) AuthGate.tsx

This is where dual identity is currently created (Shopify id → localStorage “minaCustomerId”).

✅ Delete all writes to minaCustomerId

Remove:

window.localStorage.setItem("minaCustomerId", shopifyCustomerId);

✅ Store only Pass ID

AuthGate should call /me (same endpoint) and store minaPassId.

Add a helper:

async function ensurePassId(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token || null;

    const headers: Record<string, string> = {};
    if (token) headers.Authorization = `Bearer ${token}`;

    const existing = (() => {
      try { return window.localStorage.getItem("minaPassId") || ""; } catch { return ""; }
    })();
    if (existing) headers["X-Mina-Pass-Id"] = existing;

    const res = await fetch(`${API_BASE_URL}/me`, { headers });
    if (!res.ok) return null;

    const json = await res.json().catch(() => ({} as any));
    const passId = typeof json.passId === "string" ? json.passId : null;
    if (passId) {
      try { window.localStorage.setItem("minaPassId", passId); } catch {}
    }
    return passId;
  } catch {
    return null;
  }
}


Call it:

on mount

after SIGNED_IN

after SIGNED_OUT (optional: keep anon pass or reset; MEGA typically keeps it)

Important: this ensures the same Pass ID persists across anon → login.

✅ Shopify sync becomes “link attribute” not identity

If you still want the lead capture:

keep calling /auth/shopify-sync

but that endpoint should accept passId and write to MEGA_CUSTOMERS.mg_shopify_customer_id

it should not return “the identity”

Part E — What “NO DUAL anything” means operationally

If you remove all legacy merge logic from the frontend, your backend must guarantee that existing history is visible under the same Pass ID.

That means one of these must be true:

You migrate historical rows so MEGA_GENERATIONS.mg_pass_id matches the user’s canonical passId.

or

Your backend /me merges on login:

if a user has an anon pass with generations

and also has an older user/shopify-based customer row

backend merges them into one passId and rewrites ledger pass_id (server-side)

Frontend must not do it.

Part F — Final “MEGA front” invariants (sanity checks)

After the rewiring:

✅ Frontend has only

passId (MEGA identity)

authUserId (display/JWT only)

currentUserEmail (display only)

✅ Frontend never:

sets identity to supabase.user.id

sets identity to shopifyCustomerId

merges history from two IDs

keeps “legacyCustomerIdRef”

stores minaCustomerId

✅ Backend always:

returns passId from /me

uses passId to read/write MEGA tables

links auth/shopify/email into MEGA_CUSTOMERS fields without changing passId

If you want, I can now give you the exact patch blocks (copy/paste replacements) for:

MinaApp.tsx PART 1, PART 4, PART 5, PART 6, PART 7 (identity + /me + API payload rewires)

AuthGate.tsx (remove minaCustomerId, replace with minaPassId + /me)
