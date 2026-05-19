# AI-Powered Game Discovery Community Platform

A full-stack game discovery community platform where users can post game recommendations, browse community content, interact through likes, comments, and bookmarks, and get personalised suggestions from an AI Game Agent powered by LangChain and Google Gemini.

---

## Overview

This platform brings together a community of gamers who share and discover games through user-created posts. Key capabilities include:

- **User authentication** with JWT and role-based access (Player / Admin)
- **Game recommendation posts** with rich metadata — genre, platform, developer, rating, tags, cover image, and review
- **Community browsing** with likes, comments, and bookmarks
- **User profiles** displaying posts, activity, and saved games
- **Leaderboard** tracking top-rated games, most-liked posts, and active contributors
- **AI Game Agent** that reads live platform data from MongoDB and provides game recommendations and community insights via LangChain and Google Gemini
- **Conversation history** persisted in MongoDB per user

---

## Tech Stack

| Layer | Technologies |
|---|---|
| Frontend | React, Vite |
| Backend | Node.js, GraphQL (Apollo Server) |
| Database | MongoDB (Mongoose) |
| Authentication | JWT |
| AI | LangChain, Google Gemini API |
| Architecture | Monorepo, modular full-stack structure |

---

## Core Features

### Authentication
- Register and login with hashed passwords
- JWT stored in `localStorage` and as an HTTP cookie
- Player and Admin role support

### Game Posts
- Create game recommendation posts with title, genre, platform, developer, rating, tags, cover image, game link, and written review
- Edit and delete your own posts

### Community
- Browse all game recommendation posts
- Like, comment, and bookmark posts
- Comments display username, content, timestamp, and like count

### Bookmarks
- Save games/posts from the community feed
- View and manage your saved games from your profile

### My Profile
- View account information and statistics
- See your posts, comments, likes, and bookmarked games in one place

### Leaderboard
- Top-rated games by community score
- Most-liked posts
- Most active contributors

### AI Game Agent
- Powered by **LangChain** and **Google Gemini**
- Reads live platform context from MongoDB — posts, ratings, tags, bookmarks, likes, and comments
- Answers natural-language questions and provides personalised recommendations
- **Five tools** available at runtime: `get_my_bookmarks`, `get_popular_games`, `search_games_by_tag`, `get_user_stats`, and `search_web` (Tavily, optional)
- **Reflection loop** — if evaluation detects hallucinations or unsafe content, the agent automatically issues a self-correction pass before returning the answer
- **Web search** (when `TAVILY_API_KEY` is set) lets the agent look up release dates, system requirements, and news not in the platform — rate-limited to protect the free tier
- Conversation history stored per user in MongoDB
- API key is **never** exposed to the frontend — all Gemini calls happen server-side

---

## Project Structure

```
apps/
  auth-frontend/        # Main platform frontend
                        # Covers: auth, dashboard, posts, community,
                        #         bookmarks, AI agent, profile, leaderboard
  progress-frontend/    # Secondary frontend module (progress & leaderboard views)

packages/
  auth-service/         # Main backend API service
                        # Covers: GraphQL API, MongoDB models, JWT auth,
                        #         community features, AI agent integration
  progress-service/     # Progress-related backend service (experience, achievements)

shared/
  jwt/
    index.js            # Shared JWT sign/verify helper used by both services
```

> **Note:** Some folder names such as `auth-frontend` and `auth-service` are kept for compatibility with the original monorepo scaffold. In the current version they serve as the **main platform frontend** and **main backend service** respectively.

---

## Environment Variables

Real `.env` files are **not committed** to this repository. Each service reads its own `.env` at startup. A `.env.example` file is provided with placeholder values only.

**Example (`packages/auth-service/.env`):**

