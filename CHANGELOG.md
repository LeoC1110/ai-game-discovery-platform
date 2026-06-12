# Changelog

All notable changes to this project are documented here.
New features and updates should be added under the relevant version or date section below.

---

## [2026-06-12] — Deterministic AI Pipeline Refactor, Platform Data Stabilization, and Migration Utilities

### `auth-service` — Planner-First AI Pipeline Refactor

Refactored the Nova backend AI flow into a clearer planner-first orchestration model with stronger compatibility guarantees.

- `routerAgent.js` now returns structured plan metadata (mode, confidence, execution flags) for downstream orchestration
- `answerAgent.js` was upgraded to plan-aware prompt composition while preserving existing public signatures
- `validatorAgent.js` was rewritten as a deterministic rule-based validation layer (no default LLM/DB side effects)
- `aiPipeline.js` now delegates by plan, conditionally loads data, performs one-pass reflection when required, and returns richer metadata in responses

### `platformTools.js` — Deterministic MongoDB Data Retrieval Layer

Stabilized platform data retrieval so query behavior is predictable and prompt formatting is consistent.

- Added fixed limits, strict field projection, and deterministic ordering paths for inventory, top-rated, low-rated, and trending views
- Added schema-safe normalization helpers and compact title-first formatter output for parser-friendly prompts
- Added `buildPlatformDataForPlan(...)` and retained backward compatibility through intent-based adapters
- Removed dependency on web-search path for this core retrieval layer to keep behavior deterministic in the pipeline

### `conversationManager.js` — Scalable History Handling

Improved history read/write behavior for long-running users.

- `loadHistory` now uses DB-side slicing (projection with `$slice`) instead of loading full message arrays
- `saveExchange` now applies bounded message retention via `$push.$slice` to prevent unbounded document growth

### `recommendationExtractor.js` — Faster, Safer Recommendation Parsing

Improved extraction and enrichment reliability for recommendation cards.

- Replaced broad regex extraction with marker-based block parsing (`indexOf` boundaries)
- Added case-insensitive title de-duplication before and after enrichment
- Switched to exact-match lookup path using normalized title keys instead of regex-heavy DB matching
- Added `bookmarksCount` to recommendation payload for frontend consistency

### `GamePost` Model — Normalized Title Support

Introduced normalized title support to improve matching reliability and index utilization.

- Added `titleNormalized` field
- Added `pre('validate')` normalization from `title`
- Added indexes for `title` and `titleNormalized`

### Tests and Diagnostics

Expanded isolated and pipeline-level test coverage under `packages/auth-service/ai/__tests__/`.

- Added dedicated tests for `conversationManager`, `recommendationExtractor`, and `platformTools`
- Kept and validated router/answer/validator/pipeline suites plus mock-mode smoke tests
- AI-layer regression suites passed after refactor (no failures in the updated batches)

### Migration Utility

Added a one-time migration utility for backfilling normalized titles in existing records.

- New script: `packages/auth-service/scripts/backfillTitleNormalized.js`
- Supports dry-run by default and write mode with `--apply`
- Supports both `MONGO_URI` and `MONGODB_URI` environment variable names
- Added npm scripts:
  - `backfill:title-normalized`
  - `backfill:title-normalized:apply`

---

## [2026-06-11] — Nova Streaming UX, SSE Pipeline, and AI Smoke Tests

### `AgentPage.jsx` — Visible Progress and Streaming Response UI

The Nova chat experience now shows user-visible progress during generation and can render streamed response text as it arrives.

- Added a dedicated SSE client service in `apps/auth-frontend/src/services/aiStreamClient.js`
- The chat UI now shows staged progress messages while Nova is analyzing, loading platform data, matching games, and generating recommendations
- The frontend still keeps a GraphQL fallback path so the experience remains usable if SSE is unavailable

### `auth-service` — SSE Stream Endpoint

Added a backend SSE route at `POST /ai/stream` that emits `progress`, `token`, `final`, `done`, and `error` events.

- Reuses the existing AI pipeline and auth checks
- Keeps rate limiting in place for the streaming path
- Streams the final answer in chunked token events so the frontend can update the chat progressively

### `Nova` — Update Notes Section

Added a dedicated Nova updates section to the README so future AI changes are easier to scan.

- The new section summarizes the current streaming UX, smoke tests, and grounding safeguards
- The changelog now records this update explicitly so it is easier to track over time

### Smoke Tests

Ran the auth-service AI mock-mode and pipeline smoke tests successfully.

- Mock mode verifies that Gemini is bypassed when `AI_MOCK_MODE=true`
- Pipeline tests verify greeting fast-paths, mock behavior, and real-mode failure handling when no API key is configured

