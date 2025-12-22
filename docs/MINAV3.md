# MINAV3.me — Product + Backend Spec (Mina Studio V3 + MMA + MEGA-only)

**Timezone:** Asia/Dubai
**Storage + DB model:** MEGA-only (3 tables) + Cloudflare R2 public URLs
**AI pipeline:** MMA (Mina Mind API) orchestrates scans → prompt-building → generation → post-scan → feedback loops

# MINAV3.me — User Scenario with Routes + Parameters (MEGA-only + MMA)

## Conventions (important)

### Identity (Pass ID)

Backend resolves the user identity in this priority:

1. `body.customerId` (if present)
2. `X-Mina-Pass-Id` header
3. fallback `anonymous`

✅ **Frontend should always send**:

* `X-Mina-Pass-Id: <passId>` once known
* plus `X-Session-Id: <sessionUuid>` if you use it in the client

### Session UUID format

Use `sess_<uuid>` (the backend normalizes this).

### Matcha (credits)

* UI uses **matcha** (not matchas).
* If matcha is 0, buttons become **I need matcha** and redirect to Shopify.
* Pack quantity counts:

  * Example: `MINA-50 x 4` → **50 * 4 = 200 matcha**

### Assets rule

All stored media referenced in MEGA should end up as **permanent public URLs** (R2 public).
Frontend can upload via signed URLs.

---

## 0) Boot / Health

### 0.1 Health check

**GET** `/health`

**Response**

```json
{ "ok": true }
```

---

## 1) Login (Frontend auth) + “ensure user” in backend

Login itself is handled by the frontend (Google OAuth or email OTP).
After login success, the frontend should **bind** the user to backend identity.

### 1.1 Ensure / load profile

**GET** `/me`

**Headers**

* `X-Mina-Pass-Id: pass:user:<uuid>` OR `pass:shopify:<id>` OR `pass:anon:<uuid>`

**Response (example)**

```json
{
  "passId": "pass:user:7c0e...",
  "email": "user@mail.com",
  "credits": 12,
  "expiresAt": "2026-01-21T10:00:00.000Z",
  "lastActive": "2025-12-22T08:10:00.000Z"
}
```

✅ Backend behavior:

* Upserts `MEGA_CUSTOMERS` if missing
* Updates `mg_last_active` (last seen)

---

## 2) Start a Studio session

### 2.1 Start session

**POST** `/sessions/start`

**Headers**

* `X-Mina-Pass-Id: <passId>`

**Body**

```json
{
  "platform": "web",
  "clientVersion": "3.0.0",
  "meta": { "timezone": "Asia/Dubai" }
}
```

**Response**

```json
{
  "sessionId": "sess_2f2d0b2c-0f9d-4e8c-9a1a-6b2e7d4bbd35"
}
```

✅ Backend writes a `MEGA_GENERATIONS` record:

* `mg_record_type="session"`
* `mg_id="session:<sessionId>"`

---

## 3) Check matcha balance (gating Create/Animate)

### 3.1 Read balance

**GET** `/credits/balance`

**Headers**

* `X-Mina-Pass-Id: <passId>`

**Response**

```json
{
  "credits": 0,
  "expiresAt": "2026-01-21T10:00:00.000Z"
}
```

### 3.2 UI logic

* If `credits <= 0`:

  * Still button: **I need matcha**
  * Animate button: **I need matcha**
  * Clicking redirects user to Shopify checkout page (frontend controlled)

---

## 4) Buying matcha (Shopify)

Frontend sends user to Shopify checkout (not your API).
When order completes, Shopify calls your webhook.

### 4.1 Shopify webhook (credits increment + tag user)

**POST** `/api/credits/shopify-order`

> Uses `express.raw` + HMAC verify on backend

**Body**

* Shopify order payload (raw)

✅ Backend behavior:

* Compute credits from SKU * quantity
  Example: `MINA-50 x 4` → `+200`