```env
MONGODB_URI=your_mongodb_uri_here
JWT_SECRET=your_jwt_secret_here
GOOGLE_API_KEY=your_gemini_api_key_here
AI_MODEL=gemini-2.5-flash-lite
AI_MAX_HISTORY_MESSAGES=10
AI_MAX_PLATFORM_POSTS=10
PORT=4001
```

- `GOOGLE_API_KEY` must remain **server-side only** — the frontend never calls Gemini directly.
- `.env.example` contains placeholder strings and is safe to commit.

---

## Installation

Install all workspace dependencies (services, frontends, and shared modules) from the repo root:

```bash
npm install
```

---

## Development

Start each service and frontend in a separate terminal:

```bash
# Main backend service (GraphQL, auth, AI agent)
npm run dev:auth

# Main platform frontend
npm run dev:auth-frontend

# Progress backend service (optional)
npm run dev:progress

# Progress frontend (optional)
npm run dev:progress-frontend
```

**Default URLs:**

| App | URL |
|---|---|
| Platform frontend | http://localhost:5173 |
| Platform GraphQL service | http://localhost:4001/graphql |
| Progress GraphQL service | http://localhost:4002/graphql |

> Make sure MongoDB is running before starting any service (default: `mongodb://localhost:27017`).

---

## AI Game Agent — Example Prompts

The AI Agent is accessible from the platform frontend after logging in. Try prompts such as:

- *Recommend games based on my bookmarks.*
- *Summarise the most liked community posts.*
- *What are the top-rated games right now?*
- *Find multiplayer strategy games.*
- *What should I play next?*

The agent reads limited, relevant context from MongoDB on each request and forwards it to Gemini through the backend. **API keys are never sent to or exposed on the frontend.**

---

## Security Notes

- `.env` files are listed in `.gitignore` and are never committed
- All API keys and secrets are loaded server-side only
- `.env.example` files use placeholder strings — no real credentials
- `node_modules/` and build output directories are excluded from version control
- User conversation history is stored in MongoDB and is not committed to the repository
- Frontend communicates with the backend via GraphQL; the backend communicates with Gemini

---

## Portfolio Purpose

This project demonstrates:

- Full-stack web development with React and Node.js
- GraphQL API design with Apollo Server
- MongoDB data modelling with Mongoose
- JWT authentication and role-based access control
- Community platform features (posts, likes, comments, bookmarks)
- AI integration using LangChain and the Google Gemini API
- Agentic ReAct loop with tool calling, self-reflection, and planning
- External API integration (Tavily web search) with in-memory rate limiting
- Hallucination detection and self-correction without extra LLM cost
- Secure server-side API key handling
- Monorepo / modular project structure with npm workspaces

---

## Hallucination Reduction (`hallucination-reduce` branch)

Four vulnerabilities were identified in the AI response pipeline and fixed without any additional LLM calls.

### Vulnerabilities Found & Fixes Applied

| # | Vulnerability | Where | Impact | Fix Applied |
|---|---|---|---|---|
| 1 | Hallucinated titles reach the client via `RECOMMENDATIONS` block | `aiAgentService.js` — `extractRecommendedPosts()` | Client displays invented game cards with no DB backing | **Plan C** — filter out any recommendation whose title has no MongoDB match (`id === null` is dropped) |
| 2 | Detection only scans `**bold**` and `"quoted"` text — misses `*italic*` | `aiEvaluationService.js` — `detectHallucinations()` | Hallucinated names written in italic bypass the checker | Added `*italic*` regex pattern to the candidate extraction loop |
| 3 | System prompt says _"use your general knowledge"_ if platform data is missing | `aiAgentSystemPrompt.js` | AI freely recommends games it knows from training — none of which exist in the platform | **Plan B** — replaced with _"say you don't see it in the platform yet"_ |
| 4 | User memory context is injected with no constraint on data source | `aiAgentSystemPrompt.js` | AI uses preference profile to recommend real-world games outside the platform | Added explicit instruction: _"only recommend games that exist in the platform data below"_ alongside the memory block |

