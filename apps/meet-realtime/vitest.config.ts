import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Keep protocol unit tests on the TS runner without loading the Worker plugin.
export default defineConfig({
  test: {
    root: fileURLToPath(new URL('.', import.meta.url)),
    environment: 'node',
    include: ['src/channel-room-erase.test.ts'],
  },
});