* Write credit transaction row in `MEGA_GENERATIONS`
* Update `MEGA_CUSTOMERS.mg_credits`
* Set `mg_expires_at = now + 30 days` (rolling from last purchase)
* Tag Shopify customer as `Mina-users`

### 4.2 Frontend after checkout

After returning from Shopify, frontend should poll:
**GET** `/credits/balance`
until credits reflect the purchase.

---

## 5) Upload assets (3 supported ways)

You typically need permanent URLs for:

* product image
* logo
* inspiration images (0–4)
* (later) input still for animation

### Option A — Signed upload to R2 (recommended)

#### 5.A.1 Request signed upload URL

**POST** `/api/r2/upload-signed`

**Headers**

* `X-Mina-Pass-Id: <passId>`

**Body**

```json
{
  "contentType": "image/png",
  "fileName": "product.png",
  "folder": "user_uploads"
}
```

**Response**

```json
{
  "uploadUrl": "https://s3-compatible-presigned-url...",
  "publicUrl": "https://<your-r2-public-domain>/user_uploads/<key>.png",
  "key": "user_uploads/<key>.png",
  "expiresInSec": 600
}
```

Then frontend uploads file bytes via:
**PUT** `<uploadUrl>` with `Content-Type: image/png`

✅ After upload completes, use `publicUrl` as the asset URL in generation requests.

---

### Option B — Store a remote image (server pulls → R2)

#### 5.B.1 Store remote image via signed-store endpoint

**POST** `/api/r2/store-remote-signed`

**Headers**

* `X-Mina-Pass-Id: <passId>`

**Body**

```json
{
  "sourceUrl": "https://example.com/image.jpg",
  "folder": "user_uploads"
}
```

**Response**

```json
{
  "publicUrl": "https://<r2-public>/user_uploads/<key>.jpg",
  "key": "user_uploads/<key>.jpg"
}
```

---

### Option C — Store remote generation (legacy helper)

**POST** `/store-remote-generation`

**Headers**

* `X-Mina-Pass-Id: <passId>`

**Body**

```json
{
  "url": "https://example.com/image.jpg",
  "type": "image"
}
```

**Response**

```json
{ "publicUrl": "https://<r2-public>/...jpg" }
```

---

## 6) Still Image: Create (MMA → Seedream)

### 6.1 Create still generation

**POST** `/editorial/generate`

**Headers**

* `X-Mina-Pass-Id: <passId>`

**Body (example)**

```json
{
  "sessionId": "sess_2f2d0b2c-0f9d-4e8c-9a1a-6b2e7d4bbd35",

  "brief": "Luxury perfume bottle on marble, soft shadows, premium editorial look.",
  "style": "minimal", 
  "ratio": "1:1",

  "assets": {
    "productImageUrl": "https://<r2-public>/user_uploads/product.png",
    "logoUrl": "https://<r2-public>/user_uploads/logo.png",
    "inspirationUrls": [
      "https://<r2-public>/user_uploads/insp1.jpg",
      "https://<r2-public>/user_uploads/insp2.jpg"
    ]
  },

  "settings": {
    "seedream": {
      "quality": "high",
      "guidance": 7
    }
  },

  "ui": {
    "visionIntelligence": true,
    "styleNoneAllowed": true
  }
}
```

**Response (example)**

```json
{
  "generationId": "gen_still_001",
  "status": "done",
  "userMessage": "Got it — I built a clean prompt and generated your still.",
  "outputUrl": "https://<r2-public>/generations/gen_still_001.png",
  "creditsAfter": 11
}
```

✅ Backend behavior:

* Checks credits; if 0 returns an error the UI maps to “I need matcha”
* MMA runs scan steps (caption product/logo/inspo), reads history/likes, builds prompt
* Stores all steps + vars in MEGA tables
* Stores final image on R2 public URL
* Decrements **-1 matcha**

---

## 7) Still Image: Like / Download / Feedback / Tweak loop

### 7.1 Like an image

**POST** `/feedback/like`

**Headers**

* `X-Mina-Pass-Id: <passId>`

**Body**

