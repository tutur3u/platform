import { defineConfig, devices } from '@playwright/test';

/**
 * Turnstile lifecycle in WebKit (Desktop Safari and iOS) against Cloudflare's
 * public test site keys. The harness page is served by route interception,
 * so no application server is needed; the challenge itself loads from
 * Cloudflare.
 */
export default defineConfig({
  testDir: './e2e',
  testMatch: 'turnstile-safari.webkit.fixture.ts',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  forbidOnly: Boolean(process.env.CI),
  timeout: 90_000,
  use: { trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [
    { name: 'webkit-desktop', use: { ...devices['Desktop Safari'] } },
    { name: 'webkit-iphone', use: { ...devices['iPhone 15'] } },
  ],
});
