# Mina Frontend → Backend Routes Map

This document lists **every backend route** referenced in the frontend code snippets you provided (**AuthGate.tsx**, **Profile.tsx**, **MinaApp.tsx**), including:
- the **HTTP method + path**
- the **caller** (function / file)
- **when it runs** (conditions / triggers)
- **headers** and **auth**
- **request body / params**
- **fallbacks / retries**
- **side effects** (cache invalidation, state updates)

---

## 0) API Base URL resolution (critical)

Your frontend does **not** use a single uniform base URL strategy across files.

### AuthGate.tsx
- `API_BASE_URL = VITE_MINA_API_BASE_URL || "https://mina-editorial-ai-api.onrender.com"`
- **No `/api` is appended** in AuthGate.

### Profile.tsx
Uses `resolveApiBase(override)`:
1) If env present:
   - `VITE_MINA_API_BASE_URL` OR `VITE_API_BASE_URL` OR `VITE_BACKEND_URL`
2) Else if browser:
   - local: `"http://localhost:3000"`
   - prod: `window.location.origin + "/api"`
3) Else SSR fallback:
   - `"https://mina-editorial-ai-api.onrender.com/api"` (**includes `/api`**)

### MinaApp.tsx
Uses `API_BASE_URL` IIFE:
1) If env present:
   - `VITE_MINA_API_BASE_URL` OR `VITE_API_BASE_URL` OR `VITE_BACKEND_URL`
2) Else if browser:
   - local: `"http://localhost:3000"`
   - prod: `window.location.origin + "/api"`
3) Else SSR fallback:
   - `"https://mina-editorial-ai-api.onrender.com"` (**NO `/api`**)

**Implication:** depending on env + runtime, calls may be sent to:
- `https://...onrender.com/me` (AuthGate)
- `https://...onrender.com/api/history/...` (Profile SSR fallback)
- `https://yourdomain.com/api/...` (MinaApp + Profile browser fallback)

---

## 1) Common auth + identity behavior

### Pass ID
- Stored in localStorage key: `minaPassId`
- Passed to backend via header: `X-Mina-Pass-Id: <passId>`
- “Canonicalized / linked” using the backend `/me` route (AuthGate)

### Supabase JWT
- Retrieved via `supabase.auth.getSession()`
- Sent to backend as:
  - `Authorization: Bearer <access_token>`

### Cookies
- AuthGate’s `/me` call explicitly uses `credentials: "omit"` (no cookies in cross-origin requests).

---

## 2) Routes used by AuthGate.tsx

### 2.1 `GET /me`
**File / function**
- `AuthGate.tsx` → `ensurePassIdViaBackend()` (called from `refreshPassId()`)

**When it runs**
- On mount (after `supabase.auth.getSession()` resolves in the `init()` effect)
- On auth events via `supabase.auth.onAuthStateChange(...)`:
  - `SIGNED_IN` → refresh pass id, then optional Shopify sync
  - `SIGNED_OUT` → refresh pass id (keep continuity for anonymous)
  - other auth events → refresh pass id

**Headers**
- If passId exists locally: `X-Mina-Pass-Id: <existingPassId>`
- If user is logged in: `Authorization: Bearer <supabase_access_token>`
- `credentials: "omit"`

**Response expectation**
- Backend returns canonical id:
  - `{ ok: true, passId: "..." }` OR `{ pass_id: "..." }`
- Frontend extracts `passId` or `pass_id`.

**Fallback / failure behavior**
- If request fails OR `!res.ok`:
  - returns `existing || generateLocalPassId()`
- If request succeeds but missing pass field:
  - returns `existing` (or generated later)

**Side effects**
- Persists passId to localStorage
- Updates React state `passId`

---

### 2.2 `POST /auth/shopify-sync`
**File / function**
- `AuthGate.tsx` → `syncShopifyWelcome()`

**When it runs (non-blocking)**
- After `SIGNED_IN` event:
  - if user email exists → `syncShopifyWelcome(uemail, uid, pid)`