```json
{
  "generationId": "gen_still_001",
  "value": true,
  "context": "studio_right_panel"
}
```

**Response**

```json
{ "ok": true }
```

### 7.2 Download event (recommended to track)

If you track downloads through the same route:
**POST** `/feedback/like`

**Body**

```json
{
  "generationId": "gen_still_001",
  "event": "download",
  "context": "studio_right_panel"
}
```

> If your backend currently only supports like/unlike here, keep download as a no-op or log it in `mg_meta` as an MMA event.

---

### 7.3 Tweak (still) — create a new still using feedback

There isn’t a dedicated `/editorial/tweak` route in the list, so the tweak loop is implemented by calling **the same generation route** again with a feedback payload (backend interprets it as “tweak”).

**POST** `/editorial/generate`

**Body**

```json
{
  "sessionId": "sess_...",
  "parentGenerationId": "gen_still_001",

  "brief": "Luxury perfume bottle on marble, soft shadows, premium editorial look.",
  "style": "minimal",
  "ratio": "1:1",

  "assets": {
    "productImageUrl": "https://<r2-public>/user_uploads/product.png",
    "logoUrl": "https://<r2-public>/user_uploads/logo.png"
  },

  "feedback": {
    "text": "I hate the light you added. Make lighting softer and more natural.",
    "mode": "still"
  }
}
```

**Response**

```json
{
  "generationId": "gen_still_002",
  "status": "done",
  "outputUrl": "https://<r2-public>/generations/gen_still_002.png",
  "creditsAfter": 10
}
```

✅ Backend behavior:

* Uses previous prompt + output + feedback to generate a new prompt
* Regenerates with same settings
* Charges **-1 matcha**
* Stores immutable new generation row + mma_step rows + mma_event (feedback)

---

## 8) Animation Studio: “Type for me” + Animate (MMA → Kling)

### 8.1 If user clicks Animate with no image

Frontend rule:

* If no `inputStillUrl`, disable Type-for-me
* Animate button state: **I need an image**

### 8.2 Optional: Type for me suggestion (motion prompt helper)

**POST** `/motion/suggest`

**Headers**

* `X-Mina-Pass-Id: <passId>`

**Body**

```json
{
  "inputStillUrl": "https://<r2-public>/generations/gen_still_002.png",
  "movementStyle": "cinematic_smooth",
  "userMotionBrief": "Slow push-in and subtle parallax.",
  "maxPromptComplexity": "simple_english"
}
```

**Response**

```json
{
  "motionPrompt": "Slow cinematic camera push-in. Gentle parallax. Keep lighting stable and natural."
}
```

---

### 8.3 Generate the video

**POST** `/motion/generate`

**Headers**

* `X-Mina-Pass-Id: <passId>`

**Body**

```json
{
  "sessionId": "sess_...",
  "inputStillUrl": "https://<r2-public>/generations/gen_still_002.png",

  "movementStyle": "cinematic_smooth",
  "motionPrompt": "Slow cinematic camera push-in. Gentle parallax. Keep lighting stable and natural.",

  "ratio": "1:1",
  "settings": {
    "kling": {
      "durationSec": 5,
      "fps": 24
    }
  }
}
```

**Response**

```json
{
  "generationId": "gen_video_001",
  "status": "done",
  "outputUrl": "https://<r2-public>/generations/gen_video_001.mp4",
  "creditsAfter": 9
}
```

✅ Backend behavior:

* Runs scan on the input still if needed
* Builds Kling-ready prompt (or uses Type-for-me output)
* Stores steps + vars in MEGA
* Stores final MP4 to R2 public URL
* Decrements matcha by the configured motion cost (commonly -1 or runtime-configured)

---

## 9) Video feedback (current UX rule: “Send” only)

You said: *“we are not tweaking videos”*.

So in UI:

* Instead of “Tweak”, show **Send** feedback only (no regen)

Use:
**POST** `/feedback/like`

**Body**

```json
{
  "generationId": "gen_video_001",
  "event": "feedback",
  "text": "Nice motion but too fast. Next time more subtle.",
  "context": "animation_right_panel"
}
```

