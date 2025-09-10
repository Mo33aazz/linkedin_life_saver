
**Your Role:**
Act as a Senior Business Analyst. Your task is to analyze the provided document and transform it into a comprehensive, well-structured Functional Requirements Document (FRD). Your tone should be professional, clear, and precise.

**Your Task:**
Thoroughly analyze the content of the document provided below under `DOCUMENT`. From this analysis, generate a formal FRD. You must organize the output according to the detailed structure specified below.

---

### FRD Structure to Follow:

**1. Introduction & Executive Summary**
*   **1.1. Project Purpose:** Briefly describe the project's goals and the problem the software aims to solve, based on the document.
*   **1.2. Document Scope:** State that this document outlines the functional and non-functional requirements for the product.

**2. User Roles & Personas**
*   Identify and list the different types of users who will interact with the software (e.g., Administrator, Standard User, Guest). Provide a brief description for each role.

**3. User Stories (Agile Context)**
*   Based on the identified user roles and features, create a list of user stories. Use the standard format: "**As a** [user role], **I want to** [perform an action/feature], **so that I can** [achieve a benefit]."

**4. Functional Requirements (FRs)**
*   Extract and list all specific functional requirements. These are the "what the system must do" items.
*   Group related requirements under logical feature headings (e.g., User Authentication, Dashboard, Reporting).
*   Assign a unique identifier to each requirement for traceability (e.g., FR-001, FR-002).
    *   *Example: **User Authentication***
        *   **FR-001:** The system must allow users to register with an email and password.
        *   **FR-002:** The system must validate that the email provided during registration is in a valid format.

**5. Non-Functional Requirements (NFRs)**
*   Detail the system's quality attributes and constraints—the "how the system must perform" items. If the source document doesn't specify these, infer them based on the product's nature and note that they are assumed.
*   Organize them into the following sub-categories:
    *   **5.1. Performance:** (e.g., page load times, concurrent users)
    *   **5.2. Security:** (e.g., password policies, data encryption, access controls)
    *   **5.3. Usability:** (e.g., accessibility standards, user interface responsiveness)
    *   **5.4. Reliability:** (e.g., uptime requirements, error handling)

**6. System Workflows / Process Diagrams**
*   Identify 2-3 core user journeys or system processes described in the document.
*   For each process, generate a process flow diagram using **Mermaid** syntax.
*   Provide a brief title and explanation for each diagram.

**7. Ambiguities / Items for Clarification**
*   Identify any requirements that are vague, contradictory, or missing from the source document.
*   For each item, list the ambiguity and formulate a specific question for the stakeholders to resolve it. This section is critical for identifying gaps.
    *   *Example: **Ambiguity:** The document says "users should see reports" but doesn't specify the format. **Question:** In what format(s) should reports be available for users to download (e.g., PDF, CSV, XLSX)?*

**8. Assumptions**
*   List any assumptions you have made while interpreting the document and drafting the requirements.

**9. Out of Scope**
*   Explicitly list any features or functionalities that are understood to be *not* included in this version of the product, based on the document's context or your analysis.

---

**DOCUMENT:**
# LinkedIn Browser Extension — Full Requirements (with AI via OpenRouter)

*Intentionally concise and editable. Tweak selectors, flows, and wording as you like.*

## Goal

Create a LinkedIn browser extension that can:

* Load full post pages by auto-scrolling.
* Extract the signed-in user’s profile URL from the sidebar.
* Parse all comments and replies on a post, identify which belong to the signed-in user, and compute counts for top-level comments without replies.
* Show real-time counts and action progress in a pinned, pro modern sidebar UI.
* Persist per-post comment data to JSON for recovery (one file per post).
* For each external commenter, determine connection status and extract a messaging thread ID.
* **Auto-like and reply (via AI) to top-level comments that don’t yet have a reply from the user.**
* **DM connected commenters (via AI), updating DM status.**
* Provide a full, downloadable log for debugging (counts live in the sidebar; “output” is now logs).

