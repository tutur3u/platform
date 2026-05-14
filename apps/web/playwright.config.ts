import { defineConfig, devices } from '@playwright/test';

const BASE_URL = process.env.BASE_URL || 'http://localhost:7803';

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  // Keep workers single-process per shard because auth/rate-limit tests mutate
  // the same local Supabase seed data. CI parallelism is handled with shards.
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI ? 'blob' : 'html',

  // Turbopack compiles pages on-demand. First visit to any route triggers
  // compilation that can take 30-60s on a cold dev server.
  timeout: 60_000,
  expect: { timeout: 15_000 },

  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    navigationTimeout: 60_000,
  },

  projects: [
    // Auth setup — runs once, creates storageState for authenticated tests
    { name: 'setup', testMatch: /auth\.setup\.ts/, timeout: 120_000 },

    // Unauthenticated tests (login page, redirects, bearer-token API checks).
    {
      name: 'chromium-no-auth',
      use: { ...devices['Desktop Chrome'] },
      testMatch: /.*\.noauth\.spec\.ts/,
    },

    // Authenticated tests (most tests)
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'e2e/.auth/user.json',
      },
      dependencies: ['setup'],
      testIgnore: /.*\.noauth\.spec\.ts/,
    },
  ],
});