(Backend stores this as an MMA event; no new generation.)

---

## 10) History / Archive / Profile screens

### 10.1 Load my generations (current user)

**GET** `/history`

**Headers**

* `X-Mina-Pass-Id: <passId>`

**Response**

```json
{
  "items": [
    {
      "generationId": "gen_still_002",
      "type": "image",
      "outputUrl": "https://...",
      "createdAt": "2025-12-22T08:20:00.000Z"
    },
    {
      "generationId": "gen_video_001",
      "type": "motion",
      "outputUrl": "https://...",
      "createdAt": "2025-12-22T08:30:00.000Z"
    }
  ],
  "nextCursor": "..."
}
```

### 10.2 Load history for a specific Pass ID (admin / debugging)

**GET** `/history/pass/:passId`

---

## 11) Admin routes (observability)

(Requires admin auth)

* **GET** `/admin/summary`
* **GET** `/admin/customers`
* **GET** `/admin/mega/parity`
* **POST** `/admin/credits/adjust`
* **GET/POST** `/admin/config/runtime`
* **POST** `/admin/config/runtime/unset`
* **POST** `/admin/config/runtime/reload`

Admin can inspect:

* all generations
* mma_step trace per generation
* mma_event stream (likes/download/feedback)
* credit transactions and reconciliation

---

# Full Scenario (one linear story)

1. **GET** `/health`
2. User signs in (Google/OTP on frontend)
3. **GET** `/me` (with `X-Mina-Pass-Id`) → ensure customer + last seen
4. **POST** `/sessions/start` → `sess_...`
5. **GET** `/credits/balance`

   * if 0 → UI shows **I need matcha** → user goes Shopify
6. Shopify webhook **POST** `/api/credits/shopify-order` adds matcha (`MINA-50 x 4` → +200)
7. Frontend polls **GET** `/credits/balance` until updated
8. Upload product/logo/inspo via:

   * **POST** `/api/r2/upload-signed` then PUT to R2 (repeat per asset), OR
   * **POST** `/api/r2/store-remote-signed` if pasted URL
9. **POST** `/editorial/generate` → still output, -1 matcha
10. **POST** `/feedback/like` (like) and/or (download event)
11. **POST** `/editorial/generate` again with `parentGenerationId` + `feedback.text` → tweak still, -1 matcha
12. **POST** `/motion/suggest` (Type for me) → simple motion prompt
13. **POST** `/motion/generate` → video output, -matcha (configured)
14. (No video tweak) → **POST** `/feedback/like` with `event="feedback"` as send-only
15. **GET** `/history` → archive and recreate actions

---

## Minimal “request shapes” frontend should standardize

### Headers

* `X-Mina-Pass-Id: <passId>`
* (optional) `X-Session-Id: sess_<uuid>`

### Still create

* `brief`, `style`, `ratio`
* `assets.productImageUrl?`, `assets.logoUrl?`, `assets.inspirationUrls?[]`
* `settings.seedream?`
* `sessionId`

### Still tweak

* Same as still create plus:
* `parentGenerationId`
* `feedback.text`, `feedback.mode="still"`

### Motion

* `inputStillUrl` (required)
* `movementStyle`, `motionPrompt`
* `settings.kling?`, `ratio`, `sessionId`

---

If you want, I can also generate a **Postman collection JSON** for these routes (ready to import), using your headers and example payloads.


## 1) What MINAV3.me is

MINAV3.me is an AI studio that lets users:

1. **Generate still images** (product/editorial visuals) from text + optional uploads
2. **Tweak** results with feedback (prompt regeneration, same settings)
3. **Animate** an image into a short video (with optional “Type for me” helper)
4. **Like / Download / Recreate** any generation from their archive

Everything is **personalized** (likes/history/preferences) and **fully auditable** (every MMA step + payload is stored).

---

## 2) Key concepts

### 2.1 Matcha (credits)