---

## 0) Frontend Sidebar UI & Runtime Controls (New)

**Purpose:** Always-visible, pinned sidebar for real-time visibility and control.

### Placement & Style

* Pinned to the right (or left if right is obstructed); z-index above page UI; responsive width (min 320px).
* Modern, minimal look (card sections, subtle shadows, skeleton loaders, smooth transitions).
* Dark/light mode follows OS or user setting.

### Sections

**Header**

* Post title/URN, Start/Stop toggle, Reload/Resume button, and a small status dot (Idle, Running, Paused, Error).

**Live Counters**

* Total top-level (no replies), User top-level (no replies).
* Processed / Remaining, Likes Done, Replies Done, DMs Sent, Failures.
* All counters update in real time with smooth number transitions.

**Pipeline Progress (Realtime Actions)**

* Streaming list with per-comment rows (avatar, owner name/URL, short text preview).
* Each row shows a stepper: Queued → Liked → Replied → DM Sent (or Skipped/Failed).
* Step transitions animate; retries show attempt counts.

**Controls**

* Max Replies (session limit): numeric input (front-end) synced to background.
* Delay Between Replies: min/max sliders (ms/s) to set a jitter range (front-end) synced to background.
* Max Open Tabs, Max Scrolls, Rate Limit Profile (Normal/Conservative/Aggressive).
* **AI**: API Key (OpenRouter), Model combobox (dynamic), Custom Reply Prompt editor, temperature/top-p, “Test Model”, **Save Configuration**.
* Export JSON, Export Logs, Reset Session.

**Logs Panel**

* Live, filterable log stream (Info/Warning/Error, step tags, timestamps).
* Pause/resume log autoscroll; download as NDJSON/JSONL.

**UX Notes**

* Smooth skeletons while counts compute; optimistic UI with reconciliation from background.
* Non-blocking to LinkedIn usage; draggable collapse handle.
* All control changes persist to storage and apply immediately to the worker.

---

## 1) Scroll Down to Load the Full Page

**Behavior:** Auto-scroll until all content (comments & sidebar) is loaded.
**Notes:** Delays + max-tries; stop when height stabilizes or a sentinel indicates completion.

---

## 2) Extract LinkedIn Profile URL from Sidebar

Parse the sidebar, find `<a.profile-card-profile-link>`, extract `href` (e.g., `/in/moazmali/`), prepend `https://www.linkedin.com`.

---

## 3) Identify Comments and Replies

* Find all `<article.comments-comment-entity>`.
* Owner profile URL from `<a.comments-comment-meta__image-link>`.
* Compare to signed-in profile URL to mark user’s comments.

---

## 4) Count Comments

**A) All top-level (no replies) by any user:**
`<article.comments-comment-entity.comments-comment-meta__container--parent>` → count.

**B) Top-level (no replies) by the account user:**
Same selector, filter by owner URL = user URL; ensure no descendant reply authored by user.

---

## 5) Save Comments to JSON (Updated: Per-Post Files & Status Fields)

**Per-post file:** one JSON per post for recovery, named by URN:
`/storage/posts/urn_li_activity_7368611162063671296.json`

**Item schema (array keyed under Post URL):**

```json
{
  "https://www.linkedin.com/feed/update/urn:li:activity:7368611162063671296/": [
    {
      "commentId": "optional-stable-id",
      "text": "",
      "ownerProfileUrl": "https://www.linkedin.com/in/example/",
      "timestamp": "",
      "type": "top-level",
      "connected": false,
      "threadId": "",
      "likeStatus": "",
      "replyStatus": "",
      "dmStatus": "",
      "attempts": { "like": 0, "reply": 0, "dm": 0 },
      "lastError": "",
      "pipeline": { "queuedAt": "", "likedAt": "", "repliedAt": "", "dmAt": "" }
    }
  ],
  "_meta": {
    "postId": "urn:li:activity:7368611162063671296",
    "lastUpdated": "",
    "runState": "idle"
  }
}
```

