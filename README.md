# mina-frontend
# Mina — Editorial AI Studio

Mina is Falta Studio’s “creative brain” for generating **editorial stills** and **motion** from product + style references.  
It consists of:

- **Frontend**: Vite + React + TypeScript (with **Supabase Auth**)
- **Backend API**: Node.js (ESM) + Express (deployed on Render)
- **AI Providers**: OpenAI (prompt + style profile), Replicate (SeaDream + Kling)
- **Storage**: Cloudflare R2 (uploads + optional re-hosting of generated outputs)
- **Credits**: wallet + ledger, top-ups via Shopify webhook

---

## Key features

- **Editorial stills**: `POST /editorial/generate` (Replicate SeaDream)
- **Motion suggestion**: `POST /motion/suggest` (OpenAI)
- **Motion generation**: `POST /motion/generate` (Replicate Kling)
- **Mina Vision Intelligence**:
  - user feedback/likes: `POST /feedback/like`
  - lightweight style profile reused on later generations
- **Credits system**:
  - `GET /credits/balance`
  - `POST /credits/add`
  - Shopify order webhook: `POST /api/credits/shopify-order?secret=...`
- **R2 media storage** (private bucket + signed URLs):
  - upload UI files (product / logo / inspiration): `POST /api/r2/upload-signed`
  - store remote outputs into R2: `POST /api/r2/store-remote-signed`

### Admin access (frontend)

- Admin UI/actions are shown **only** when `mega_customers.mg_admin_allowlist === true` for the current user.
- No other heuristics are used (credits thresholds, roles, email allowlists, or legacy admin tables).
- If the user is missing or the lookup fails, admin resolves to `false` without throwing.

---

## Architecture

### High-level diagram (text)

```
+---------------------------+
|  User Browser (Mina UI)   |
|  Vite + React + Supabase  |
+------------+--------------+
             |
             | HTTPS (REST/JSON)
             v
+------------+-----------------------------------+
|           Mina API (Express on Render)         |
| /editorial /motion /credits /feedback /r2 ...  |
+------+-------------------+---------------------+
       |                   |
       | OpenAI            | Replicate
       | (prompting)       | (SeaDream + Kling)
       v                   v
   +---+----+          +---+----+
   | OpenAI |          | Replicate|
   +--------+          +---------+
       |
       v
+------+-------------------+
| Postgres (Prisma, optional) |
| users, wallets, ledger, ... |
+------+-------------------+
       |
       v
+------+-------------------+
| Cloudflare R2 (S3 API)   |
| uploads + stored outputs |
+--------------------------+

Shopify (credits packs) -> webhook -> Mina API -> credits ledger
```

### Current state vs roadmap

- **Current implementation** includes: still/motion generation, credits, likes, R2 uploads, Supabase-gated UI.
- **Roadmap (production hardening)** includes: full DB persistence for all maps (sessions, generations, feedback), richer admin dashboard, auto top-up strategy, and more robust user model (see “Roadmap” below).

---

## Repo layout (typical)

> Adjust folder names to match your repo.

```
backend/
  package.json
  server.js
  r2.js
  schema.prisma
frontend/
  src/
    MinaApp.tsx
    AuthGate.tsx
    StudioLeft.tsx
    StudioRight.tsx
  vite.config.ts
```

---

## Local development

### Backend

```bash
cd backend
npm install
npm start
```

If you use Postgres:

```bash
npm run db:push
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

---

## Environment variables

### Frontend (`frontend/.env`)

> **Never commit** real values. Use `.env.example` with placeholders.

```bash
# Mina API
VITE_MINA_API_BASE_URL=https://mina-editorial-ai-api.onrender.com
VITE_BACKEND_URL=

# Optional: where “Buy credits” points (falls back to an internal default URL)
VITE_MINA_TOPUP_URL=https://faltastudio.com/products/mina-50-matcha

# Supabase (Auth)
VITE_SUPABASE_URL=YOUR_SUPABASE_URL
VITE_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY

# Optional / future admin UI usage
VITE_MINA_ADMIN_KEY=YOUR_ADMIN_DASHBOARD_KEY

# Optional / legacy toggles (only if your UI code uses them)
VITE_MINA_USE_DEV_CUSTOMER=0
```

### Backend (`backend/.env`)

```bash
# Server
PORT=3000

# Database (optional but recommended)
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/DB?schema=public

# AI providers
OPENAI_API_KEY=YOUR_OPENAI_KEY
REPLICATE_API_TOKEN=YOUR_REPLICATE_TOKEN

