import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  testMatch: [
    'meet-activities-ux.fixture.ts',
    'meet-presence-activities.fixture.ts',
  ],
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: Boolean(process.env.CI),
  use: {
    ...devices['Desktop Chrome'],
    baseURL: process.env.MEET_ACTIVITIES_FIXTURE_URL ?? 'http://127.0.0.1:5213',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
});
