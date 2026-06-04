import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import federation from '@originjs/vite-plugin-federation';
// eslint-disable-next-line no-undef
const isTest = process.env.VITEST === 'true' || process.env.NODE_ENV === 'test';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const graphqlUri = env.VITE_GRAPHQL_URI ||
    (mode === 'production'
      ? 'https://auth-service-production-3ff0.up.railway.app/graphql'
      : 'http://localhost:4001/graphql');

  return {
  plugins: [
    react(),
    ...(isTest ? [] : [federation({
      name: 'auth_frontend',
      filename: 'remoteEntry.js',
      exposes: {
        './UserBadge': './src/components/UserBadge.jsx',
      },
      shared: {
        react: { singleton: true, eager: true },
        'react-dom': { singleton: true, eager: true },
        '@apollo/client': { singleton: true },
        graphql: { singleton: true },
        'react-router-dom': { singleton: true },
      },
    })]),
  ],
  server: {
    port: 5173,
  },
  preview: {
    port: 4173,
  },
  build: {
    target: 'esnext',
    modulePreload: false,
    minify: false,
    cssCodeSplit: false,
  },
  define: {
    'import.meta.env.VITE_GRAPHQL_URI': JSON.stringify(graphqlUri),
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.js'],
    css: false,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/screens/**', 'src/components/**'],
    },
  },
  };
});
