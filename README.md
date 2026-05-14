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
- Secure server-side API key handling
- Monorepo / modular project structure with npm workspaces
