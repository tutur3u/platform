import { defineConfig, devices } from '@playwright/test';
import { readConfig, required } from './e2e-staging/policy';

const config = readConfig(process.env);
required(process.env, 'CONTACTS_STAGING_EMAIL');
required(process.env, 'CONTACTS_STAGING_PASSWORD');
export default defineConfig({
  testDir: './e2e-staging',
  testMatch: '*.spec.ts',
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: 'line',
  outputDir: '../../tmp/contacts-staging-results',
  use: {
    ...devices['Desktop Chrome'],
    baseURL: config.baseURL,
    ignoreHTTPSErrors: false,
    trace: 'off',
    screenshot: 'off',
    video: 'off',
    serviceWorkers: 'block',
  },
  projects: ['en', 'vi'].map((locale) => ({
    name: `contacts-${locale}`,
    use: { locale: locale === 'vi' ? 'vi-VN' : 'en-US' },
    metadata: { locale },
  })),
});