---

## [2026-05-26] — Markdown Rendering, Tavily for Game Recommendations, and UI Prompt Fixes

### `AgentPage.jsx` — Markdown Rendering for Agent Responses

Installed `react-markdown` in `apps/auth-frontend` and applied it to AI agent chat bubbles.

- Agent responses now render full Markdown: **bold**, *italic*, bullet lists, numbered lists, and inline `code`
- User messages remain as plain `<p>` text (users do not write Markdown)
- Added `.agent-message__markdown` CSS class in `App.css` with scoped styles for all rendered Markdown elements (`p`, `ul`, `ol`, `li`, `strong`, `code`)

### `AgentPage.jsx` — Suggested Prompt Fixes

Audited all 6 quick-start suggestion buttons against the `routerAgent.js` pattern table.

Fixed a routing bug in the sixth prompt: `"Summarize reviews for a popular game."` matched **no** named intent (fell through to `GENERAL_CHAT`, skipping all platform data). Replaced with `"Which games are trending in the community?"` which correctly routes to `COMMUNITY_SUMMARY` via `/trending/i`.

Updated prompts:
- `"Find multiplayer strategy games."` → `"Find me a good co-op or multiplayer game."` (more conversational)
- `"What should I play next?"` → `"What should I play next based on my taste?"` (signals use of user memory)
- `"Summarize reviews for a popular game."` → `"Which games are trending in the community?"` (fixes routing bug)

All 6 prompts now map to a named intent and will fetch real platform data.

### `platformTools.js` — Tavily Web Search Extended to Game Recommendations

Previously Tavily was only called for `GENERAL_CHAT` intent. It is now also called for `GAME_RECOMMENDATION` when `TAVILY_API_KEY` is configured, supplementing platform data with one web-sourced game suggestion.

The web result is appended under a clearly labelled `--- Web Suggestions (games not on this platform) ---` section so Gemini can distinguish it from DB data.

### `answerAgent.js` — System Prompt Rules Updated

System prompt behaviour rules updated to match the new two-source data layout:

- **RECOMMENDATIONS block** (drives the card UI) is restricted to titles from the `Platform Data` section only — the `recommendationExtractor.js` hallucination guard enforces this at extraction time
- **Web Suggestions** may contribute at most 1 title to the prose response, clearly labelled `"Also consider (not on this platform): <title>"`
- `RECO_FORMAT_RULE` updated to say "Platform Data section — never from Web Suggestions or training knowledge"

---

## [2026-05-26] — Pipeline Cleanup, User Memory Wiring, and README Rewrite

### `aiAgentService.js` — Dead Code Removal

The entry-point service was slimmed from ~500 lines to **134 lines** by removing all legacy code that became orphaned after the modular pipeline was introduced.

Removed:
- `RECO_BLOCK_RE` constant and `extractRecommendedPosts` function (moved to `recommendationExtractor.js` in the previous refactor; the copy in the service was never called)
- `createTools` factory function — the full LangChain `tool()`-based implementation including `get_my_bookmarks`, `get_popular_games`, `search_games_by_tag`, `get_user_stats`, and the legacy `search_web` tool wrapper
- `_legacyAskAIAgent` function (~250 lines) — the original monolithic Gemini call loop that `askAIAgent` previously delegated to; now replaced entirely by `runPipeline`

Kept (all 5 public exports still present):
- `geminiHealthTest` — lightweight API key / model verification
- `askAIAgent` → delegates to `runPipeline`
- `clearAIHistory`, `getAIHistory` — history management for the frontend
- `warmUpAIAgent` — optional pre-warm on server start

### `aiPipeline.js` — User Memory Wired End-to-End

The `userMemoryService` is now fully integrated into the pipeline:

```js
// Step 1 — all four values fetched in parallel
const [historyRecords, userTurnCount, userMemory, userMemoryContext] = await Promise.all([
  loadHistory(userId),
  getUserTurnCount(userId),
  loadUserMemory(userId),
  buildUserMemoryContext(userId).catch(() => ''),
]);
// Fire-and-forget: persist any explicit preferences stated in this message
saveExplicitPreferences(userId, message).catch(() => {});
```

`userMemoryContext` is then passed through to:
- `generateAnswer({ …, userMemoryContext })` — Step 4
- `generateReflection({ …, userMemoryContext })` — Step 5 reflection pass

This means the user's long-term preference profile (liked genres, avoided games, platform preferences) is injected into **every** Gemini prompt, including reflection corrections.

### `answerAgent.js` — Enhanced System Prompt

