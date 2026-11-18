import { copyFile } from 'node:fs/promises';
import { defineConfig } from 'vite';

export default defineConfig({
  esbuild: { jsx: 'automatic' },
  plugins: [
  ],
  server: {
    host: '127.0.0.1',
    watch: {
      usePolling: process.env.DEV_POLLING === 'true',
      interval: 500,
      binaryInterval: 1000,
      ignored: [
        '**/.venv/**',
        '**/.uv-cache/**',
        '**/__pycache__/**',
        '**/server/**',
        '**/dist-server/**',
        '**/coverage/**',
        '**/.docker-local/**',
        '**/.deploy/**',
        '**/.sites-local/**',
      ],
    },
    proxy: {
      '/api': process.env.API_PROXY_TARGET ?? 'http://127.0.0.1:3001',
      '/signal': {
        target: process.env.API_PROXY_TARGET ?? 'http://127.0.0.1:3001',
        ws: true,
      },
    },
    allowedHosts: ['appraisable-brandy-favouredly.ngrok-free.dev'],
  },
  optimizeDeps: { entries: ['index.html'] },
  build: {
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          canvas: ['konva', 'react-konva'],
          collaboration: ['yjs'],
        },
      },
    },
  },
});
