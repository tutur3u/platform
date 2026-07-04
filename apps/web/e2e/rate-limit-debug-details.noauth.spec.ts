import { expect, type Page, test } from '@playwright/test';
import { DEFAULT_LOCALE } from './helpers/constants';

async function openAppPage(page: Page) {
  await page.route('**/api/v1/auth/otp/settings?client=web', (route) =>
    route.fulfill({
      body: JSON.stringify({ otpEnabled: false }),
      contentType: 'application/json',
      status: 200,
    })
  );

  await page.goto(`/${DEFAULT_LOCALE}/login`, {
    waitUntil: 'domcontentloaded',
  });

  await expect(
    page.getByPlaceholder('Enter your email or username').first()
  ).toBeVisible({ timeout: 30_000 });
}

test.describe('Rate-limit debug details', () => {
  test('shows screenshot-friendly details for same-origin GET 429s and still retries', async ({
    page,
  }) => {
    let requestCount = 0;
    await page.route(/\/api\/v1\/users\/me\/profile(?:\?|$)/u, (route) => {
      requestCount += 1;

      if (requestCount === 1) {
        return route.fulfill({
          body: JSON.stringify({ error: 'Rate limited' }),
          contentType: 'application/json',
          headers: {
            'CF-Ray': 'ray-get-123',
            'Retry-After': '1',
            'X-RateLimit-Caller-Class': 'authenticated',
            'X-RateLimit-Limit': '600',
            'X-RateLimit-Policy': 'users-me',
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': '1893456000',
            'X-RateLimit-Window': 'minute',
            'X-Request-Id': 'req-get-123',
          },
          status: 429,
        });
      }

      return route.fulfill({
        body: JSON.stringify({ ok: true }),
        contentType: 'application/json',
        status: 200,
      });
    });

    await openAppPage(page);

    const fetchResult = page.evaluate(async () => {
      const response = await fetch(
        '/api/v1/users/me/profile?token=secret-token&tab=settings'
      );
      return {
        body: await response.json(),
        status: response.status,
      };
    });

    await expect(page.getByText("You're being rate limited")).toBeVisible();
    await page.getByRole('button', { name: 'View details' }).click();

    await expect(
      page.getByRole('heading', { name: 'Rate-limit details' })
    ).toBeVisible();
    await expect(page.locator('body')).toContainText(
      '/api/v1/users/me/profile?token=[redacted]&tab=settings'
    );
    await expect(page.locator('body')).toContainText('users-me');
    await expect(page.locator('body')).toContainText('authenticated');
    await expect(page.locator('body')).toContainText('req-get-123');
    await expect(page.locator('body')).toContainText('ray-get-123');
    await expect(page.locator('body')).not.toContainText('secret-token');

    await expect.poll(() => requestCount).toBe(2);
    expect(await fetchResult).toEqual({
      body: { ok: true },
      status: 200,
    });
  });

  test('shows details for same-origin mutation 429s without replaying the request body', async ({
    page,
  }) => {
    let requestCount = 0;
    await page.route('**/api/v1/workspaces/ws-1/tasks', (route) => {
      requestCount += 1;
      return route.fulfill({
        body: JSON.stringify({ error: 'Rate limited' }),
        contentType: 'application/json',
        headers: {
          'Retry-After': '9',
          'X-RateLimit-Caller-Class': 'authenticated',
          'X-RateLimit-Limit': '60',
          'X-RateLimit-Policy': 'default',
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': '1893456000',
          'X-RateLimit-Window': 'minute',
          'X-Request-Id': 'req-post-123',
        },
        status: 429,
      });
    });

    await openAppPage(page);

    const fetchResult = await page.evaluate(async () => {
      const response = await fetch('/api/v1/workspaces/ws-1/tasks', {
        body: JSON.stringify({ title: 'request-body-secret' }),
        headers: {
          'Content-Type': 'application/json',
        },
        method: 'POST',
      });

      return {
        status: response.status,
        text: await response.text(),
      };
    });

    expect(fetchResult.status).toBe(429);
    expect(requestCount).toBe(1);

    await expect(page.getByText("You're being rate limited")).toBeVisible();
    await page.getByRole('button', { name: 'View details' }).click();

    await expect(
      page.getByRole('heading', { name: 'Rate-limit details' })
    ).toBeVisible();
    await expect(page.locator('body')).toContainText(
      '/api/v1/workspaces/ws-1/tasks'
    );
    await expect(page.locator('body')).toContainText('POST');
    await expect(page.locator('body')).toContainText('false');
    await expect(page.locator('body')).toContainText('req-post-123');
    await expect(page.locator('body')).not.toContainText('request-body-secret');
  });
});
