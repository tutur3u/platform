import { defineConfig, devices } from '@playwright/test';

/**
 * Opt-in workspace home performance adapter (e2e/perf). PERF_TARGET=app uses
 * the running app at BASE_URL with the authenticated storage state from
 * playwright.config.ts setup; PERF_TARGET=fixture uses the standalone
 * dashboard fixture. One worker, no retries, one browser for both commits.
 */
const fixture = process.env.PERF_TARGET === 'fixture';

export default defineConfig({
  testDir: './e2e/perf',
  testMatch: 'workspace-dashboard-perf.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: Boolean(process.env.CI),
  use: {
    ...devices['Desktop Chrome'],
    baseURL: fixture
      ? (process.env.WORKSPACE_DASHBOARD_FIXTURE_URL ?? 'http://127.0.0.1:5201')
      : (process.env.BASE_URL ?? 'https://tuturuuu.localhost'),
    ignoreHTTPSErrors: true,
    storageState: fixture ? undefined : 'e2e/.auth/user.json',
    trace: 'off',
  },
});