**Storage:** `chrome.storage.local` for live state; downloadable file for backup/recovery.

---

## 6) Check Connection Status & Extract Messaging Thread ID

* Open commenter profile (exclude signed-in user).
* Dropdown “More actions” → look for “Remove Connection” to mark connected.
* Intercept `voyagerMessagingGraphQL` conversations to extract `threadId`.
* Persist results into the per-post JSON. Close tab.

---

## 7) Reply to Comments (Updated: Delay/Max, Humanistic, **AI-Generated**)

**Target:** top-level comments (parent container) with no user reply.

**Steps per comment:**

1. Click Like button `button.reactions-react-button[aria-label*="React Like"]`.
2. Extract original comment text from `<span>.comments-comment-item__main-content`.
3. **Send comment + context to AI (OpenRouter) to generate a response** (see §14).
4. Click Reply `button.comments-comment-social-bar__reply-action-button--cr[aria-label*="Reply to"]`.
5. Type into `<div.ql-editor[contenteditable="true"]>` simulating human typing (incremental insertion + occasional pauses).
6. Submit via `button.comments-comment-box__submit-button--cr`.

**Delays & Limits**

* Delay Between Replies: read from front-end settings (min–max); background enforces jittered waits between like→reply and between reply→next comment.
* Max Replies (session): hard cap in background; the UI shows remaining.

**Humanistic**

* Randomized pauses, typing bursts, minor variations in phrasing (AI prompt seeds), optional emoji probability.

---

## 8) Send Direct Messages (DM)

For external commenters who are connected with a valid `threadId`:

* Open `https://www.linkedin.com/messaging/thread/<THREAD_ID>/`.
* **Generate personalized DM via AI** (comment text + brief profile signals + user prompt), see §14.
* Insert into `<div.msg-form__contenteditable[contenteditable="true"]>` with human-like typing and send.
* Mark `dmStatus` accordingly; close tab.

**Rate Limits:** Respect global delays and jitter (shared controls with Replies).

---

## 9) Processing Model & Order (New)

Strict per-comment pipeline (sequential):
`Comment #1: Like → Reply → DM → done` then `Comment #2 …`

* Single-threaded by default (no overlap) to minimize detection risk and simplify recovery.
* Optional small prefetch window for metadata (non-action requests only).
* Each step updates the sidebar row and JSON atomically; step must succeed or mark attempt & retry (§10).

---

## 10) Retries & Failure Semantics (New)

* Each action (Like/Reply/DM) retries up to **3** times with exponential backoff + jitter.
* On final failure, set the respective status to `"FAILED"` and record `lastError`.
* **Special rule:** If reply fails after 3 retries, set `"replyStatus": "FAILED"` (not `"DONE"`). Sidebar badges failure; logs record details.
* Subsequent steps respect dependencies (e.g., DM can still proceed if configured, or skip on failed reply based on setting).

---

## 11) Recovery, Resume & Start/Stop (New)

* Per-post JSON is the source of truth; on extension reload or tab crash:

  * Detect existing per-post file by URN and resume from the last incomplete step per comment.
  * Idempotent checks (e.g., if Like already applied, skip re-liking).
* **Start/Stop Button:**

  * Stop: gracefully finish the current atomic step, persist, then pause.
  * Start/Resume: continue from next step.
  * Reload/Resume rebinds UI to current JSON.

---

## 12) Observability & Debug Logs (Replaces “Output Results”)

* Output is now logs; counts live in UI.
* Structured log events (time, postId, commentId, step, level, message, attempt, elapsed).
* Visible in the sidebar Logs panel (filterable) and downloadable as NDJSON/JSON.
* Key summaries: processed, successes, failures, skipped, avg step durations.
* Optional trace IDs per comment pipeline.

---

## 13) Config & Settings (Front & Backend) (New)

