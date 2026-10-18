import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';
import { writeChatProcessIdentity } from '../../../database/scripts/chat-initial-settings-qualification.mjs';

writeChatProcessIdentity('config', resolve(import.meta.dirname, '../../../..'));

export default defineConfig({
  root: resolve(import.meta.dirname, '../../../..'),
  tsconfig: resolve(import.meta.dirname, 'tsconfig.chat-initial-settings.json'),
  resolve: { alias: { '@': resolve(import.meta.dirname, '../../src') } },
  test: {
    include: ['apps/web/e2e/fixtures/chat-initial-settings-bridge.test.ts'],
    environment: 'node',
    maxWorkers: 1,
    fileParallelism: false,
    testTimeout: 10000,
  },
});
