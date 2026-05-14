import { defineConfig, devices } from '@playwright/test';
import {
  assertLocalHiveE2EEnvironment,
  HIVE_BASE_URL,
} from './e2e/helpers/constants';

assertLocalHiveE2EEnvironment();

export default defineConfig({
  testDir: './e2e',
  expect: { timeout: 15_000 },
  forbidOnly: !!process.env.CI,
  fullyParallel: false,
  reporter: process.env.CI ? 'blob' : 'html',
  retries: process.env.CI ? 2 : 0,
  timeout: 60_000,
  use: {
    baseURL: HIVE_BASE_URL,
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