* **Delays:** min/max delay between actions; global per-action base with jitter.
* **Max Replies per Session**: front-end input mirrored in background hard cap.
* **Max Open Tabs, Max Scrolls, Rate Profiles.**
* **Humanistic Variations:** toggles for pacing variance, occasional rephrasing, emoji probability.
* **Safety:** backoff on 4xx/429, daily cap, and “cool-down” periods.

---

## 14) **AI Integration (OpenRouter) — Models, Keys, Prompts, Storage (New)**

> **Why OpenRouter?** Single OpenAI-compatible API that routes to many LLMs; standardized Chat Completions schema. ([OpenRouter][1])

### 14.1 API Endpoints & Headers

* **List models** (for the combobox): `GET https://openrouter.ai/api/v1/models` (requires API key).

  * Use this to fetch model IDs, names, context length, and optional pricing metadata for display. ([OpenRouter][2], [Docs.rs][3])
* **Chat completions** (generate replies/DMs): `POST https://openrouter.ai/api/v1/chat/completions` with OpenAI-style payload (`model`, `messages`, etc.).

  * **Headers:** `Authorization: Bearer <API_KEY>` (required).
  * **Recommended headers for attribution & analytics:** `HTTP-Referer: <your extension homepage or github repo>` and `X-Title: "LinkedIn Reply Assistant"` (optional but encouraged). ([OpenRouter][4])

### 14.2 Frontend UI Additions (Sidebar → Controls)

* **API Key Input** (masked) + “Save” & “Test Model” buttons.
* **Model Combobox**

  * Searchable, async options.
  * Default “curated” list first; “Show all models” toggle reveals the full catalog.
  * Display `name` and subtle `provider`/`context_length` tag; show a small “\$” hover with price if available.
* **Custom Reply Prompt** (multiline): instruct *how* the user wants replies to sound (tone, length, emoji use, CTA, hashtags).
* **Knobs:** temperature (0–1.5), top-p, max tokens for completion, “stream tokens” toggle.
* **Persist** all AI settings via `chrome.storage.sync` (preferred) with local shadow copy; auto-apply immediately.

### 14.3 Storage Schema (sync)

```json
{
  "aiConfig": {
    "provider": "openrouter",
    "apiKey": "encr:...optional-kms...",
    "model": "anthropic/claude-3.5-sonnet",
    "temperature": 0.5,
    "top_p": 1.0,
    "max_tokens": 220,
    "stream": true,
    "reply": {
      "customPrompt": "Keep it warm, brief, specific; acknowledge their point; avoid salesy tone; 0–1 emoji."
    },
    "dm": {
      "customPrompt": "Thank them, reference comment, offer short helpful resource; soft opt-in; no pressure."
    },
    "attribution": {
      "httpReferer": "https://github.com/your-org/linkedout-assistant",
      "xTitle": "LinkedIn Reply Assistant"
    },
    "modelFilters": {
      "onlyTextOutput": true,
      "minContext": 8_000
    }
  }
}
```

### 14.4 Model Fetching Rules

* On opening the sidebar **or** when API key changes: fetch models.
* Filter to text-output chat/instruct models; hide vision-only.
* Sort: curated list (hand-picked) → by popularity/uptime if available; otherwise alphabetically.
* Cache list for the session; re-fetch on “Refresh models”.

> **Docs:** Available models endpoint and fields. ([OpenRouter][2])

### 14.5 Reply Generation — Message Template

**Endpoint:** Chat Completions (OpenAI-compatible). ([OpenRouter][4])

**System message (template):**

```
You are a helpful LinkedIn engagement assistant for {{user_name}} ({{user_profile_url}}).
Goal: write brief, genuinely specific replies to post comments.
Rules:
- Be friendly and professional; avoid slang and hype.
- Acknowledge the commenter’s point in 1 sentence; add 1 useful nugget or question.
- Prefer 1–2 sentences total; max ~50–70 words.
- Mirror the commenter’s language (auto-detect).
- Emojis: {{emoji_policy}}  (e.g., "0–1 max" or "none")
- No hashtags unless provided by {{user_name}} in the custom prompt.
- Never promise unavailable features or make factual claims beyond the post/comment.
- If the comment seems spam, toxic, or irrelevant, respond with: "__SKIP__".
- If user already replied meaningfully, respond with: "__ALREADY_REPLIED__".
```

