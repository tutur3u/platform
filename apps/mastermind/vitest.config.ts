import { defineConfig } from 'vite-plus';
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/native/**/*.test.ts'],
    maxWorkers: 1,
  },
});
