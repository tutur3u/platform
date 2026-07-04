import { defineConfig, devices } from '@playwright/test';

const baseURL =
  process.env.TANSTACK_WEB_E2E_BASE_URL ??
  process.env.BASE_URL ??
  'https://tanstack.tuturuuu.localhost';

export default defineConfig({
  expect: {
    timeout: 10_000,
  },
  fullyParallel: false,
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  testDir: './e2e',
  timeout: 60_000,
  use: {
    baseURL,
    trace: 'retain-on-failure',
  },
  workers: 1,
});
