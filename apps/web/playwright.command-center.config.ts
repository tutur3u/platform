import { defineConfig, devices } from '@playwright/test';

// Serve the fixture first:
//   bunx vite --config packages/satellite/fixtures/command-center/vite.config.ts
export default defineConfig({
  testDir: './e2e',
  testMatch: 'command-center.fixture.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: Boolean(process.env.CI),
  use: {
    ...devices['Desktop Chrome'],
    baseURL:
      process.env.COMMAND_CENTER_FIXTURE_URL ?? 'http://127.0.0.1:5198',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
});
