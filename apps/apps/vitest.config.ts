import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite-plus';
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    include: ['src/native/**/*.test.{ts,tsx}', 'src/lib/**/*.test.ts'],
    maxWorkers: 1,
  },
});
