import { defineConfig, devices } from '@playwright/test';
import { readRunConfig } from './e2e-upskii-production/policy';

// Refuses to load unless the kill switch and run inputs are present.
const config = readRunConfig(process.env);

export default defineConfig({
  testDir: './e2e-upskii-production',
  testMatch: config.suites.map((suite) => `suites/${suite}.e2e.ts`),
  globalSetup: './e2e-upskii-production/global-setup.ts',
  globalTeardown: './e2e-upskii-production/global-teardown.ts',
  fullyParallel: false,
  forbidOnly: true,
  // Production writes are not retried; a failure is reported, not masked.
  retries: 0,
  workers: 1,
  maxFailures: 10,
  timeout: 120_000,
  globalTimeout: 20 * 60 * 1000,
  expect: { timeout: 20_000 },
  reporter: [
    ['line'],
    ['junit', { outputFile: '../../tmp/upskii-production-e2e/junit.xml' }],
  ],
  outputDir: '../../tmp/upskii-production-e2e/results',
  use: {
    ...devices['Desktop Chrome'],
    ignoreHTTPSErrors: false,
    // Traces and video can capture session cookies; keep them off.
    trace: 'off',
    video: 'off',
    screenshot: 'only-on-failure',
    serviceWorkers: 'block',
    permissions: ['camera', 'microphone'],
    launchOptions: {
      args: [
        '--use-fake-device-for-media-stream',
        '--use-fake-ui-for-media-stream',
      ],
    },
  },
  projects: [{ name: 'upskii-production', use: { locale: 'en-US' } }],
});