**User message (template):**

```
Post title: {{post_title}}
Post URL: {{post_url}}
My persona: {{custom_reply_prompt_from_settings}}
Original comment ({{commenter_name}}, {{connection_status}}):
"{{comment_text}}"
Optional context: {{post_summary_or_bullets}}
Constraints: max_tokens={{max_tokens}}
Output: ONLY the reply text (no quotes). If skipping, output exactly "__SKIP__".
```

**Params:** `model`, `temperature`, `top_p`, `max_tokens`, `stream` (optional).
**On `__SKIP__`:** mark comment as Skipped; don’t reply.
**On `__ALREADY_REPLIED__`:** mark as Skipped(reason=already) and continue.

### 14.6 DM Generation — Message Template

**System message (template):**

```
You craft concise, personable LinkedIn DMs after a public interaction.
Goals: thank, reference their comment, offer one helpful thing (resource, insight, invite), and propose a lightweight next step.
Tone: warm, zero-pressure, 2–4 sentences max.
No calendar links unless provided. Avoid salesy language.
```

**User message (template):**

```
Thread ID: {{thread_id}}
Receiver: {{commenter_name}} ({{commenter_profile_url}}; {{connection_status}})
Their comment: "{{comment_text}}"
My persona & preferences: {{custom_dm_prompt_from_settings}}
Optional signals: {{profile_signals}}
Outcome: a short DM ready to send. No greeting if one already exists in the thread.
```

### 14.7 Error Handling & Telemetry

* 401/403 → mark AI unavailable; surface banner “Invalid API key”; disable Start until fixed.
* 429 → exponential backoff + global cool-down; log `retryInMs`.
* 5xx → up to 3 retries; show degraded banner.
* Log each AI call: model, latency, tokens (if provided), cost estimate (if pricing present).
* Respect streaming: render tokens to a transient preview “typing…” bubble in the sidebar before submitting the final reply.

### 14.8 Security & Privacy

* Store the API key in `chrome.storage.sync` **encrypted** if a helper is available; otherwise local+masked with clear “stored locally” notice.
* Never include the API key in logs or exports.
* Allow **Clear AI Credentials** button to nuke keys/config.

---

## 15) Networking Details (Implementation Hints)

**List models request (combobox):**

```
GET https://openrouter.ai/api/v1/models
Headers:
  Authorization: Bearer <API_KEY>
  HTTP-Referer: https://github.com/your-org/linkedout-assistant   // optional, recommended
  X-Title: LinkedIn Reply Assistant                               // optional, recommended
```

Returns a catalog you can filter/group for the UI. ([OpenRouter][2])

**Chat completions (reply/DM):**

```
POST https://openrouter.ai/api/v1/chat/completions
Headers:
  Authorization: Bearer <API_KEY>
  Content-Type: application/json
  HTTP-Referer: ... (optional)
  X-Title: ... (optional)
Body:
{
  "model": "<selected_model_id>",
  "messages": [
    {"role":"system","content": "<system_template_filled>"},
    {"role":"user","content": "<user_template_filled>"}
  ],
  "temperature": <num>,
  "top_p": <num>,
  "max_tokens": <int>,
  "stream": true
}
```

OpenRouter follows the OpenAI Chat API shape. ([OpenRouter][4])

---

## 16) Settings Persistence & “Save Configuration”

* **Save Configuration** button writes `aiConfig` to `chrome.storage.sync`.
* Optimistic UI with toast; reconcile on write completion.
* On load, merge `sync.aiConfig` → `local.aiConfig` (local used at runtime).
* Add **“Reset AI Settings”** to factory defaults.
* Include a **“Test Model”** button that calls the chat endpoint with a tiny prompt (“Say OK”) and shows latency / tokens.

