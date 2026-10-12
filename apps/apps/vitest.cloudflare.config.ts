import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite-plus';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    include: ['cloudflare/**/*.test.ts', 'src/portable/**/*.test.tsx'],
    maxWorkers: 1,
  },
});
