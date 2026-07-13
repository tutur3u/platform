import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig, devices } from '@playwright/test';

const rootEnvFile = resolve(__dirname, '../../.env.local');
if (existsSync(rootEnvFile)) {
  process.loadEnvFile(rootEnvFile);
}

const baseURL = process.env.CONTACTS_E2E_BASE_URL ?? 'http://localhost:7827';

export default defineConfig({
  testDir: './e2e',
  forbidOnly: Boolean(process.env.CI),
  fullyParallel: false,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI ? 'blob' : 'list',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL,
    ignoreHTTPSErrors: true,
    screenshot: 'only-on-failure',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'bun run dev:app',
    env: {
      DOCKER_INTERNAL_SUPABASE_URL: 'http://127.0.0.1:8001',
      NEXT_PUBLIC_SUPABASE_URL:
        process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:8001',
      PORT: '7827',
      SUPABASE_SERVER_URL: 'http://127.0.0.1:8001',
      SUPABASE_URL: 'http://127.0.0.1:8001',
      TUTURUUU_APP_COORDINATION_SECRET:
        process.env.TUTURUUU_APP_COORDINATION_SECRET ??
        'local-e2e-app-coordination-secret',
    },
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    url: baseURL,
  },
});
