import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    include: ['src/frontend/**/*.test.tsx'],
    setupFiles: ['src/frontend/tests/setup.ts'],
    css: true,
  },
});