* Mina uses **matcha** as credits.
* **1 still generation = -1 matcha**
* **1 still tweak regeneration = -1 matcha**
* **1 video generation = -5 matcha**

### 2.2 MMA (Mina Mind API)

MMA is the pipeline brain. It does three things:

1. **Understands inputs** (scans images + reads the user’s text)
2. **Learns taste** (likes/downloads/dislikes/preferences)
3. **Writes the clean prompt** for the right provider (Seedream for stills, Kling for motion)

MMA also generates **friendly userMessages** (streamed lines) so the user never stares at a dead loader.

### 2.3 MEGA-only persistence (3 tables, no new tables)

All writes go to **three Supabase tables only**:

* **MEGA_CUSTOMERS** — one row per `mg_pass_id` (credits, expiry, last active, MMA preference snapshot)
* **MEGA_GENERATIONS** — append-only ledger for sessions, generations, feedback, credit txns, MMA steps, MMA events
* **MEGA_ADMIN** — admin sessions/audits + runtime/app config versioning

### 2.4 Permanent assets rule (R2)

Every stored media URL must be **public non-expiring** (R2 public URL).
Never store signed or temporary URLs.

---

## 3) End-to-end user journey (Mina Studio)

### 3.1 Login + “last seen”

User logs in via:

* Google sign-in, or
* Email OTP

On entering Studio:

* Mina resolves `mg_pass_id`
* Upserts MEGA_CUSTOMERS if needed
* Updates **mg_last_active** (last seen)

---

## 4) Still Image Studio flow

### 4.1 Inputs

User:

1. Types a description (brief) of what they want
2. Uploads assets (any method):

   * Click upload
   * Drag & drop
   * Paste image URL
3. Optional uploads:

   * Product image
   * Logo image
   * Inspiration images (0–4)

Upload UX requirements:

* Upload must not “stick”.
* Status is reflected on the **button state** (not inside the + tile).
* If upload stalls beyond a safe timeout, button becomes **Upload image again**.

### 4.2 Style + settings

* If user does not choose style → style = **None**
* If user does not add style references → reference images = **None**
* User can toggle:

  * Aspect ratio
  * Other parameters (quality/strength/etc.)

### 4.3 Create button state (credits gate)

* If user has enough matcha:

  * Button: **Create**
* If user has 0 matcha:

  * Button changes to: **I need matcha**
  * Clicking it redirects to Shopify checkout

---

## 5) Shopify matcha packs + webhook logic

### 5.1 Pack SKUs

Examples:

* MINA-50 → +50 matcha
* MINA-100 → +100 matcha
* (etc)

**Quantity matters:**

* Credits added = `pack_value × quantity`
* Example: user buys **MINA-50 × 4** → **50 × 4 = 200 matcha**

### 5.2 Credit expiry rules

* Purchases: expiry = **30 days from last purchase**
* Free/test credits: expiry = **30 days from account creation**

### 5.3 Shopify customer tagging

On successful order webhook:

* Increase matcha balance in DB
* Set expiry
* Tag Shopify customer as **Mina-users** (for segmentation)

### 5.4 Credit write invariants

Credits are written in two places:

1. **MEGA_GENERATIONS** ledger row (`mg_record_type='credit_transaction'`, `mg_delta=+N`)
2. **MEGA_CUSTOMERS** fast balance (`mg_credits` updated)

This ensures both fast reads and full reconciliation.

---

## 6) What happens when user clicks Create (MMA still pipeline)

When user clicks **Create** and has matcha, MMA runs:

### 6.1 Scan stage (conditional)

* If product image exists → `scan_product` → `product_crt`
* If logo exists → `scan_logo` → `logo_crt`
* If inspiration images exist → `scan_inspiration` → `inspiration_crt[]`
  If none exist → scans are skipped (text-only still works)

### 6.2 Taste stage (like history)

MMA reads user’s recent activity:

* Builds `style_history_csv` (preference tags, blocks, weights)
* Optionally uses “vision intelligence” windows (5 vs 20) depending on product toggle rules

### 6.3 Prompt stage (GPT reader)

