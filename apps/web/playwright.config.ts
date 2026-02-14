import { defineConfig, devices } from '@playwright/test';

const BASE_URL = process.env.BASE_URL || 'http://localhost:7803';

export default defineConfig({
  testDir: './e2e',
  // Run tests sequentially to avoid overwhelming the Turbopack dev server
  // with parallel compilation requests
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

    // Unauthenticated tests (login page, redirects) — run BEFORE authenticated
    // tests so that the login + onboarding pages are pre-compiled
    {
      name: 'chromium-no-auth',
      use: { ...devices['Desktop Chrome'] },
      testMatch: /.*\.noauth\.spec\.ts/,
      dependencies: ['setup'],
    },

    // Authenticated tests (most tests)
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'e2e/.auth/user.json',
      },
      dependencies: ['chromium-no-auth'],
      testIgnore: /.*\.noauth\.spec\.ts/,
    },
  ],

  // Uncomment to auto-start dev server (agents must not run bun dev):
  // webServer: {
  //   command: 'bun dev',
  //   url: BASE_URL,
  //   reuseExistingServer: !process.env.CI,
  //   timeout: 120_000,
  // },
});
