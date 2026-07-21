import { defineConfig, devices } from '@playwright/test';
import {
  LOCAL_E2E_SUPABASE_PUBLISHABLE_KEY,
  LOCAL_E2E_SUPABASE_SECRET_KEY,
  LOCAL_E2E_SUPABASE_URL,
} from '../web/e2e/helpers/environment';

const INVENTORY_URL = 'http://localhost:7815';
const STOREFRONT_URL = 'http://localhost:7822';

const localAppEnv = {
  APP_ENV: 'development',
  INVENTORY_APP_URL: INVENTORY_URL,
  NEXT_PUBLIC_INVENTORY_APP_URL: INVENTORY_URL,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: LOCAL_E2E_SUPABASE_PUBLISHABLE_KEY,
  NEXT_PUBLIC_SUPABASE_URL: LOCAL_E2E_SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY: LOCAL_E2E_SUPABASE_PUBLISHABLE_KEY,
  SUPABASE_SECRET_KEY: LOCAL_E2E_SUPABASE_SECRET_KEY,
  SUPABASE_SERVER_URL: LOCAL_E2E_SUPABASE_URL,
  NODE_ENV: 'development',
};

export default defineConfig({
  expect: { timeout: 15_000 },
  fullyParallel: false,
  reporter: process.env.CI ? 'line' : 'list',
  testDir: './e2e',
  timeout: 60_000,
  use: {
    ...devices['Desktop Chrome'],
    baseURL: STOREFRONT_URL,
    trace: 'on-first-retry',
  },
  webServer: [
    {
      command: 'node ./node_modules/next/dist/bin/next dev -p 7815 --turbopack',
      cwd: '.',
      env: { ...localAppEnv, PORT: '7815' },
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
      url: `${INVENTORY_URL}/api/v1/workspaces/e2e-health/inventory/access`,
    },
    {
      command: 'node ./node_modules/next/dist/bin/next dev -p 7822 --turbopack',
      cwd: '../storefront',
      env: { ...localAppEnv, PORT: '7822' },
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
      url: `${STOREFRONT_URL}/demo`,
    },
  ],
});
