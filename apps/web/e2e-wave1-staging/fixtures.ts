import { test as base, expect, type Page } from '@playwright/test';
import { z } from 'zod';
import en from '../messages/en.json';
import vi from '../messages/vi.json';
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
  required(process.env, `WAVE1_STAGING_${name}`);
export const segment = (value: string) => encodeURIComponent(value);
export const workspacePath = `/${segment(config.workspace)}`;

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
              url: request.url(),
              method: request.method(),
              ...config,
            })
          ) {
            // Paths/query strings can carry handoff credentials: retain no URLs.
            violations.push('Blocked unexpected origin or mutation');
            await route.abort('blockedbyclient');
          } else await route.continue();
        });
        await context.routeWebSocket('**/*', (socket) => {
          const url = new URL(socket.url());
          if (
            (url.origin === config.baseURL.replace('https:', 'wss:') &&
              url.pathname === '/realtime') ||
            url.origin === config.supabaseOrigin.replace('https:', 'wss:')
          )
            socket.connectToServer();
          else {
            violations.push('Unexpected WebSocket origin');
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
  expect(result.status, 'Authenticated staging API read').toBe(200);
  return result.body;
}

export async function identity(page: Page) {
  const result = z
    .object({
      commitHash: z.string(),
      appName: z.string(),
      environment: z.string(),
    })
    .parse(await readJson(page, '/api/build-info'));
  expect(result.commitHash).toBe(config.sha);
  expect(result.appName).toBe(config.app);
  expect(result.environment).toBe('staging');
}

export async function visit(page: Page, path: string) {
  const response = await page.goto(
    new URL(relativePath(path), config.baseURL).href,
    { waitUntil: 'domcontentloaded' }
  );
  expect(response?.ok(), 'Staging document must render').toBe(true);
  expect(new URL(page.url()).origin).toBe(config.baseURL);
  expect(response?.headers()['strict-transport-security']).toMatch(
    /max-age=[1-9]\d*/u
  );
}

export async function signIn(page: Page, locale: Locale, path: string) {
  const copy = locale === 'vi' ? vi : en;
  const destination = new URL(localized(path, locale), config.baseURL);
  // Start at the app so its actual handoff/return contract, rather than a forged
  // storageState or local dev-session endpoint, owns the login transition.
  await page.goto(destination.href, { waitUntil: 'domcontentloaded' });
  if (config.app === 'apps') {
    // Apps intentionally has no login link: exercise the supported Web return
    // entry and verify the signed-in profile through the app's API proxy.
    const login = new URL(localized('/login', locale), config.webOrigin);
    login.searchParams.set('returnUrl', destination.href);
    login.searchParams.set('nextUrl', destination.pathname);
    await page.goto(login.href, { waitUntil: 'domcontentloaded' });
  }
  await page.waitForURL(
    (url) =>
      url.origin ===
        (config.app === 'web' ? config.baseURL : config.webOrigin) &&
      url.pathname.includes('/login')
  );
  const login = new URL(page.url());
  const returnUrl = login.searchParams.get('returnUrl');
  if (config.app !== 'web' || returnUrl) {
    expect(returnUrl, 'Handoff must return to this staging app').toBeTruthy();
    expect(new URL(returnUrl ?? '').origin).toBe(config.baseURL);
  }
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
  const expectedPath =
    config.app === 'apps' ? '/' : acceptancePath(destination.pathname, locale);
  expect(
    new URL(page.url()).pathname,
    'Handoff must retain the requested destination'
  ).toBe(expectedPath);
  await visit(page, localized(path, locale));
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
  expect(auth.length, 'Signed-in cookies must exist').toBeGreaterThan(0);
  for (const cookie of auth) {
    // Web staging cookies are host-only (no leading dot, no Domain attribute).
    expect(cookie.domain).toBe(
      config.app === 'web' ? 'tutur3u.com' : '.staging.tutur3u.com'
    );
    expect(cookie.secure).toBe(true);
  }
  if (config.app !== 'apps' && config.app !== 'web') {
    const refreshed = await page.evaluate(async () => {
      const response = await fetch('/api/auth/refresh-app-session', {
        method: 'POST',
        credentials: 'include',
        redirect: 'error',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      return response.status;
    });
    expect(
      refreshed,
      'Real app session refresh must succeed without a loop'
    ).toBe(200);
  }
  await page.reload({ waitUntil: 'domcontentloaded' });
  expect(new URL(page.url()).origin).toBe(config.baseURL);
  expect(
    z
      .object({ id: z.string() })
      .parse(await readJson(page, '/api/v1/users/me/profile')).id
  ).toBe(user.id);
}

function acceptancePath(path: string, locale: Locale) {
  return locale === 'en' ? path.replace(/^\/en(?=\/|$)/u, '') || '/' : path;
}
