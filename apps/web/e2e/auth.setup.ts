import { test as setup } from '@playwright/test';
import { authenticateTestUser } from './helpers/auth';

/**
 * Playwright "setup" project — runs once before all authenticated tests.
 * Creates e2e/.auth/user.json with session cookies so tests don't need to log in.
 */
setup('authenticate', async ({ page }) => {
  await authenticateTestUser(page);
});