# Replicate model versions (optional overrides)
SEADREAM_MODEL_VERSION=bytedance/seedream-4
KLING_MODEL_VERSION=kwaivgi/kling-v2.1

# Credits
DEFAULT_FREE_CREDITS=50
IMAGE_CREDITS_COST=1
MOTION_CREDITS_COST=5

# Admin
ADMIN_SECRET=YOUR_ADMIN_SECRET              # header: x-admin-secret
ADMIN_DASHBOARD_KEY=YOUR_ADMIN_DASHBOARD_KEY # query key for admin overview

# Shopify webhook for paid orders -> credit topups
SHOPIFY_ORDER_WEBHOOK_SECRET=YOUR_WEBHOOK_SECRET

# Credit SKU mapping (JSON)
CREDIT_PRODUCT_MAP={"MINA-50":50}

# Cloudflare R2 (S3-compatible)
R2_ACCOUNT_ID=YOUR_R2_ACCOUNT_ID
R2_ACCESS_KEY_ID=YOUR_R2_ACCESS_KEY_ID
R2_SECRET_ACCESS_KEY=YOUR_R2_SECRET_ACCESS_KEY
R2_BUCKET=YOUR_R2_BUCKET
R2_ENDPOINT=https://<accountid>.r2.cloudflarestorage.com  # optional override
R2_PUBLIC_BASE_URL=                                      # optional: if you expose a public base URL
```

### Shopify Admin / Flow (optional)

If you later add Shopify Admin API calls or Flow integrations, you may also use:

```bash
SHOPIFY_ADMIN_TOKEN=YOUR_SHOPIFY_ADMIN_TOKEN
SHOPIFY_STORE_DOMAIN=faltastudio.com
SHOPIFY_API_VERSION=YYYY-MM
SHOPIFY_FLOW_WEBHOOK_SECRET=YOUR_FLOW_WEBHOOK_SECRET
SHOPIFY_MINA_TAG=Mina_users
SHOPIFY_WELCOME_MATCHA_VARIANT_ID=YOUR_VARIANT_ID
```

---

## API overview

Base URL (local): `http://localhost:3000`

### Health
- `GET /health`
- `GET /`

### Credits
- `GET /credits/balance?customerId=...`
- `POST /credits/add` (server-side / admin usage)

### Generation
- `POST /editorial/generate`
- `POST /motion/suggest`
- `POST /motion/generate`

### Feedback (style memory)
- `POST /feedback/like`

### Sessions & history
- `POST /sessions/start`
- `GET /history/customer/:customerId`
- `GET /history/admin/overview?key=...`

### R2 storage
- `POST /api/r2/upload-signed`
- `POST /api/r2/store-remote-signed`
- `POST /store-remote-generation` (batch store)

### Admin (requires `x-admin-secret: ...`)
- `GET /admin/summary`
- `GET /admin/customers`
- `POST /admin/credits/adjust`

---

## Roadmap (from the architecture spec)

### 1) Real storage (replace in-memory maps)

Move sessions/generations/feedback/credits into Postgres tables like:

- `users` (role: user/admin/superadmin)
- `credit_wallets`, `credit_ledger`
- `sessions`, `generations`, `feedback`
- `style_profiles`
- `auto_topup_settings`
- `admin_events`

### 2) Auto top-up strategy

- Phase 1 (easy): when below threshold, notify user + send checkout link; credits added after paid webhook.
- Phase 2 (advanced): true auto-charge via Stripe/subscription or Shopify subscription approach.

### 3) Admin dashboard

- KPIs (users, generations, credits sold vs consumed)
- User search + wallet adjustments
- Generation explorer + audit logs
- Config table for pricing / model versions

---

## Security notes

- If you accidentally shared **real secrets/tokens** (OpenAI, Replicate, Shopify Admin, R2 keys, DB URL, etc.), **rotate them immediately**:
  - OpenAI: revoke/regenerate API keys in the OpenAI dashboard
  - Replicate: regenerate token in Replicate account settings
  - Cloudflare R2: rotate access keys
  - Shopify: revoke & re-create Admin tokens / webhook secrets
  - Render/Postgres: rotate DB credentials if exposed
- Keep `.env` out of git (use `.gitignore` + `.env.example`).

---

## Troubleshooting

- R2 env check: `GET /debug/r2`
- If outputs expire from provider URLs, store them in R2 via `/api/r2/store-remote-signed`.
- If admin endpoints 401, ensure `x-admin-secret` is set.
- If Prisma fails to init, the API can still run, but history/credits may be in-memory only.

---

## License

Internal Falta Studio project.
