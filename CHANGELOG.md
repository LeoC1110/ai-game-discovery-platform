# Changelog

All notable changes to this project are documented here.
New features and updates should be added under the relevant version or date section below.

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
| Backend — AI mock mode (Node `node:test`) | 17 / 17 pass | `npm test --workspace @services/auth` |

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

## Backend Tool Calling

The AI Agent can call backend tools to fetch real platform data before generating an answer, instead of relying solely on model knowledge.

| Tool | Purpose |
|---|---|
| `get_my_bookmarks` | Fetches the current user's bookmarked games |
| `get_popular_games` | Finds popular or highly liked posts |
| `search_games_by_tag` | Searches posts by genre or tag |
| `get_user_stats` | Reads the user's platform activity summary |
| `search_web` | Optional Tavily-powered web search |

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
