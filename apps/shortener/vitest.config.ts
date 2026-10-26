import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite-plus';

export default defineConfig({
  plugins: [react()],
  resolve: {
    conditions: ['bun', 'module', 'node', 'development|production'],
  },
  ssr: {
    resolve: {
      conditions: ['bun', 'module', 'node', 'development|production'],
    },
  },
  test: {
    environment: 'jsdom',
    include: [
      'src/link/**/*.test.ts',
      'src/native/**/*.test.{ts,tsx}',
      'src/components/**/*.test.{ts,tsx}',
    ],
    maxWorkers: 1,
  },
});
