# MINAV3.me — Product + Backend Spec (Mina Studio V3 + MMA + MEGA-only)

**Timezone:** Asia/Dubai
**Storage + DB model:** MEGA-only (3 tables) + Cloudflare R2 public URLs
**AI pipeline:** MMA (Mina Mind API) orchestrates scans → prompt-building → generation → post-scan → feedback loops

---

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
* Video generation cost is defined in runtime config (often similar pattern; keep consistent in UI).

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
