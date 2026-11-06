import { test as base, expect, type Page } from '@playwright/test';
import { z } from 'zod';
import en from '../../web/messages/en.json';
import vi from '../../web/messages/vi.json';
import {
  allowedRequest,
  type Locale,
  localized,
  readConfig,
  relativePath,
  required,
} from './policy';

export const config = readConfig(process.env);
export const input = (name: string) =>
  required(process.env, `CONTACTS_STAGING_${name}`);
export const workspacePath = `/${encodeURIComponent(config.workspace)}`;
export const test = base.extend<{ acceptanceLocale: Locale; fence: undefined }>(
  {
    acceptanceLocale: async ({ browserName }, use, info) => {
      expect(browserName).toBe('chromium');
      const locale: unknown = info.project.metadata.locale;
      if (locale !== 'en' && locale !== 'vi')
        throw new Error('Unknown staging locale');
      await use(locale);
    },
    fence: [
      async ({ context }, use) => {
        const violations: string[] = [];
        await context.route('**/*', async (route) => {
          const request = route.request();
          if (
            !allowedRequest({
              ...config,
              url: request.url(),
              method: request.method(),
            })
          ) {
            violations.push('Blocked unexpected origin or domain mutation');
            await route.abort('blockedbyclient');
          } else await route.continue();
        });
        await context.routeWebSocket('**/*', (socket) => {
          if (
            new URL(socket.url()).origin ===
            config.supabaseOrigin.replace('https:', 'wss:')
          )
            socket.connectToServer();
          else {
            violations.push('Blocked unexpected WebSocket origin');
            socket.close();
          }
        });
        await use(undefined);
        expect(violations, 'No production egress or domain writes').toEqual([]);
      },
      { auto: true },
    ],
  }
);
export async function readJson(page: Page, path: string): Promise<unknown> {
  const result = await page.evaluate(async (path) => {
    const response = await fetch(path, {
      credentials: 'include',
      cache: 'no-store',
      redirect: 'error',
    });
    return {
      status: response.status,
      body: response.ok ? await response.json() : null,
    };
  }, relativePath(path));
  expect(result.status).toBe(200);
  return result.body;
}
export async function identity(page: Page) {
  const info = z
    .object({
      commitHash: z.string(),
      appName: z.string(),
      environment: z.string(),
    })
    .parse(await readJson(page, '/api/build-info'));
  expect(info).toMatchObject({
    commitHash: config.sha,
    appName: 'contacts',
    environment: 'staging',
  });
}
export async function visit(page: Page, path: string) {
  const response = await page.goto(config.baseURL + relativePath(path), {
    waitUntil: 'domcontentloaded',
  });
  expect(response?.ok()).toBe(true);
  expect(new URL(page.url()).origin).toBe(config.baseURL);
  expect(response?.headers()['strict-transport-security']).toMatch(
    /max-age=[1-9]\d*/u
  );
  expect(response?.headers()['x-tuturuuu-contacts-renderer']).toBe(
    'Next-fallback'
  );
}
export async function signIn(page: Page, locale: Locale, path: string) {
  const copy = locale === 'vi' ? vi : en;
  await page.goto(config.baseURL + localized(path, locale), {
    waitUntil: 'domcontentloaded',
  });
  await page.waitForURL(
    (url) => url.origin === config.webOrigin && url.pathname.includes('/login')
  );
  const returnUrl = new URL(page.url()).searchParams.get('returnUrl');
  expect(returnUrl).toBeTruthy();
  expect(new URL(returnUrl ?? '').origin).toBe(config.baseURL);
  await page
    .locator('input[name="email"]')
    .filter({ visible: true })
    .fill(input('EMAIL'));
  const password = page.locator('input[name="password"]');
  if (!(await password.isVisible())) {
    await page
      .locator('form button[type="submit"]')
      .filter({ visible: true })
      .click();
    const alternate = page.getByRole('button', {
      name: copy.login.use_password_instead,
      exact: true,
    });
    if (await alternate.isVisible()) await alternate.click();
  }
  await password.fill(input('PASSWORD'));
  await page
    .locator('form button[type="submit"]')
    .filter({ visible: true })
    .click();
  await page.waitForURL(
    (url) =>
      url.origin === config.baseURL && !/\/login|\/auth\//u.test(url.pathname)
  );
  // Contacts uses localePrefix=never for both locales; NEXT_LOCALE retains language.
  expect(new URL(page.url()).pathname).toBe(path);
  await visit(page, localized(path, locale));
  expect(new URL(page.url()).pathname).toBe(path);
  await expect(page.locator('html')).toHaveAttribute('lang', locale);
  await identity(page);
  const user = z
    .object({ id: z.string() })
    .parse(await readJson(page, '/api/v1/users/me/profile'));
  expect(user.id).toBe(input('USER_ID'));
  const cookies = await page.context().cookies();
  const auth = cookies.filter((cookie) =>
    /^(?:sb-|tuturuuu_)/u.test(cookie.name)
  );
  expect(auth.length).toBeGreaterThan(0);
  for (const cookie of auth) {
    expect(cookie.domain).toBe('.staging.tutur3u.com');
    expect(cookie.secure).toBe(true);
  }
  const refreshed = await page.evaluate(
    async () =>
      (
        await fetch('/api/auth/refresh-app-session', {
          method: 'POST',
          credentials: 'include',
          redirect: 'error',
          headers: { 'Content-Type': 'application/json' },
          body: '{}',
        })
      ).status
  );
  expect(refreshed).toBe(200);
  await page.reload({ waitUntil: 'domcontentloaded' });
  expect(new URL(page.url()).origin).toBe(config.baseURL);
  expect(
    z
      .object({ id: z.string() })
      .parse(await readJson(page, '/api/v1/users/me/profile')).id
  ).toBe(user.id);
}
