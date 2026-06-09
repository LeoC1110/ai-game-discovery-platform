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
import { warmUpAIAgent } from './services/aiAgentService.js';

// ====== App ======
const app = express();
const isProduction = process.env.NODE_ENV === 'production';

const graphqlGlobalLimiter = createRateLimitMiddleware({
  bucket: 'graphql-global',
  limit: 120,
  windowMs: 60_000,
  keyFn: getClientIp,
});

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