MMA composes `input_gpt_reader` from:

* scan captions (`*_crt`)
* user brief + chosen style
* like-history summary
* current preference snapshot (hard blocks + weights)

Outputs:

* `clean_prompt` (Seedream-ready)
* `userMessage_final` (friendly summary line)

### 6.4 Generation stage (Seedream)

Seedream generates the still. Output is saved to R2 public URL.

### 6.5 Post-scan stage (optional but recommended)

MMA scans the generated output to create `output_still_crt` for:

* better future personalization
* audit/debug

### 6.6 Cost

* On success: **-1 matcha** (ledger + balance)

---

## 7) Result UI + Tweak loop (still)

### 7.1 What user sees

* Generated image appears in the **right panel**
* User can:

  * Like (adds to likes)
  * Download
  * Tweak (feedback)

Carousel behavior:

* After multiple generations, bullets appear at bottom.
* New outputs append to the right-side sequence.

### 7.2 Tweak (feedback → new prompt → regenerate)

User clicks **Tweak** and types feedback like:

> “I hate the light you added”

MMA:

1. Reads previous prompt + output image + (optional) output caption + feedback text
2. Runs `gpt_feedback_still` to create an adapted prompt
3. Regenerates still with same settings, prompt updated only
4. Saves new generation output + logs steps
5. Charges **-1 matcha**

**Immutable history recommended:** each tweak creates a **new generation_id**.

---

## 8) Animation Studio flow (Kling video)

### 8.1 Switching to animation

When user clicks **Animate** on a still:

* Studio switches to animation mode
* The selected still is auto-inserted as the animation input
* Text area becomes empty
* Ratio auto-selects
* Movement style starts unselected

### 8.2 “Type for me” behavior

* “Type for me” reads the image and writes a **simple, easy-English** motion prompt for video AI.
* If no image is available:

  * “Type for me” disabled
  * Animate button state becomes **I need an image**
  * Only **one** image is required (second can be optional as an alternate/end state)

### 8.3 Upload UX (animation)

User can add/replace animation input image by:

* Clicking + box
* Drag & drop (including from the right panel)
* Pasting a URL

Stall handling:

* Button shows **Uploading…**
* After max expected time (based on 25MB and slow 4G), show **Upload image again**

### 8.4 Animate button state

* If enough matcha: **Animate**
* If not enough matcha: **I need matcha**
* While generating: **Animating… (3 min)** (or configured estimate)
* Status lines continue in the text area (MMA userMessages)

### 8.5 Video result viewing

* Video appears in the right panel history.
* Swiping left/right navigates generations (images/videos).
* Clicking center scales to full view.
* If playback UI is minimal, video may appear to keep running until user navigates away.

### 8.6 Video feedback (current rule)

* For video, “Tweak” in UI should behave as **Send feedback only** (no regen) *unless backend explicitly supports motion regeneration.*
* If you later enable motion regen, use the same pattern as still: `gpt_feedback_motion` → `kling_generate_feedback` → new generation row.

---

## 9) Session end + Profile + Archive + Recreate

### 9.1 Session end

When user clicks away and Studio refreshes:

* Session ends (session boundary)
* Next entry is a fresh session

### 9.2 Profile page

User can see:

* Email
* Matcha balance
* Expiry date
* Logout
* Back to Studio
* Get more matcha (Shopify checkout)

### 9.3 Archive (infinite scroll)

* Infinite list of creations
* Filters
* Per item:

  * Preview
  * Download
  * View settings
  * Recreate

### 9.4 Recreate

* Recreate loads the same settings and assets into the left studio.
* User is navigated to the relevant mode (still or animation).

---

## 10) Admin visibility

Admin can see:

* Every generation (still/video)
* Every MMA step payload (inputs/outputs/timing/errors)
* Every event (like/download/feedback/preference_set)
* Credit transactions + reconciliation ability

---

## 11) Backend: MEGA tables + invariants

### 11.1 Pass ID (`mg_pass_id`)

Stable identity key:

