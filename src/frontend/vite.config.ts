import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  root: path.resolve(import.meta.dirname, '.'),
  server: {
    port: Number(process.env.FRONTEND_PORT) || 5173,
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
  build: {
    outDir: path.resolve(import.meta.dirname, '../../dist/frontend'),
  },
});
