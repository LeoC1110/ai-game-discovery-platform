# AI-Powered Game Discovery Community Platform

A full-stack game discovery platform where users can share game recommendations, browse community posts, interact through likes, comments, and bookmarks, and receive personalized suggestions from an AI Game Agent.

The project combines a community web application with an AI assistant that can read platform data, call backend tools, and generate recommendations based on real user activity.

---

## Demo Preview

> Screenshots or a short demo video can be added here.

<!-- Replace these with real screenshots after you add them to the repo -->

![Community Feed](./docs/screenshots/community-feed.png)
![AI Game Agent](./docs/screenshots/ai-agent.png)
![Recommendation Result](./docs/screenshots/recommendation-result.png)

Demo video: Coming soon  
Live demo: Coming soon

---

## Key Features

### Community Platform

- User registration and login
- Player and Admin role support
- Create, edit, and delete game recommendation posts
- Add game details such as genre, platform, developer, rating, tags, cover image, game link, and review
- Browse community posts
- Like, comment, and bookmark posts
- View saved games and user activity from the profile page
- Leaderboard for top-rated games, most-liked posts, and active contributors

### AI Game Agent

Built a memory-based multi-agent AI pipeline with context management, conversation summarization, recommendation extraction, and response evaluation.

The AI Agent helps users discover games and understand community activity. It can:

- Recommend games based on user bookmarks and platform activity via a modular 6-step pipeline
- Classify intent (bookmarks, leaderboard, community, game recommendations, general chat) without a Gemini call
- Extract and enrich structured `recommendedPosts` from every AI response
- Skip Gemini entirely for simple greetings (fast-path)
- Maintain per-user conversation context with topic tracking and rolling 5-turn summaries stored in `UserMemory`
- Evaluate each response for grounding, hallucinations, and safety — and run a one-pass reflection correction when issues are detected
- Search community posts by genre or tag
- Use optional web search for game information not stored in the platform

The AI Agent is powered by LangChain and Google Gemini. All API keys are handled server-side — never exposed to the frontend.

See [CHANGELOG.md](./CHANGELOG.md) for a detailed breakdown of the pipeline architecture, evaluation logic, and update history.

---

## Tech Stack

| Layer | Technologies |
|---|---|
| Frontend | React, Vite, Apollo Client |
| Backend | Node.js, GraphQL, Apollo Server |
| Database | MongoDB, Mongoose |
| Authentication | JWT, bcrypt |
| AI / LLM | LangChain, Google Gemini API |
| External API | Tavily Search API |
| Architecture | Monorepo, npm workspaces |

---

## Project Structure

```txt
apps/
  auth-frontend/        # Main platform frontend
                        # Auth, dashboard, posts, community,
                        # bookmarks, AI agent, profile, leaderboard

  progress-frontend/    # Secondary frontend module
                        # Progress and leaderboard-related views

packages/
  auth-service/         # Main backend API service
                        # GraphQL API, MongoDB models, JWT auth,
                        # community features, AI agent integration

  progress-service/     # Progress-related backend service
                        # Experience and achievement features

shared/
  jwt/
    index.js            # Shared JWT sign/verify helper
```

> **Note:** Some folder names such as `auth-frontend` and `auth-service` are from the original monorepo scaffold. They act as the main platform frontend and backend service.

---

## AI Mock Mode

When the Gemini free-tier quota is exhausted, run with `AI_MOCK_MODE=true` to skip all Gemini calls and return deterministic responses for local testing.

```bash
npm run dev:auth:mock   # mock mode — no Gemini calls
npm run dev:auth:real   # real Gemini mode
```

See [CHANGELOG.md](./CHANGELOG.md) for full mock mode documentation and behaviour details.

---

## Quick Start

### 1. Clone the repository

```bash
git clone https://github.com/LeoC1110/ai-game-discovery-platform.git
cd ai-game-discovery-platform
```

### 2. Install dependencies

```bash
npm install
```

### 3. Set up environment variables

Create `.env` files based on the provided `.env.example` files.

Example for `packages/auth-service/.env`:

```env
MONGODB_URI=your_mongodb_uri_here
JWT_SECRET=your_jwt_secret_here
GOOGLE_API_KEY=your_gemini_api_key_here
AI_MODEL=gemini-2.5-flash-lite
AI_MAX_HISTORY_MESSAGES=10
AI_MAX_PLATFORM_POSTS=10
PORT=4001

# Optional: enables web search tool
TAVILY_API_KEY=your_tavily_api_key_here
```

### 4. Start MongoDB

Use either a local MongoDB instance or MongoDB Atlas.

Default local connection: `mongodb://localhost:27017`

### 5. Run the backend and frontend

Start each service in a separate terminal.

```bash
# Main backend service
npm run dev:auth

# Main platform frontend
npm run dev:auth-frontend

# Optional progress backend
npm run dev:progress

# Optional progress frontend
npm run dev:progress-frontend
```

**Default Local URLs:**

| App | URL |
|---|---|
| Platform frontend | http://localhost:5173 |
| Platform GraphQL service | http://localhost:4001/graphql |
| Progress GraphQL service | http://localhost:4002/graphql |

---

## Example AI Prompts

After logging in, users can try prompts such as:

- Recommend games based on my bookmarks.
- What are the most liked games right now?
- Find multiplayer strategy games.
- Summarize my platform activity.
- What should I play next?

---

## Security Notes

- Real `.env` files are not committed
- API keys and secrets are loaded server-side only
- Gemini API calls are made from the backend, not the frontend
- `.env.example` files only contain placeholder values
- `node_modules/` and build output folders are excluded from version control
- User conversation history is stored in MongoDB and is not committed to the repository
- Passwords are hashed with bcrypt
- JWT is used for authentication and role-based access control

> **Note:** If JWT is stored in `localStorage`, consider moving to HTTP-only cookies in a future iteration to reduce XSS exposure.

---

## Testing

| Suite | Result | Command |
|---|---|---|
| Frontend — Vitest + React Testing Library | 70 / 70 pass | `npm test --workspace @apps/auth-frontend` |
| Backend — mock mode unit tests (`node:test`) | 17 / 17 pass | `npm test --workspace @services/auth` |
| Backend — pipeline integration tests (`node:test`) | 15 / 15 pass | `npm test --workspace @services/auth` |

---

## Portfolio Purpose

This project demonstrates:

- Full-stack web development with React and Node.js
- GraphQL API design with Apollo Server
- MongoDB data modeling with Mongoose
- JWT authentication and role-based access control
- Community platform features such as posts, likes, comments, and bookmarks
- AI integration using LangChain and Google Gemini
- Modular multi-step AI agent pipeline with intent routing, context management, and per-user memory
- Conversation summarization and rolling context window via `UserMemory` model
- Structured recommendation extraction from AI output with DB-backed hallucination filtering
- Response evaluation and one-pass reflection loop (`wasReflected` flag)
- Backend tool calling for AI-assisted recommendations
- Rule-based AI response evaluation
- Optional external API integration with Tavily Search
- Secure server-side API key handling
- Monorepo project organization with npm workspaces
- 70/70 frontend tests + 32/32 backend tests (mock mode unit tests + pipeline integration tests)

---

## Changelog

See [CHANGELOG.md](./CHANGELOG.md) for:

- AI Agent pipeline architecture and all recent updates
- AI quality checks and evaluation details
- Backend tool calling and web search
- Feature branch history
- Planned future improvements
