import { defineConfig, devices } from '@playwright/test';

/** Standalone workspace dashboard fixture (no auth, database or network). */
export default defineConfig({
  testDir: './e2e',
  testMatch: 'workspace-dashboard-layout.fixture.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: Boolean(process.env.CI),
  use: {
    ...devices['Desktop Chrome'],
    baseURL:
      process.env.WORKSPACE_DASHBOARD_FIXTURE_URL ?? 'http://127.0.0.1:5201',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
});