### Before vs After

```
BEFORE                                      AFTER
──────────────────────────────────────────────────────────────────────
System prompt allows "general knowledge"  → Blocked — must use platform data only
User memory has no source constraint      → Constrained to platform titles only
RECOMMENDATIONS block keeps null-id items → Filtered out before client response
detectHallucinations misses *italic* text → italic regex added
Hallucination log is silent on server     → Prominent console.warn with title list
```

### Data Flow After Fixes

```
User message
      ↓
[Plan B] System prompt: platform-only constraint injected
[Plan B] Memory profile: constrained to platform titles
      ↓
Gemini generates answer + RECOMMENDATIONS block
      ↓
extractRecommendedPosts() — DB lookup for every title
[Plan C] Filter: drop recommendations with no DB match
      ↓
evaluateAIResponse() — hallucination scan
[Fix 2]  italic text now included in scan
[Fix 4]  console.warn if hallucinations found in answer text
      ↓
Return { answer, recommendedPosts (verified), evaluation }
```

---

## AI Feature Branches

Four AI capability branches were developed independently and merged into `main`. Each one builds on the previous to make the AI agent smarter and more reliable.

---

### 🧩 feature/rag-recommendation-engine

**What it does:** The AI no longer returns plain text — it now outputs structured game recommendations alongside its answer.

**How it works:**

```
User asks a question
        ↓
Gemini returns answer + a JSON block
        ↓
Server parses the JSON block
        ↓
Response includes: title, reason, confidence %, matched tags
```

**Result:** Every recommendation shows *why* the game was suggested and *how confident* the AI is.

| Field | Example |
|---|---|
| `title` | Hollow Knight |
| `reason` | Matches your interest in challenging platformers |
| `confidence` | 0.92 |
| `matchedTags` | indie, metroidvania, difficult |

---

### 🔧 feature/ai-tool-calling

**What it does:** Gives the AI three real tools it can call to look up live data from the database before answering.

**Tools available:**

| Tool | What it fetches |
|---|---|
| `get_my_bookmarks` | The current user's saved posts |
| `get_popular_games` | Most-liked posts on the platform |
| `search_games_by_tag` | Posts matching a specific tag or genre |

**How it works:**

```
User asks a question
        ↓
AI decides which tool(s) to call
        ↓
Tools query MongoDB and return real data
        ↓
AI uses that data to generate the answer
```

**Result:** The AI answers with *real, up-to-date* content instead of guessing. If you ask "what are the popular games right now?" it actually checks.

---

### 🔍 feature/ai-evaluation

**What it does:** Every AI response is automatically evaluated by a rule-based quality checker before being returned to the user.

**Four checks run on every response:**

```
AI response
    ├── Grounding check      → Is the answer based on real platform data?
    ├── Hallucination check  → Did the AI invent game titles not in the DB?
    ├── Safety check         → Does it contain unsafe or harmful content?
    └── Recommendation check → Do recommended post IDs actually exist?
```

**Result:** The response includes an `evaluation` object:

```json
{
  "groundingScore": 0.85,
  "hallucinations": [],
  "safetyPassed": true,
  "recommendedPostsValid": true,
  "flags": []
}
```

Developers and admins can use this to monitor AI quality over time.

---

### 🧠 feature/ai-user-memory

**What it does:** The AI now remembers who you are across conversations, using four different types of memory.

**Memory layers:**

```
Short-term memory  → Current chat history (last N messages sent to Gemini)
Long-term memory   → Your saved preferences stored in MongoDB (genres, platforms, tone)
Behavioral memory  → Inferred from your likes and bookmarks (computed each request)
Explicit memory    → Preferences you state directly ("I like RPG") — auto-saved
```

**How the profile is built:**

```
You say: "I like strategy games, I avoid horror"
                    ↓
Regex extracts: likedGenres=["strategy"], avoidedGenres=["horror"]
                    ↓
Saved to MongoDB UserPreference document
                    ↓
Next request: profile injected into system prompt
                    ↓
AI tailors recommendations to your profile
```

