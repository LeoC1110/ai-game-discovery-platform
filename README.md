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

The AI Game Agent helps users discover games and understand community activity.

It can:

- Recommend games based on user bookmarks and platform activity
- Search community posts by genre or tag
- Summarize popular games and posts
- Read limited, relevant MongoDB context before answering
- Use optional web search for game information not stored in the platform
- Store conversation history per user

The AI Agent is powered by LangChain and Google Gemini. All AI requests are handled through the backend, so API keys are never exposed to the frontend.

---

## AI Agent Highlights

This project focuses on making the AI assistant more grounded and useful inside a real full-stack application.

### Backend Tool Calling

The AI Agent can call backend tools to fetch real platform data before generating an answer.

Available tools include:

| Tool | Purpose |
|---|---|
| `get_my_bookmarks` | Fetches the current user's bookmarked games |
| `get_popular_games` | Finds popular or highly liked posts |
| `search_games_by_tag` | Searches posts by genre or tag |
| `get_user_stats` | Reads the user's platform activity summary |
| `search_web` | Optional Tavily-powered web search |

Instead of only relying on model knowledge, the agent can use live data from MongoDB.

### Rule-Based Hallucination Reduction

The project includes rule-based checks to reduce unsupported AI recommendations.

For example:

- Recommended game titles are checked against MongoDB records
- Recommendations without a matching database record are filtered out
- AI responses are evaluated for unsupported game titles
- A correction pass can be triggered when the evaluation finds issues

This does not claim to fully solve hallucinations, but it reduces cases where the frontend displays AI-invented recommendation cards.

### User Preference Memory

The AI Agent can use user preference data to personalize recommendations.

It can consider:

- Explicit preferences stated by the user
- Liked genres
- Avoided genres
- Preferred platforms
- Bookmarked games
- Recent conversation history

User preferences and conversation history are stored in MongoDB.

### Optional Web Search

When `TAVILY_API_KEY` is configured, the AI Agent can use web search for information not available in the platform database, such as release dates, system requirements, or recent game news.

The web search tool includes simple in-memory rate limiting to protect free-tier API usage.

If no Tavily key is provided, the platform still works normally with the database-based AI tools.

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

> **Note:** Some folder names such as `auth-frontend` and `auth-service` are kept from the original monorepo scaffold. In the current version, they act as the main platform frontend and backend service.

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

> **Note:** If JWT is stored in `localStorage` in the current implementation, this can be improved in the future by moving toward an HTTP-only cookie flow to reduce exposure to XSS attacks.

---

## AI Quality Checks

The backend includes lightweight evaluation logic before returning AI results.

Current checks include:

| Check | Purpose |
|---|---|
| Grounding check | Verifies whether the answer is based on available platform data |
| Recommendation validation | Checks whether recommended posts exist in MongoDB |
| Unsupported title detection | Looks for game titles that are not backed by platform data |
| Safety check | Flags unsafe or problematic content |
| Reflection pass | Allows one correction attempt if issues are detected |

Example evaluation response:

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

---

## Feature Branch Summary

Several AI-focused branches were developed and merged into the main project.

| Branch | Purpose |
|---|---|
| `feature/rag-recommendation-engine` | Adds structured AI recommendation output |
| `feature/ai-tool-calling` | Allows the AI Agent to call backend data tools |
| `feature/ai-evaluation` | Adds rule-based response quality checks |
| `feature/ai-user-memory` | Adds user preference memory and personalized recommendations |
| `feature/agent-planning` | Adds one-pass reflection and correction flow |
| `feature/web-search-tool` | Adds optional Tavily-powered web search |
| `hallucination-reduce` | Improves recommendation grounding and unsupported-title filtering |

Detailed implementation notes can be moved to the `docs/` folder.

---

## Portfolio Purpose

This project demonstrates:

- Full-stack web development with React and Node.js
- GraphQL API design with Apollo Server
- MongoDB data modeling with Mongoose
- JWT authentication and role-based access control
- Community platform features such as posts, likes, comments, and bookmarks
- AI integration using LangChain and Google Gemini
- Backend tool calling for AI-assisted recommendations
- Rule-based AI response evaluation
- Optional external API integration with Tavily Search
- Secure server-side API key handling
- Monorepo project organization with npm workspaces

---

## Future Improvements

Planned improvements include:

- Add live deployment
- Add demo video and screenshots
- Improve UI polish and responsive layout
- Add seed data for easier local testing
- Add automated tests for GraphQL resolvers
- Improve authentication flow with HTTP-only cookies
- Add admin dashboard for monitoring AI response quality
- Move detailed AI architecture notes into separate documentation files
