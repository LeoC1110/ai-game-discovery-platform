import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import cookieParser from 'cookie-parser';
import { ApolloServer } from '@apollo/server';
import { expressMiddleware } from '@as-integrations/express4';

import { typeDefs } from './graphql/schema.js';
import { resolvers } from './graphql/resolvers.js';
import { getAuthContext } from './middleware/auth.js';

const app = express();

app.use(
  cors({
    origin: [
      'http://localhost:5173',
      'http://localhost:5174',
      'https://studio.apollographql.com',
    ],
    credentials: true,
  }),
);

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.get('/healthz', (_req, res) => res.status(200).json({ ok: true }));
app.get('/', (_req, res) => res.redirect('/graphql'));
app.get('/favicon.ico', (_req, res) => res.status(204).end());

const { MONGODB_URI, MONGO_URI, PORT = 4002 } = process.env;
const mongoUri = MONGODB_URI ?? MONGO_URI ?? 'mongodb://localhost:27017/progress_service';

async function start() {
  await mongoose.connect(mongoUri);
  console.log('✅ MongoDB connected');
  console.log('   Database:', mongoose.connection.name);

  const apollo = new ApolloServer({ typeDefs, resolvers });
  await apollo.start();

  app.use(
    '/graphql',
    expressMiddleware(apollo, {
      context: async ({ req, res }) => ({ req, res, user: getAuthContext(req) }),
    }),
  );

  app.listen(PORT, () => {
    console.log(`🚀 Progress service ready at http://localhost:${PORT}`);
    console.log(`🔧 GraphQL endpoint      -> http://localhost:${PORT}/graphql`);
  });
}

process.on('unhandledRejection', (reason) => {
  console.error('UNHANDLED REJECTION:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT EXCEPTION:', err);
});

start().catch((err) => {
  console.error('❌ Server bootstrap failed:', err?.message || err);
  process.exit(1);
});
