# AI-Powered Game Discovery Platform

A deployed full-stack platform for game discovery, community posts, saved favorites, community trends, and AI-powered recommendations through Nova.

**Live Demo:** https://game-discovery-auth.up.railway.app/
**Demo Account:** [demo@example.com](mailto:demo@example.com) / Demo123!
**Tech Stack:** React, Node.js, GraphQL, MongoDB Atlas, JWT, LangChain, Google Gemini, Vitest, React Testing Library

## Overview

This project is a product-style full-stack web application built for portfolio review. Users can sign in, create game posts, share ideas, bookmark games, explore community activity, manage their profile, and ask Nova for AI-powered game recommendations.

The project demonstrates full-stack development, GraphQL API design, MongoDB data modeling, authentication, AI integration, automated testing, and production-readiness improvements such as pagination, rate limiting, input validation, safe logging, Error Boundary, and route-level code splitting.

## Key Features

### Game Community

Create and browse game recommendations with genre, platform, rating, tags, cover image, and review.

### Share an Idea

Post quick text-based ideas or discussions for the community.

### Bookmarks

Save game posts and manage saved recommendations in one place.

### Community Trends

View popular game posts and active community content based on engagement.

### Nova AI Assistant

Ask Nova for game recommendations, community insights, bookmark-based suggestions, and platform-aware answers.

### Account Features

Includes sign in, account creation, protected pages, password reset with email verification code, and logged-in password change from My Profile.

## Recent Updates (June 2026)

* Community rating UX was simplified on post cards with a single Avg Rating display and inline rating interaction for non-authors.
* Author rating is now required when creating game posts, while community rating remains the primary score signal for trends and recommendations.
* Rating permissions and behavior were tightened: post authors cannot rate their own posts, and users can update their single rating per post.
* Nova chat reliability was improved to reduce transient message inconsistencies and preserve recommendation cards after history sync.
* AI pipeline efficiency was improved with lighter recommendation enrichment queries and short-lived caching for known-title validation.

## Nova AI Assistant

Nova is a platform-aware AI assistant that uses user activity, bookmarks, community posts, and platform data to support game discovery.

Pipeline:

User Message
→ Intent Routing
→ Platform Data Retrieval
→ Gemini Response Generation
→ Safety and Hallucination Check
→ Reflection
→ Final Answer

Nova includes input validation, safe logging, rate limiting, mock mode testing, and response quality checks to make the AI feature safer and easier to test.

## Tech Stack

| Layer          | Technologies                                     |
| -------------- | ------------------------------------------------ |
| Frontend       | React, Vite, Apollo Client                       |
| Backend        | Node.js, Apollo Server, GraphQL                  |
| Database       | MongoDB Atlas, Mongoose                          |
| Authentication | JWT, bcrypt                                      |
| AI             | LangChain, Google Gemini                         |
| Testing        | Vitest, React Testing Library, Node.js node:test |
| Deployment     | Railway                                          |
| Architecture   | npm workspaces, modular services                 |

## Testing

The project includes 100+ automated frontend and backend tests covering:

* Login and registration
* Forgot password and password reset flow
* Protected routes
* UI behavior
* GraphQL API logic
* AI assistant workflows
* Input validation
* Edge cases and regression scenarios

Example commands:

```bash
npm test --workspace @apps/auth-frontend
npm test --workspace @services/auth
```

## Security and Production Readiness

Implemented improvements include:

* Password hashing with bcrypt
* Password reset with email verification code
* Hashed verification codes
* 10-minute code expiration
* 60-second resend cooldown
* Maximum 5 wrong verification attempts
* Rate limiting for authentication, password reset, GraphQL, and AI requests
* AI input validation with 1000-character limit
* Sensitive production log cleanup
* Server-side API key usage
* Pagination for list-based queries
* React Error Boundary
* Route-level code splitting with React.lazy
* Basic backend query optimization

## Future Improvements

* Migrate JWT storage from localStorage to httpOnly cookies
* Add Redis caching for high-frequency read data and distributed rate limiting
* Add TypeScript for stronger type safety
* Add admin moderation tools for demo content cleanup
* Expand Nova with deeper platform-data recommendations

