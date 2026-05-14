import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import federation from '@originjs/vite-plugin-federation';

export default defineConfig({
  plugins: [
    react(),
    federation({
      name: 'progress_frontend',
      filename: 'remoteEntry.js',
      remotes: {
        auth_frontend: 'http://localhost:5173/assets/remoteEntry.js',
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
});
