import { defineConfig, devices } from '@playwright/test';
import { readConfig, required } from './e2e-wave1-staging/policy';

const config = readConfig(process.env);
// Fail before launching Chromium; never log or persist these values.
required(process.env, 'WAVE1_STAGING_EMAIL');
required(process.env, 'WAVE1_STAGING_PASSWORD');

export default defineConfig({
  testDir: './e2e-wave1-staging',
  testMatch: `${config.app}.spec.ts`,
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: 'line',
  outputDir: '../../tmp/wave1-staging-results',
  use: {
    ...devices['Desktop Chrome'],
    baseURL: config.baseURL,
    ignoreHTTPSErrors: false,
    trace: 'off',
    screenshot: 'off',
    video: 'off',
    permissions: config.app === 'meet' ? ['camera', 'microphone'] : [],
    serviceWorkers: 'block',
    launchOptions: {
      args:
        config.app === 'meet'
          ? [
              '--use-fake-device-for-media-stream',
              '--use-fake-ui-for-media-stream',
            ]
          : [],
    },
  },
  projects: ['en', 'vi'].map((locale) => ({
    name: `${config.app}-${locale}`,
    use: { locale: locale === 'vi' ? 'vi-VN' : 'en-US' },
    metadata: { locale },
  })),
});
