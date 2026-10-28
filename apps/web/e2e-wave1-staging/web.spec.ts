import { expect } from '@playwright/test';
import { getLegalDocument } from '@tuturuuu/legal';
import { config, signIn, test, visit, workspacePath } from './fixtures';
import { localized } from './policy';

test('public native legal pages preserve EN/VI content and reload without a session', async ({
  page,
  acceptanceLocale,
}) => {
  const pages = [
    { kind: 'privacy', slug: 'privacy' },
    { kind: 'terms', slug: 'terms' },
    { kind: 'acceptable-use', slug: 'acceptable-use' },
    { kind: 'dpa', slug: 'legal/dpa' },
    { kind: 'sla', slug: 'legal/sla' },
    { kind: 'subprocessors', slug: 'legal/subprocessors' },
  ] as const;
  for (const { kind, slug } of pages) {
    const document = getLegalDocument(kind, acceptanceLocale);
    const path = localized(`/${slug}`, acceptanceLocale);
    const response = await page.goto(config.baseURL + path, {
      waitUntil: 'domcontentloaded',
    });
    expect(response?.status()).toBe(200);
    expect(response?.headers()['x-tuturuuu-web-renderer']).toBe('native-Start');
    expect(response?.headers()['set-cookie']).toBeUndefined();
    await expect(page.locator('html')).toHaveAttribute(
      'lang',
      acceptanceLocale
    );
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
      'content',
      'noindex, nofollow'
    );
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      `${document.title} ${document.highlightedWord}`
    );
    for (const section of document.sections) {
      await expect(
        page.getByRole('heading', { name: section.title, exact: true })
      ).toBeVisible();
    }
    await expect(page.locator('footer')).toContainText(document.footer);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  }
});

test('signed-in Next fallback retains actor, locale, session and public native navigation', async ({
  page,
  acceptanceLocale,
}) => {
  await signIn(page, acceptanceLocale, workspacePath);
  const response = await page.reload({ waitUntil: 'domcontentloaded' });
  expect(response?.headers()['x-tuturuuu-web-renderer']).toBe('Next-fallback');
  await visit(page, localized('/privacy', acceptanceLocale));
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await visit(page, localized(workspacePath, acceptanceLocale));
  expect(new URL(page.url()).pathname).not.toContain('/login');
});