- When user submits Email OTP login (`handleEmailLogin`):
  - before OTP is sent → `syncShopifyWelcome(trimmedEmail, undefined, pid)`

**Conditions**
- Must have a non-empty normalized email
- Uses AbortController timeout (default `3500ms`)

**Body**
```json
{
  "email": "normalized@email.com",
  "userId": "optional-supabase-uid",
  "passId": "optional-pass-id"
}
```

**Response parsing**
- Accepts any of:
  - `shopifyCustomerId`, `customerId`, `id` (string)

**Failure behavior**
- Any error, timeout, or `json.ok === false` returns `null`
- No UI blocking

---

### 2.3 `GET /public/stats/total-users`
**File / function**
- `AuthGate.tsx` → “Optional public stats label” effect

**When it runs**
- Once on mount

**Conditions**
- Only if `API_BASE_URL` exists
- Updates UI only if:
  - `json.ok === true`
  - `typeof json.totalUsers === "number"` and `totalUsers >= 0`

---

## 3) Routes used by Profile.tsx

Profile builds a base URL with `resolveApiBase()` and sends:

**Headers**
- `Accept: application/json`
- `Authorization: Bearer <token>`
  - prefers AuthGate context token, else Supabase session token
- `X-Mina-Pass-Id: <passId>`
  - passId is resolved from:
    - `propPassId` OR `ctxPassId` OR localStorage `minaPassId`

### 3.1 History endpoints (retry / fallback chain)

Profile attempts history in this order until it finds a success response:

1) `GET /history/trimmed`
2) `GET /history`
3) If passId exists: `GET /history/pass/:passId`

**When it runs**
- On mount and whenever these change:
  - `apiBase`, `propPassId`, `ctxPassId`, `authCtx.accessToken`

**Success condition**
- `resp.ok` AND (`json.ok === true` OR `Array.isArray(json.generations)`)

**Failure behavior**
- Sets `historyErr`
- Clears local state:
  - generations, feedbacks, credits, expiresAt

**Credits extraction**
- From `json.credits.balance` if present
- Expiration: `json.credits.expiresAt` if present

---

## 4) Routes used by MinaApp.tsx (Studio)

All MinaApp network calls use `apiFetch(path, init)` which auto-attaches:

**Auto headers**
- `Authorization: Bearer <supabase_jwt>`
  - prefers AuthGate token; falls back to `supabase.auth.getSession()`
- `X-Mina-Pass-Id: <currentPassId>` if present
- If body exists and caller didn’t specify:
  - `Content-Type: application/json`

**Side effect**
- Tracks `pendingRequests` counter for UI loading indicators

---

### 4.1 `GET /health`
**Function**
- `handleCheckHealth()`

**When it runs**
- Only when called (not shown as auto-called in the snippet)

**Expected response**
- `{ ok?: boolean, message?: string }`

---

### 4.2 `GET /credits/balance?passId=<passId>`
**Function**
- `fetchCredits()`

**Conditions**
- Requires `API_BASE_URL` + `currentPassId`
- Uses cache unless:
  - `creditsDirtyRef.current === true`, OR
  - cache older than ~30 seconds

**Triggers that mark credits dirty / refetch**
- passId change (effect)
- window focus
- tab becomes visible (`visibilitychange`)

**Response usage**
- Sets:
  - `credits.balance`
  - `credits.meta.imageCost / motionCost` (from response or adminConfig)
  - `credits.meta.expiresAt` extracted via `extractExpiresAt(...)`

---

### 4.3 `POST /sessions/start`
**Function**
- `ensureSession()`

**Conditions**
- Only if `sessionId` not already set
- Requires `API_BASE_URL` + `currentPassId`

**Body**
```json
{
  "passId": "<currentPassId>",
  "platform": "<currentAspect.platformKey>",
  "title": "<sessionTitle>"
}
```

**Expected response**
- `{ ok: true, session: { id: "...", title?: "..." } }`

**Side effects**
- Stores `sessionId`
- Updates `sessionTitle` if backend returns a title

---

