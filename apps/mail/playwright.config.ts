import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig, devices } from '@playwright/test';
import { assertSafeMailE2EEnvironment } from './e2e/helpers/environment';

const rootEnvFile = fileURLToPath(new URL('../../.env.local', import.meta.url));
if (existsSync(rootEnvFile)) {
  process.loadEnvFile(rootEnvFile);
}

// Fail fast before webServer starts if env points at non-loopback Mail or cloud Supabase.
const { mailUrl: baseURL, supabaseUrl } = assertSafeMailE2EEnvironment();
const skipWebServer = process.env.MAIL_E2E_SKIP_WEB_SERVER === '1';

export default defineConfig({
  testDir: './e2e',
  forbidOnly: Boolean(process.env.CI),
  fullyParallel: false,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI ? 'blob' : 'list',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL,
    ignoreHTTPSErrors: true,
    screenshot: 'only-on-failure',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  ...(skipWebServer
    ? {}
    : {
        webServer: {
          command: 'bun run dev:legacy',
          env: {
            DOCKER_INTERNAL_SUPABASE_URL: supabaseUrl,
            MAIL_APP_URL: baseURL,
            MAIL_DEPLOYMENT_PROFILE: 'development',
            NEXT_PUBLIC_APP_URL: baseURL,
            NEXT_PUBLIC_MAIL_APP_URL: baseURL,
            NEXT_PUBLIC_SUPABASE_URL: supabaseUrl,
            NEXT_PUBLIC_WEB_APP_URL:
              process.env.NEXT_PUBLIC_WEB_APP_URL ?? 'http://localhost:7803',
            PORT: new URL(baseURL).port || '7820',
            SUPABASE_SERVER_URL: supabaseUrl,
            SUPABASE_URL: supabaseUrl,
            TUTURUUU_APP_COORDINATION_SECRET:
              process.env.TUTURUUU_APP_COORDINATION_SECRET ??
              'local-e2e-app-coordination-secret',
            WEB_APP_URL: process.env.WEB_APP_URL ?? 'http://localhost:7803',
          },
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
          url: baseURL,
        },
      }),
});
