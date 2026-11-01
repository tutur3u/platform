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
      'src/native/**/*.test.{ts,tsx}',
      'src/lib/**/*.test.ts',
      'cloudflare/**/*.test.ts',
    ],
    maxWorkers: 1,
  },
});