### 4.4 `GET /history/pass/:passId`
**Function**
- `fetchHistory()` → calls `fetchHistoryForPass(pid)`

**When it runs**
- Only when `activeTab === "profile"` AND `currentPassId` exists

**Caching**
- Uses `historyCacheRef` unless `historyDirtyRef.current === true`

**Side effects**
- Updates `historyGenerations`, `historyFeedbacks`
- Updates credits from history response if present
- Normalizes each generation’s `outputUrl` by storing to R2 (see `storeRemoteToR2` below)

---

## 5) R2 storage routes (MinaApp.tsx)

### 5.1 `POST /api/r2/upload-signed`
**Function**
- `uploadFileToR2(panel, file)`

**Triggered by**
- User selects/drops image files into upload panels:
  - `product`, `logo`, `inspiration`

**Body**
```json
{
  "dataUrl": "data:image/...base64...",
  "kind": "product|logo|inspiration",
  "passId": "<currentPassId>"
}
```

**Response parsing**
Prefers stable/public URLs first:
- `publicUrl`, `public_url`, `url`, `public`, etc.
Signed URLs are accepted only as a last resort.

Then `stripSignedQuery()` is applied to avoid expiring links.

**Failure behavior**
- Throws an error to the caller
- Caller sets upload item `error` and stops uploading state

---

### 5.2 `POST /api/r2/store-remote-signed`
**Function**
- `storeRemoteToR2(url, kind)`

**Triggered by**
- Pasting a remote image URL into upload panel
- Normalizing history generation URLs after history fetch
- After generation endpoints return provider URLs (Replicate) so results become stable

**Body**
```json
{
  "url": "https://remote/or/provider/url",
  "kind": "generations|motions|product|logo|inspiration|...",
  "passId": "<currentPassId>"
}
```

**Failure behavior**
- If backend fails, returns original input `url` (non-blocking)

---

## 6) Generation routes (MinaApp.tsx)

### 6.1 `POST /editorial/generate`
**Function**
- `handleGenerateStill()`

**Hard conditions (must pass)**
- `stillBrief.trim().length >= 40`
- `API_BASE_URL` exists
- `currentPassId` exists
- `ensureSession()` returns a session id

**Body (core)**
```json
{
  "passId": "<currentPassId>",
  "sessionId": "<sid>",
  "brief": "<stillBrief>",
  "tone": "<tone>",
  "platform": "<currentAspect.platformKey>",
  "minaVisionEnabled": true|false,
  "stylePresetKey": "<primaryStyleKeyForApi>",
  "stylePresetKeys": ["..."],
  "aspectRatio": "9:16|3:4|2:3|1:1",
  "productImageUrl": "optional https://...",
  "logoImageUrl": "optional https://...",
  "styleImageUrls": ["optional https://...", "..."]
}
```

**Response expectation**
- `{ ok: true, imageUrl?: string, imageUrls?: string[], prompt?: string, gpt?: {...}, credits?: {...} }`

**Side effects**
- Shows “override” text (userMessage + prompt) in UI if provided
- Stores returned image URL into R2:
  - `storeRemoteToR2(url, "generations")`
- Marks caches dirty:
  - `historyDirtyRef = true`
  - `creditsDirtyRef = true`
- Adds item to `stillItems`
- Updates credits state if `credits.balance` returned

**Error handling**
- If `!res.ok`, tries to parse `message` from JSON
- Sets `stillError`

---

### 6.2 `POST /motion/suggest`
**Function**
- `handleSuggestMotion()`

**Hard conditions**
- `API_BASE_URL` exists
- `motionReferenceImageUrl` exists
- Not currently suggesting or typing
- `currentPassId` exists

**Body**
```json
{
  "passId": "<currentPassId>",
  "referenceImageUrl": "<motionReferenceImageUrl>",
  "tone": "<tone>",
  "platform": "<animateAspectOption.platformKey>",
  "minaVisionEnabled": true|false,
  "stylePresetKey": "<primaryStyleKeyForApi>",
  "stylePresetKeys": ["..."],
  "motionStyles": ["fix_camera", "..."],
  "aspectRatio": "<animateAspectOption.ratio>"
}
```

