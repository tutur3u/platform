import { test as setup } from '@playwright/test';
import { authenticateTestUser } from './helpers/auth';

/**
 * Playwright "setup" project — runs once before all authenticated tests.
 * Creates e2e/.auth/user.json with session cookies so tests don't need to log in.
 *
 * Authentication happens through the web app's login page (port 7803) because
 * the tasks app shares the same Supabase auth backend.
 */
setup('authenticate', async ({ page }) => {
  await authenticateTestUser(page);
});
