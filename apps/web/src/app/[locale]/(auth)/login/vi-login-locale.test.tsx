// @vitest-environment node
import { NextRequest } from 'next/server';
import { type AbstractIntlMessages, NextIntlClientProvider } from 'next-intl';
import { isValidElement } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import {
  AUTH_CLIENT_MESSAGE_NAMESPACES,
  getClientMessages,
} from '@/i18n/client-messages';
import getRequestConfig from '@/i18n/request';
import type { Locale } from '@/i18n/routing';
import { proxy } from '@/proxy';
import viMessages from '../../../../../messages/vi.json';
import AuthLayout from '../layout';
import { AuthTopControls } from './auth-top-controls';
import { LoginBrandHeader } from './login-brand';
import { LoginFooter } from './login-footer';

vi.mock('server-only', () => ({}));

vi.mock('next/navigation', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/navigation')>();
  return {
    ...actual,
    useSearchParams: () => new URLSearchParams(),
  };
});

vi.mock('next-themes', () => ({
  useTheme: () => ({ resolvedTheme: 'light', setTheme: vi.fn() }),
}));

vi.mock('@/i18n/routing', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/i18n/routing')>();
  return {
    ...actual,
    usePathname: () => '/login',
    useRouter: () => ({ replace: vi.fn() }),
  };
});

vi.mock('next-intl/server', () => ({
  getMessages: vi.fn(async (options?: { locale?: string }) =>
    options?.locale === 'vi'
      ? viMessages
      : (await import('../../../../../messages/en.json')).default
  ),
  getRequestConfig: <T,>(factory: T) => factory,
}));

describe('/vi/login proxy-to-SSR Vietnamese copy', () => {
  it('propagates the vi locale from /vi/login proxy through next-intl config and renders Vietnamese copy', async () => {
    const response = await proxy(
      new NextRequest('https://tuturuuu.com/vi/login', {
        headers: {
          'accept-language': 'en-US,en;q=0.9',
          cookie: 'NEXT_LOCALE=en',
        },
      })
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('location')).toBeNull();
    expect(response.headers.get('set-cookie')).toBeNull();
    expect(response.headers.get('cache-control')).toBe(
      'public, max-age=0, must-revalidate'
    );
    expect(response.headers.get('cdn-cache-control')).toBe(
      'public, max-age=86400, stale-while-revalidate=604800'
    );
    expect(response.headers.get('vercel-cdn-cache-control')).toBe(
      'public, max-age=86400, stale-while-revalidate=604800'
    );
    expect(response.headers.get('x-robots-tag')).toBe('noindex, nofollow');

    const forwardedLocale = response.headers.get(
      'x-middleware-request-x-next-intl-locale'
    );
    expect(forwardedLocale).toBe('vi');

    const requestConfig = await (
      getRequestConfig as unknown as (params: {
        requestLocale: Promise<string | undefined>;
      }) => Promise<{ locale: Locale; messages: Record<string, unknown> }>
    )({
      requestLocale: Promise.resolve(forwardedLocale ?? undefined),
    });

    expect(requestConfig.locale).toBe('vi');

    const authMessages = getClientMessages(
      requestConfig.messages,
      AUTH_CLIENT_MESSAGE_NAMESPACES
    );
    const html = renderToString(
      <NextIntlClientProvider
        locale={requestConfig.locale}
        messages={authMessages as AbstractIntlMessages}
      >
        <AuthTopControls />
        <LoginBrandHeader app={null} multiAccount={false} pending={false} />
        <LoginFooter />
      </NextIntlClientProvider>
    );

    expect(html).toContain(viMessages.login.welcome_to_tuturuuu);
    expect(html).toContain(viMessages.login.sign_in_or_create);
    expect(html).toContain(viMessages.login.trouble_signing_in);
    expect(html).toContain('href="/vi/terms"');
    expect(html).toContain('href="/vi/privacy"');
    expect(html).toContain('href="/vi/auth/recovery"');
    expect(html).not.toContain('Welcome to Tuturuuu');
    expect(html).not.toContain('Trouble signing in?');

    const viButtonTag = html.match(/<button\b[^>]*lang="vi"[^>]*>/u)?.[0] ?? '';
    const enButtonTag = html.match(/<button\b[^>]*lang="en"[^>]*>/u)?.[0] ?? '';
    expect(viButtonTag).toContain('aria-pressed="true"');
    expect(enButtonTag).toContain('aria-pressed="false"');
  });

  it('resolves Vietnamese messages and locale explicitly in AuthLayout from route params', async () => {
    const element = await AuthLayout({
      children: <div data-testid="login-child" />,
      params: Promise.resolve({ locale: 'vi' }),
    });

    expect(isValidElement(element)).toBe(true);
    const props = (
      element as React.ReactElement<{
        locale?: string;
        messages?: { login?: { welcome_to_tuturuuu?: string } };
      }>
    ).props;

    expect(props.locale).toBe('vi');
    expect(props.messages?.login?.welcome_to_tuturuuu).toBe(
      viMessages.login.welcome_to_tuturuuu
    );
  });

  it.each([
    ['/vi/login', 'vi'],
    ['/en/login?returnUrl=/en/personal/tasks', 'en'],
    ['/vi/add-account?returnUrl=/vi/personal/tasks', 'vi'],
  ] as const)(
    'propagates %s locale (%s) on signed-in private auth shells without cookies or redirects',
    async (pathname, expectedLocale) => {
      const response = await proxy(
        new NextRequest(`https://tuturuuu.com${pathname}`, {
          headers: {
            'accept-language': 'en-US,en;q=0.9',
            cookie: 'sb-project-auth-token=session; NEXT_LOCALE=en',
          },
        })
      );

      expect(response.status).toBe(200);
      expect(response.headers.get('location')).toBeNull();
      expect(response.headers.get('set-cookie')).toBeNull();
      expect(
        response.headers.get('x-middleware-request-x-next-intl-locale')
      ).toBe(expectedLocale);
      expect(response.headers.get('cache-control')).toBe('private, no-store');
      expect(response.headers.get('cdn-cache-control')).toBe('no-store');
      expect(response.headers.get('vercel-cdn-cache-control')).toBe('no-store');
      expect(response.headers.get('x-robots-tag')).toBe('noindex, nofollow');
    }
  );

  it.each([
    ['en-US,en;q=0.9', 'en'],
    ['vi-VN,vi;q=0.9', 'vi'],
  ] as const)(
    'keeps unprefixed negotiated /login private and cookie-free when NEXT_LOCALE is unsupported (%s -> %s)',
    async (acceptLanguage, expectedLocale) => {
      const response = await proxy(
        new NextRequest('https://tuturuuu.com/login', {
          headers: {
            'accept-language': acceptLanguage,
            cookie: 'NEXT_LOCALE=fr',
          },
        })
      );

      expect(response.status).toBe(200);
      expect(response.headers.get('location')).toBeNull();
      expect(response.headers.get('set-cookie')).toBeNull();
      expect(
        response.headers.get('x-middleware-request-x-next-intl-locale')
      ).toBe(expectedLocale);
      expect(response.headers.get('cache-control')).toBe('private, no-store');
      expect(response.headers.get('cdn-cache-control')).toBe('no-store');
      expect(response.headers.get('vercel-cdn-cache-control')).toBe('no-store');
    }
  );
});
