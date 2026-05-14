import type { Page } from '@playwright/test';
import { DEFAULT_LOCALE, TEST_USER, WEB_BASE_URL } from './constants';

export async function authenticateHiveTestUser(page: Page) {
  const response = await page.request.post(
    `${WEB_BASE_URL}/api/auth/dev-session`,
    {
      data: {
        email: TEST_USER.email,
        locale: DEFAULT_LOCALE,
      },
      failOnStatusCode: false,
    }
  );

  if (!response.ok()) {
    const body = await response.text().catch(() => '');
    throw new Error(
      `Hive E2E dev session failed with status ${response.status()}: ${body}`
    );
  }
}
