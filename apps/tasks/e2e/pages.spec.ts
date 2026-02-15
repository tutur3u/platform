import { expect, test } from '@playwright/test';
import {
  BOARDS_URL,
  DRAFTS_URL,
  ESTIMATES_URL,
  INITIATIVES_URL,
  LABELS_URL,
  LOGS_URL,
  NOTES_URL,
  PROJECTS_URL,
  TASKS_URL,
  TEMPLATES_URL,
} from './helpers/constants';

/**
 * Waits for the page to finish any auth redirects and verifies it loaded
 * without critical errors.
 */
async function waitForPageLoad(page: import('@playwright/test').Page) {
  await page.waitForURL(
    (url) =>
      !url.pathname.includes('/login') && !url.pathname.includes('/auth'),
    { timeout: 60_000, waitUntil: 'domcontentloaded' }
  );

  const body = page.locator('body');
  await expect(body).not.toBeEmpty();

  const bodyText = await body.textContent();
  expect(bodyText).not.toContain('Internal Server Error');
  expect(bodyText).not.toContain('Application error');
}

test.describe('Task pages load correctly (authenticated)', () => {
  test('My Tasks page loads', async ({ page }) => {
    await page.goto(TASKS_URL, { waitUntil: 'domcontentloaded' });
    await waitForPageLoad(page);

    // The tasks page should be accessible (URL should contain /tasks)
    expect(page.url()).toContain('/tasks');
  });

  test('Boards page loads', async ({ page }) => {
    await page.goto(BOARDS_URL, { waitUntil: 'domcontentloaded' });
    await waitForPageLoad(page);

    expect(page.url()).toContain('/boards');
  });

  test('Projects page loads', async ({ page }) => {
    await page.goto(PROJECTS_URL, { waitUntil: 'domcontentloaded' });
    await waitForPageLoad(page);

    expect(page.url()).toContain('/projects');
  });

  test('Initiatives page loads', async ({ page }) => {
    await page.goto(INITIATIVES_URL, { waitUntil: 'domcontentloaded' });
    await waitForPageLoad(page);

    expect(page.url()).toContain('/initiatives');
  });

  test('Labels page loads', async ({ page }) => {
    await page.goto(LABELS_URL, { waitUntil: 'domcontentloaded' });
    await waitForPageLoad(page);

    expect(page.url()).toContain('/labels');
  });

  test('Notes page loads', async ({ page }) => {
    await page.goto(NOTES_URL, { waitUntil: 'domcontentloaded' });
    await waitForPageLoad(page);

    expect(page.url()).toContain('/notes');
  });

  test('Drafts page loads', async ({ page }) => {
    await page.goto(DRAFTS_URL, { waitUntil: 'domcontentloaded' });
    await waitForPageLoad(page);

    expect(page.url()).toContain('/drafts');
  });

  test('Templates page loads', async ({ page }) => {
    await page.goto(TEMPLATES_URL, { waitUntil: 'domcontentloaded' });
    await waitForPageLoad(page);

    expect(page.url()).toContain('/templates');
  });

  test('Logs page loads', async ({ page }) => {
    await page.goto(LOGS_URL, { waitUntil: 'domcontentloaded' });
    await waitForPageLoad(page);

    expect(page.url()).toContain('/logs');
  });

  test('Estimates page loads', async ({ page }) => {
    await page.goto(ESTIMATES_URL, { waitUntil: 'domcontentloaded' });
    await waitForPageLoad(page);

    expect(page.url()).toContain('/estimates');
  });
});