**Response expectation**
- `{ ok: true, suggestion?: string, gpt?: {...} }`

**Side effects**
- Types the suggestion into motion text area (chunked animation)
- Sets `animateMode = true`

---

### 6.3 `POST /motion/generate`
**Function**
- `handleGenerateMotion()`

**Hard conditions**
- `API_BASE_URL` exists
- `motionReferenceImageUrl` exists
- `motionTextTrimmed` non-empty
- `currentPassId` exists
- `ensureSession()` returns a session id

**Body**
```json
{
  "passId": "<currentPassId>",
  "sessionId": "<sid>",
  "lastImageUrl": "<motionReferenceImageUrl>",
  "motionDescription": "<motionTextTrimmed>",
  "tone": "<tone>",
  "platform": "<animateAspectOption.platformKey>",
  "minaVisionEnabled": true|false,
  "stylePresetKey": "<primaryStyleKeyForApi>",
  "stylePresetKeys": ["..."],
  "motionStyles": ["..."],
  "aspectRatio": "<animateAspectOption.ratio>"
}
```

**Response expectation**
- `{ ok: true, videoUrl?: string, prompt?: string, gpt?: {...}, credits?: {...} }`

**Side effects**
- Shows overlay text if provided
- Stores video URL into R2:
  - `storeRemoteToR2(url, "motions")`
- Marks caches dirty:
  - `historyDirtyRef = true`
  - `creditsDirtyRef = true`
- Adds item to `motionItems`
- Updates credits state if returned

**Error handling**
- Sets `motionError`

---

## 7) Feedback routes (MinaApp.tsx)

### 7.1 `POST /feedback/like` (LIKE flow)
**Function**
- `handleLikeCurrentStill()` (but also works for motion)

**Conditions**
- Must have `currentPassId`
- Optimistically toggles local like state first
- **Network call is only sent when toggling to liked=true**
  - No request is sent when unliking

**Body**
```json
{
  "passId": "<currentPassId>",
  "resultType": "image|motion",
  "platform": "<currentAspect.platformKey>",
  "prompt": "<best prompt string>",
  "comment": "",
  "imageUrl": "only for image likes",
  "videoUrl": "only for motion likes",
  "sessionId": "<sessionId or null>",
  "liked": true
}
```

**Failure behavior**
- Non-blocking (errors ignored), UI remains responsive

---

### 7.2 `POST /feedback/like` (COMMENT flow)
**Function**
- `handleSubmitFeedback()`

**Conditions**
- `API_BASE_URL` exists
- `feedbackText.trim()` non-empty
- `currentPassId` exists

**Body**
- Same general shape, but:
  - `comment` is user text (non-empty)
  - `liked` not required

**Side effects**
- Clears `feedbackText` on success
- Sets `feedbackError` on failure

---

## 8) Summary list (quick scan)

### AuthGate.tsx
- `GET /me`
- `POST /auth/shopify-sync`
- `GET /public/stats/total-users`

### Profile.tsx
- `GET /history/trimmed`
- `GET /history`
- `GET /history/pass/:passId`

### MinaApp.tsx
- `GET /health`
- `GET /credits/balance?passId=...`
- `POST /sessions/start`
- `GET /history/pass/:passId`
- `POST /api/r2/upload-signed`
- `POST /api/r2/store-remote-signed`
- `POST /editorial/generate`
- `POST /motion/suggest`
- `POST /motion/generate`
- `POST /feedback/like`

---

## 9) Notable frontend-side conditions / “rules”

- Still generation blocked unless `stillBrief.trim().length >= 40`
- Motion generation blocked unless:
  - `motionReferenceImageUrl` exists
  - `motionDescription.trim()` non-empty
- Likes are persisted locally immediately; backend is only notified on “like”, not “unlike”
- Profile history uses a retry chain to remain compatible with older backends:
  - `/history/trimmed` → `/history` → `/history/pass/:passId`
- MinaApp profile fetch normalizes every output URL into R2 for stable links

