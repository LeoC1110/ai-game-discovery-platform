// server.js
// ====== Imports ======
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import cookieParser from 'cookie-parser';

import { ApolloServer } from '@apollo/server';
import { expressMiddleware } from '@as-integrations/express4';

import { typeDefs } from './graphql/schema.js';
import { resolvers } from './graphql/resolvers.js';
import { getUserFromToken } from './middleware/auth.js';
import { createRateLimitMiddleware, getClientIp } from './middleware/rateLimit.js';
import { askAIAgent, warmUpAIAgent } from './services/aiAgentService.js';

// ====== App ======
const app = express();
const isProduction = process.env.NODE_ENV === 'production';

const graphqlGlobalLimiter = createRateLimitMiddleware({
  bucket: 'graphql-global',
  limit: 120,
  windowMs: 60_000,
  keyFn: getClientIp,
});

const aiStreamLimiter = createRateLimitMiddleware({
  bucket: 'ai-stream-global',
  limit: 45,
  windowMs: 60_000,
  keyFn: getClientIp,
});

const AI_MESSAGE_MAX_LENGTH = 1000;

function writeSse(res, event, payload = {}) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function splitIntoTokenChunks(text, chunkSize = 24) {
  if (!text) return [];
  const chunks = [];
  for (let i = 0; i < text.length; i += chunkSize) {
    chunks.push(text.slice(i, i + chunkSize));
  }
  return chunks;
}

// CORS: allow configured origins + local dev defaults
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',')
  : [
      'http://localhost:5173',
      'http://localhost:5174',
      'https://studio.apollographql.com',
    ];

app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'apollo-require-preflight',
    ],
  }),
);

// Common middleware (REST & GraphQL)
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Health check
app.get('/healthz', (_req, res) => res.status(200).json({ ok: true }));

// Redirect root to Apollo Server landing page
app.get('/', (_req, res) => res.redirect('/graphql'));

// Handle favicon.ico requests
app.get('/favicon.ico', (_req, res) => res.status(204).end());

// AI SSE stream endpoint (POST): progress/token/final/done events
app.post('/ai/stream', aiStreamLimiter, async (req, res) => {
  const user = await getUserFromToken(req);
  if (!user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const rawMessage = typeof req.body?.message === 'string' ? req.body.message : '';
  const message = rawMessage.trim();
  if (!message) {
    return res.status(400).json({ error: 'Message cannot be empty' });
  }
  if (message.length > AI_MESSAGE_MAX_LENGTH) {
    return res.status(400).json({ error: `Message is too long (max ${AI_MESSAGE_MAX_LENGTH} characters).` });
  }

  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  if (typeof res.flushHeaders === 'function') {
    res.flushHeaders();
  }

  let closed = false;
  req.on('close', () => {
    closed = true;
  });

  const safeWrite = (event, payload) => {
    if (closed || res.writableEnded) return;
    writeSse(res, event, payload);
  };

  try {
    safeWrite('progress', { step: 'request_received', message: 'Nova is analyzing your request...' });
    safeWrite('progress', { step: 'loading_platform_data', message: 'Nova is loading platform data...' });

    const result = await askAIAgent({
      userId: user._id,
      username: user.username,
      message,
    });

    safeWrite('progress', { step: 'generating_response', message: 'Nova is generating recommendation reasons...' });

    const answer = result?.answer ?? '';
    const tokenChunks = splitIntoTokenChunks(answer);
    for (const chunk of tokenChunks) {
      safeWrite('token', { text: chunk });
    }

    safeWrite('final', {
      answer,
      intent: result?.intent ?? null,
      userTurnCount: result?.userTurnCount ?? null,
      recommendedPosts: result?.recommendedPosts ?? [],
      evaluation: result?.evaluation ?? null,
    });
    safeWrite('done', { ok: true });
  } catch (err) {
    const messageText = err?.message ?? 'AI Agent is unavailable. Please try again later.';
    if (!closed && !res.writableEnded) {
      safeWrite('error', { message: messageText });
      safeWrite('done', { ok: false });
    }
  } finally {
    if (!closed && !res.writableEnded) {
      res.end();
    }
  }
});

// ====== Bootstrap (DB + GraphQL + Server) ======
const { MONGODB_URI, MONGO_URI, PORT = 4001 } = process.env;
const mongoUri = MONGODB_URI ?? MONGO_URI ?? 'mongodb://localhost:27017/auth_service';

async function start() {
  // 1) Connect to MongoDB
  await mongoose.connect(mongoUri);
  console.log('✅ MongoDB connected');
  if (!isProduction) {
    console.log('   Database:', mongoose.connection.name);
  }

  // 2) Start Apollo Server
  const apollo = new ApolloServer({
    typeDefs,
    resolvers,
  });
  await apollo.start();

  // 3) GraphQL middleware
  app.use(
    '/graphql',
    graphqlGlobalLimiter,
    expressMiddleware(apollo, {
      context: async ({ req, res }) => {
        const user = await getUserFromToken(req);
        return { req, res, user };
      },
    }),
  );

  // 4) Start HTTP server
  app.listen(PORT, () => {
    console.log(`🚀 Auth service started on port ${PORT}`);
    if (!isProduction) {
      console.log(`🔧 GraphQL endpoint    -> http://localhost:${PORT}/graphql`);
      console.log('🧪 Apollo Studio Sandbox: https://studio.apollographql.com/sandbox/explorer');
    }

    // Email config diagnostics (never print account values)
    const emailUser = process.env.EMAIL_USER;
    const emailPass = process.env.EMAIL_APP_PASSWORD;
    if (emailUser && emailPass) {
      console.log('📧 Email service configured');
    } else {
      console.warn('⚠️  Email service not configured. Password reset emails may fail.');
    }

    // Optional AI warm-up (controlled by AI_WARMUP_ON_START=true in .env)
    warmUpAIAgent();
  });
}

// Process-level error handling
process.on('unhandledRejection', (reason) => {
  const message = reason instanceof Error ? reason.message : String(reason);
  console.error('UNHANDLED REJECTION:', message);
  if (!isProduction && reason instanceof Error && reason.stack) {
    console.error(reason.stack);
  }
});
process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT EXCEPTION:', err?.message || 'unknown error');
  if (!isProduction && err?.stack) {
    console.error(err.stack);
  }
});

start().catch((err) => {
  console.error('❌ Server bootstrap failed:', err?.message || err);
  process.exit(1);
});
