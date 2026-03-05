import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],

  // ── Path aliases (matches tsconfig.json paths) ─────────────────────────────
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@components': path.resolve(__dirname, './src/components'),
      '@pages': path.resolve(__dirname, './src/pages'),
      '@store': path.resolve(__dirname, './src/store'),
      '@hooks': path.resolve(__dirname, './src/hooks'),
      '@api': path.resolve(__dirname, './src/api'),
      '@utils': path.resolve(__dirname, './src/utils'),
      '@assets': path.resolve(__dirname, './src/assets'),
    },
  },

  // ── Build target: ES2019 for Android TV WebView compatibility ─────────────
  // Android TV WebViews are often outdated and don't support ES2021 syntax
  // (logical assignment ??=, ||=, &&=) which causes "Unexpected token '='" errors.
  // ES2019 is supported by Chrome 73+ / Android 9+ WebView.
  build: {
    target: ['es2019', 'chrome73'],
  },

  // ── Dev server: proxy API & WebSocket to backend ────────────────────────────
  server: {
    port: 5173,
    host: '0.0.0.0',  // listen on all interfaces → LAN accessible
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/socket.io': {
        target: 'http://localhost:3000',
        ws: true,
        changeOrigin: true,
        configure: (proxy) => {
          proxy.on('error', () => { /* suppress ECONNABORTED noise */ });
        },
      },
    },
  },
});