**User Preference Profile injected into every prompt:**

```
## User Preference Profile
- Likes: strategy, co-op
- Avoids: horror
- Preferred platforms: PC, Switch
- Recommendation tone: short
- Inferred interests (from likes/bookmarks): rpg, indie, turn-based
```

**New GraphQL operations:**

| Operation | Type | Description |
|---|---|---|
| `myPreferences` | Query | View your current stored preference profile |
| `updatePreference` | Mutation | Manually update genres, platforms, or tone |
| `clearPreferences` | Mutation | Reset your preference profile |

---

### 🗂️ feature/agent-planning

**What it does:** Completes the four-module agent architecture (Memory, Tools, Action, Planning) by adding the Planning / Reflection module and expanding the tool set.

**1 — Fixed `get_my_bookmarks` tool description**

Previously the description said only *"fetch the user's bookmarks"*, so Gemini would simply re-list them as recommendations. The description now explicitly tells the agent to:
- Identify the common genres and tags across the bookmarks
- Recommend **different** platform games that share those patterns

**2 — New `get_user_stats` tool**

Returns the user's activity summary directly from MongoDB:

```
User activity on this platform: 5 post(s) created, 8 game(s) bookmarked, 12 post(s) liked.
```

Used for personalised greetings and activity summaries.

**3 — Self-correction reflection loop (Planning module)**

After the main ReAct loop, evaluation runs. If hallucinations or safety issues are found the agent automatically issues one correction pass:

```
ReAct loop → answer
        ↓
evaluateAIResponse()
        ↓
hallucinations OR safetyPassed=false?
        ↓  YES
Reflection pass:
  [system prompt] + [user message] + [bad answer] + [flag list]
        ↓
Gemini produces revised answer
        ↓
Re-extract recommendations + re-evaluate
        ↓
Return final (corrected) answer  •  evaluation.wasReflected = true
```

At most **one** reflection round per request — no recursive loops.

**4 — System prompt improvements**

- Explicit bookmark-discovery rule: *"identify patterns, then recommend different games"*
- `get_user_stats` added to available-tools list
- Preparation rule for `search_web`: *"use only as a last resort"*

**New GraphQL field:**

| Field | Type | Description |
|---|---|---|
| `AIEvaluation.wasReflected` | `Boolean` | `true` if a reflection correction pass fired for this response |

---

### 🌐 feature/web-search-tool

**What it does:** Gives the agent live internet access via the Tavily Search API so it can answer questions about games not yet in the platform database.

**How it works:**

```
User asks: "What are the PC system requirements for Hollow Knight?"
        ↓
Agent checks platform data — not found
        ↓
Agent calls search_web({ query: "Hollow Knight PC minimum system requirements" })
        ↓
Tavily returns top 3 web results (title + snippet + source URL)
        ↓
Agent summarises results in its answer
```

**Rate limiting (free-tier protection):**

| Limit | Value | Resets |
|---|---|---|
| Global daily cap | 30 calls / day | UTC midnight |
| Per-user hourly cap | 3 calls / hour | Rolling 60 minutes |

Limits are enforced entirely in-memory — no extra database table needed. When a limit is reached the tool returns a human-readable message and **no API call is made**.

**Graceful degradation:**

`search_web` is only registered when `TAVILY_API_KEY` is present in `.env`. Without the key the agent runs with its four platform-only tools as normal — no errors, no code changes required.

**Implementation note:** Uses Node.js built-in `fetch` to POST directly to `https://api.tavily.com/search` — **no new npm package** is required.

**Configuration:**

```env
# Optional — enables search_web tool. Free tier: 1 000 searches / month.
# Get your key at: https://app.tavily.com
TAVILY_API_KEY=tvly-xxxxxx
```
