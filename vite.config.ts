import { copyFile } from 'node:fs/promises';
import { defineConfig } from 'vite';

export default defineConfig({
  esbuild: { jsx: 'automatic' },
  plugins: [
    {
      name: 'distribution-notices',
      apply: 'build',
      async closeBundle() {
        for (const name of ['LICENSE', 'THIRD_PARTY_NOTICES.txt']) {
          await copyFile(name, `dist/${name}`);
        }
      },
    },
  ],
  server: {
    host: '127.0.0.1',
    watch: { usePolling: process.env.DEV_POLLING === 'true' },
    proxy: {
      '/api': 'http://127.0.0.1:3001',
      '/signal': { target: 'ws://127.0.0.1:3001', ws: true },
    },
  },
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
