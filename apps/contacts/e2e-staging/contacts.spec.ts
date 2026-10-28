import { expect } from '@playwright/test';
import {
  config,
  identity,
  signIn,
  test,
  visit,
  workspacePath,
} from './fixtures';
import { localized } from './policy';

test('native probe is staging-only and carries candidate identity', async ({
  page,
}) => {
  const response = await page.goto(config.baseURL + '/__contacts1');
  expect(response?.status()).toBe(200);
  expect(response?.headers()['x-tuturuuu-contacts-renderer']).toBe(
    'native-Start'
  );
  expect(response?.headers()['set-cookie']).toBeUndefined();
  expect(await response?.json()).toMatchObject({
    app: 'contacts',
    status: 'candidate',
    pages: 'Next-fallback',
  });
});
test('Contacts session, EN/VI tutoring and feedback navigation survive Next fallback and reload', async ({
  page,
  acceptanceLocale,
}) => {
  await signIn(page, acceptanceLocale, `${workspacePath}/users`);
  for (const route of [
    'users/tutoring',
    'users/feedbacks',
    'users/attendance',
    'posts',
  ]) {
    await visit(page, localized(`${workspacePath}/${route}`, acceptanceLocale));
    expect(new URL(page.url()).pathname).toBe(`${workspacePath}/${route}`);
    await expect(page.locator('html')).toHaveAttribute(
      'lang',
      acceptanceLocale
    );
    const response = await page.reload({ waitUntil: 'domcontentloaded' });
    expect(response?.status()).toBe(200);
    expect(response?.headers()['x-tuturuuu-contacts-renderer']).toBe(
      'Next-fallback'
    );
    await identity(page);
  }
});
