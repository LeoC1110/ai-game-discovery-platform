import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import federation from '@originjs/vite-plugin-federation';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const graphqlUri = env.VITE_GRAPHQL_URI ||
    (mode === 'production'
      ? 'https://progress-service-production-9afc.up.railway.app/graphql'
      : 'http://localhost:4002/graphql');
  const authAppUrl = env.VITE_AUTH_APP_URL ||
    (mode === 'production'
      ? 'https://game-discovery-auth.up.railway.app/'
      : 'http://localhost:5173/');

  return {
  plugins: [
    react(),
    federation({
      name: 'progress_frontend',
      filename: 'remoteEntry.js',
      remotes: {
        auth_frontend:
          process.env.VITE_AUTH_REMOTE_URL ||
          (mode === 'production'
            ? 'https://game-discovery-auth.up.railway.app/assets/remoteEntry.js'
            : 'http://localhost:5173/assets/remoteEntry.js'),
      },
      shared: {
        react: { singleton: true, eager: true },
        'react-dom': { singleton: true, eager: true },
        '@apollo/client': { singleton: true },
        graphql: { singleton: true },
        'react-router-dom': { singleton: true },
      },
    }),
  ],
  server: {
    port: 5174,
  },
  preview: {
    port: 4174,
  },
  build: {
    target: 'esnext',
    modulePreload: false,
    minify: false,
    cssCodeSplit: false,
  },
  define: {
    'import.meta.env.VITE_AUTH_APP_URL': JSON.stringify(authAppUrl),
    'import.meta.env.VITE_GRAPHQL_URI': JSON.stringify(graphqlUri),
  },
};
});