* `pass:shopify:<shopify_customer_id>` if available and not anonymous
* else `pass:user:<user_id>`
* else `pass:anon:<uuid>`

All user-linked records in MEGA_GENERATIONS and MEGA_ADMIN must reference `mg_pass_id`.

### 11.2 Namespaced primary keys (`mg_id`)

Prevents collisions across record types:

* session: `session:<id>`
* generation: `generation:<id>`
* feedback: `feedback:<id>`
* credit txn: `credit_transaction:<id>`
* MMA step: `mma_step:<generation_id>:<step_no>`
* MMA event: `mma_event:<event_id>`

`mg_record_type` must match the prefix.

---

## 12) MMA persistence contract (MEGA-only)

MMA writes to MEGA_GENERATIONS only:

### 12.1 Generation row (final artifact)

`mg_record_type='generation'` includes:

* `mg_output_url` (R2 public)
* `mg_prompt` (final prompt used)
* `mg_provider` / `mg_model`
* `mg_mma_mode` = still | video
* `mg_mma_status` transitions
* `mg_mma_vars` = canonical variable map (assets/scans/prompts/settings/userMessages/outputs)

### 12.2 MMA steps (pipeline trace)

`mg_record_type='mma_step'` rows:

* `mg_step_no`, `mg_step_type`, `mg_parent_id='generation:<id>'`
* `mg_payload` MUST contain:

```json
{
  "input": {},
  "output": {},
  "timing": { "started_at": "...", "ended_at": "...", "duration_ms": 0 },
  "error": null
}
```

### 12.3 MMA events (user interactions)

`mg_record_type='mma_event'` rows:

* `mg_meta.event_type` required:

  * like, dislike, download, preference_set, create, tweak, feedback
* Optional `mg_generation_id` if it targets a generation.

### 12.4 Customer preference snapshot

MEGA_CUSTOMERS keeps fast personalization state:

* `mg_mma_preferences` (hard blocks + tag weights)
* `mg_mma_preferences_updated_at`

---

## 13) Config versioning (ctx_* + provider defaults + adding providers)

### 13.1 Where configs live

* Store configs in **MEGA_ADMIN** as `mg_record_type='app_config'`
* Never edit in place: create new version rows

### 13.2 Keys (stable naming contract)

GPT contexts:

* `mma.ctx.gpt_scanner`
* `mma.ctx.gpt_reader`
* `mma.ctx.gpt_feedback_still`
* `mma.ctx.motion_suggestion`
* `mma.ctx.gpt_reader_motion`
* `mma.ctx.gpt_feedback_motion`

Provider defaults:

* `mma.provider.seedream.defaults`
* `mma.provider.kling.defaults`
* `mma.provider.<provider>.defaults`

Registry:

* `mma.provider.registry`

### 13.3 Persist “config used” per step

Every GPT step stores:

* `ctx_key`, `ctx_version`, `ctx_id` in `mg_payload.input`

This makes any generation reproducible and debuggable.

### 13.4 Adding a new provider (no schema changes)

1. Add defaults config row in MEGA_ADMIN
2. Add/adjust GPT translator context (re-use or provider-specific)
3. Add step type `<provider>_generate`
4. Store provider request/response in step `mg_payload`
5. Update registry config

---

## 14) UI button states (minimum required)

### Still

* Create (ready)
* Uploading…
* Creating…
* I need matcha (no credits)
* Error → Retry

### Animation

* I need an image (missing input still)
* Uploading…
* Animate (ready)
* Animating… (3 min)
* I need matcha (no credits)
* Error → Retry

---

## 15) The “MINAV3.me contract” in one paragraph

MINAV3.me is a studio where a user logs in, uploads optional assets, describes what they want, and generates stills and motion with matcha credits. MMA scans and understands images, learns taste from interaction history, writes clean prompts for Seedream/Kling, streams friendly userMessages, stores every step and event into a MEGA-only ledger (3 tables), and saves all assets as permanent R2 public URLs—so the system is personalized, auditable, and debuggable end-to-end.