---

## 17) Permissions (Manifest V3)

* `tabs`, `scripting`, `activeTab`, `storage`, host permissions for `https://www.linkedin.com/*`.
* `declarativeNetRequest` (optional) for safe header injection if needed for `HTTP-Referer` on XHR/fetch.

---

## 18) Files

* `manifest.json`, `content.js` (DOM parsing & sidebar injection), `service_worker.js` (network intercept, orchestration), `options.html/js` (settings), `popup.html/js`.
* Sidebar app via Shadow DOM (Vanilla/Preact) to avoid CSS collisions.

---

## 19) Resilience

* Retries (per §10), exponential backoff, circuit-breaker on 4xx/429, selector fallbacks.
* AI layer has its own breaker so UI doesn’t freeze the pipeline.

---

## 20) Privacy

* Store only necessary fields; allow export/reset of local data.
* Do not export API keys.
* Optional redaction pass on logs before download.

---

## 21) State & FSM (Reference)

* Background maintains FSM per comment: `QUEUED → LIKED → REPLIED → DM_SENT` with `FAILED_*` substates.
* Idempotency checks before actions (e.g., detect “Liked” state).

---

## 22) Compliance Note

* Automated interactions can violate LinkedIn ToS. Provide **Rate Profiles**, daily cap, and “human-like” pacing. Use at user’s risk.

---

### Quick Acceptance Checklist

* [ ] Sidebar shows Start/Stop, status dot, counters, pipeline rows with animated steppers.
* [ ] Auto-scroll loads all comments reliably.
* [ ] User profile URL extracted from sidebar.
* [ ] Top-level (no replies) counts correct (all + user-only).
* [ ] Per-post JSON persisted & reloadable; resume works mid-pipeline.
* [ ] Connection status + `threadId` resolved and saved.
* [ ] **AI settings UI present (API key, model combobox, custom prompts, knobs)**; saved and restored next session.
* [ ] Model list fetched dynamically from OpenRouter; curated+all views. ([OpenRouter][2])
* [ ] Replies/DMs generated via Chat Completions; streaming supported; skips handled. ([OpenRouter][4])
* [ ] Logs panel with filters; downloadable NDJSON.
* [ ] Retries/backoff semantics per §10; special FAILED rule for replies honored.
* [ ] Safety & privacy behaviors verified (no key in logs/exports).
* [ ] Rate limit & cool-down respected.

---

#### Notes / References

* OpenRouter Chat Completions endpoint & headers. ([OpenRouter][4])
* App attribution headers (`HTTP-Referer`, `X-Title`). ([OpenRouter][5])
* Model catalog endpoint (populate combobox). ([OpenRouter][2], [Docs.rs][3])
* API shape is OpenAI-compatible (standardized schema). ([OpenRouter][1])

---

**That’s the full prompt with the AI part integrated.** If you want, I can also drop in a minimal `service_worker.js` fetch helper and a tiny Preact sidebar stub to wire up the key/model picker.

[1]: https://openrouter.ai/docs/api-reference/overview?utm_source=chatgpt.com "OpenRouter API Reference - Complete Documentation"
[2]: https://openrouter.ai/docs/api-reference/list-available-models?utm_source=chatgpt.com "List available models | OpenRouter | Documentation"
[3]: https://docs.rs/openrouter/latest/openrouter/models/index.html?utm_source=chatgpt.com "openrouter::models - Rust - Docs.rs"
[4]: https://openrouter.ai/docs/api-reference/chat-completion?utm_source=chatgpt.com "Chat completion | OpenRouter | Documentation"
[5]: https://openrouter.ai/docs/app-attribution?utm_source=chatgpt.com "App Attribution | OpenRouter Documentation | OpenRouter | Documentation"

