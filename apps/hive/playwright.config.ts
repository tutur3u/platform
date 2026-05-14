import { defineConfig, devices } from '@playwright/test';

const BASE_URL = process.env.HIVE_BASE_URL || 'http://localhost:7814';

export default defineConfig({
  testDir: './e2e',
  expect: { timeout: 15_000 },
  forbidOnly: !!process.env.CI,
  fullyParallel: false,
  reporter: process.env.CI ? 'blob' : 'html',
  retries: process.env.CI ? 2 : 0,
  timeout: 60_000,
  use: {
    baseURL: BASE_URL,
    navigationTimeout: 60_000,
    screenshot: 'only-on-failure',
    trace: 'on-first-retry',
  },
  workers: 1,
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  // Local services are intentionally not auto-started here. Agents must not run
  // `bun dev`; start web/Hive services explicitly before running this suite.
});
