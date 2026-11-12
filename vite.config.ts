import { defineConfig } from 'vite';

export default defineConfig({
  esbuild: { jsx: 'automatic' },
  server: {
    host: '127.0.0.1',
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