`buildSystemPrompt` now includes six explicit behavioural rules:

1. Do not invent game titles not present in the provided data
2. Base all recommendations only on platform data, never on training knowledge
3. If platform data is empty, tell the user and suggest they add posts
4. Format lists with bullet points or numbered items
5. If the user states a preference, acknowledge and use it
6. Do not hallucinate user bookmarks, likes, or statistics

When `userMemoryContext` is non-empty, it is injected between the rules and the platform data block:

```
[User preference profile]
…
Use the profile above to personalise your reply. Only recommend games present in the platform data.

--- Platform Data ---
…
--- End Platform Data ---
```

### `platformTools.js` — Web Search Properly Wired

The `searchWeb` function now lives in `platformTools.js` (not in the deleted `createTools` factory) and is called directly by `fetchDataForIntent`:

```js
case INTENTS.GENERAL_CHAT:
default:
  if (process.env.TAVILY_API_KEY && userMessage.trim()) {
    return await searchWeb(userMessage, userId).catch(() => '');
  }
  return '';
```

Rate limiter configuration (in-memory, resets on server restart):
- Global: 30 calls / day
- Per-user: 3 calls / hour

### README Rewrite

The README was rewritten for a recruiter / HR audience:
- Added plain-language project summary
- Replaced the incorrect "multi-agent" label with the accurate "6-step sequential pipeline"
- Added a text-based architecture diagram showing all pipeline steps
- Replaced the verbose bullet-point portfolio section with a skill → implementation table

---

## [Current] — AI Agent Pipeline Overhaul

### Modular 6-Step AI Pipeline

The AI Agent was refactored from a monolithic service into a modular pipeline (`packages/auth-service/ai/`):

| Step | Module | Purpose |
|---|---|---|
| 0 | `aiPipeline.js` | Greeting fast-path — returns immediately for `hi`, `hello`, `你好`, etc. |
| 1 | `conversationManager.js` | Load history, count turns, load `UserMemory` (summary + tracked topics) |
| 2 | `routerAgent.js` | Classify intent via keyword patterns (no Gemini call) |
| 3 | `platformTools.js` | Fetch DB data relevant to the intent |
| 4 | `answerAgent.js` | Call Gemini with context + platform data |
| 4b | `recommendationExtractor.js` | Strip `<!--RECOMMENDATIONS:[…]-->` block, enrich with DB data |
| 5 | `validatorAgent.js` | Evaluate grounding/hallucinations/safety; run reflection pass if needed |
| 6 | `conversationManager.js` | Save exchange; trigger 5-turn summary into `UserMemory` |

### Greeting Fast-Path

Simple greetings (`hi`, `hello`, `hey`, `你好`, etc.) bypass the full pipeline and return immediately without a Gemini call. This avoids API quota usage and reduces response latency for common openers.

### `recommendedPosts` Extraction

Each Gemini response may embed a machine-readable block at the end of the answer text:

```
<!--RECOMMENDATIONS:[{"title":"...", "reason":"...", "confidence":0.95, "matchedTags":["..."]}]-->
```

The pipeline strips this block from the visible answer, enriches each entry with real DB data (rating, likes, tags), and filters out any titles not found in MongoDB — preventing hallucinated recommendations from reaching the frontend.

### Context Management and `UserMemory`

- Every 5 user turns, a rolling plain-text summary is saved to the `UserMemory` MongoDB model (per-user)
- On subsequent turns, the summary + tracked genre topics are prepended to the Gemini context window
- This keeps long conversations coherent without sending the full message history every turn
- `UserMemory` fields: `conversationSummary` (String), `trackedTopics` ([String]), `totalTurnCount` (Number)

### Evaluation and Reflection Loop

The validator runs two quality layers after every Gemini call:

1. **Structural validation** — checks the answer is a non-empty string (sync, no DB cost)
2. **Semantic evaluation** — checks grounding score, hallucinations, and safety flags

If issues are detected (`hallucinations.length > 0` or `safetyPassed === false`), a one-pass reflection is triggered: the bad answer and flag list are sent back to Gemini for a corrected response. The final result includes a `wasReflected` flag.

Example evaluation object returned to the frontend:

```json
{
  "groundingScore": 0.85,
  "hallucinations": [],
  "safetyPassed": true,
  "recommendedPostsValid": true,
  "wasReflected": false,
  "flags": []
}
```

### AI Mock Mode (`AI_MOCK_MODE`)

`AI_MOCK_MODE=true` skips all Gemini calls and returns deterministic intent-based mock responses. Useful during local development when the free-tier API quota is exhausted.

| Behaviour | Mock mode | Real mode |
|---|---|---|
| Gemini API calls | Skipped entirely | Normal |
| `GOOGLE_API_KEY` required | No | Yes |
| `recommendedPosts` in response | Yes (pre-defined) | Yes (from Gemini) |
| Memory + evaluation + reflection | All pipeline steps run | All pipeline steps run |
| Greeting fast-path | Still works | Still works |
| Responses vary per message | Fixed per intent | Dynamic |

```bash
npm run dev:auth:mock   # enable mock mode (from project root)
npm run dev:auth:real   # real Gemini mode (from project root)
```

> **Note:** Never set `AI_MOCK_MODE=true` in a production environment.

### Test Results

| Suite | Result | Command |
|---|---|---|
| Frontend — Vitest + React Testing Library | 70 / 70 pass | `npm test --workspace @apps/auth-frontend` |
| Backend — mock mode unit tests (Node `node:test`) | 17 / 17 pass | `npm test --workspace @services/auth` |
| Backend — pipeline integration tests (Node `node:test`) | 15 / 15 pass | `npm test --workspace @services/auth` |

---

## AI Quality Checks

The backend evaluates every AI response before it reaches the frontend.

| Check | Purpose |
|---|---|
| Grounding check | Verifies whether the answer references real platform game titles |
| Recommendation validation | Checks whether recommended posts exist in MongoDB |
| Unsupported title detection | Flags game titles not found in the database |
| Safety check | Flags unsafe or off-topic content |
| Reflection pass | One correction attempt when issues are found |

---

## Backend Data Retrieval (`platformTools.js`)

The pipeline fetches platform data in Step 3 via intent-routed functions in `platformTools.js`. Each function queries MongoDB directly — no LangChain tool-calling involved.

| Function | Intent | Purpose |
|---|---|---|
| `getMyBookmarks(userId)` | `bookmark_analysis` | User's bookmarked games |
| `getMostLikedPosts(limit)` | `community_summary` | Most-liked community posts |
| `getTopRatedGames(limit)` | `leaderboard_query` | Highest-rated games |
| `getMyBookmarks` + `getMostLikedPosts` | `game_recommendation` | Combined bookmark + community data |
| `searchWeb(query, userId)` | `general_chat` | Tavily web search (if `TAVILY_API_KEY` set) |

> **Note:** The previous LangChain `tool()`-based `createTools` factory (`get_my_bookmarks`, `get_popular_games`, `search_games_by_tag`, `get_user_stats`) was removed in the [2026-05-26] cleanup. Data retrieval is now handled by direct function calls.

---

## User Preference Memory

The AI Agent can personalise recommendations using:

- Explicit preferences stated by the user in conversation
- Liked genres, avoided genres, preferred platforms
- Bookmarked games
- Recent conversation history and 5-turn rolling summaries (via `UserMemory` model)

---

## Optional Web Search

When `TAVILY_API_KEY` is configured, the AI Agent can use web search for information not in the platform database (release dates, system requirements, recent news).

Built-in rate limiting: 30 searches per day (global), 3 searches per hour per user — protects the free-tier Tavily quota.

If no Tavily key is set, the platform works normally using only database-backed tools.

---

## Feature Branch History

| Branch | Purpose |
|---|---|
| `feature/agent-update` | Modular 6-step AI pipeline, context management, UserMemory, evaluation + reflection (70/70 tests) |
| `feature/rag-recommendation-engine` | Adds structured AI recommendation output |
| `feature/ai-tool-calling` | Allows the AI Agent to call backend data tools |
| `feature/ai-evaluation` | Adds rule-based response quality checks |
| `feature/ai-user-memory` | Adds user preference memory and personalized recommendations |
| `feature/agent-planning` | Adds one-pass reflection and correction flow |
| `feature/web-search-tool` | Adds optional Tavily-powered web search |
| `hallucination-reduce` | Improves recommendation grounding and unsupported-title filtering |

---

## Future Improvements

Planned:

- Add live deployment
- Add demo video and screenshots
- Improve UI polish and responsive layout
- Add seed data for easier local testing
- Add automated tests for GraphQL resolvers
- Improve authentication flow with HTTP-only cookies
- Add admin dashboard for monitoring AI response quality

---

## How to add a new entry

When a new feature, fix, or change is merged to `main`:

1. Add a new `## [YYYY-MM-DD] — Short title` section at the top of this file (below the intro)
2. Use `###` subsections for individual features or fixes within that version
3. Keep the entry focused: what changed, why it matters, and any config or API changes
4. Do not duplicate content already in the code comments — link to the relevant file instead
