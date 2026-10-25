import { describe, expect, it } from 'vitest';
import { getRootParam, locale } from '../next/root-params';
import { withBridgeRequest } from '../server/request-context';
import { createNavigation } from './navigation';
import {
  getFormatter,
  getLocale,
  getMessages,
  getTranslations,
  setRequestLocale,
} from './next-intl-server';
import { defineRouting, hasLocale, localePrefixMode } from './routing';

const run = <T>(url: string, work: () => Promise<T>, extra = {}) =>
  withBridgeRequest({ request: new Request(url), ...extra }, work);

describe('next/root-params', () => {
  it('prefers explicit root params, then the rewritten path, then the header', async () => {
    expect(await locale()).toBeUndefined();
    expect(
      await run('https://x.test/en/a', locale, { rootParams: { locale: 'vi' } })
    ).toBe('vi');
    expect(await run('https://x.test/vi/contacts', locale)).toBe('vi');
    expect(
      await run('https://tuturuuu.com/contacts/en/x', locale, {
        appBase: '/contacts',
      })
    ).toBe('en');
    expect(
      await withBridgeRequest(
        {
          request: new Request('https://x.test/contacts', {
            headers: { 'x-next-intl-locale': 'vi' },
          }),
        },
        locale
      )
    ).toBe('vi');
    expect(await run('https://x.test/en', () => getRootParam('wsId'))).toBe(
      undefined
    );
  });
});

describe('next-intl/routing', () => {
  const routing = defineRouting({
    defaultLocale: 'en',
    localePrefix: 'never',
    locales: ['en', 'vi'] as const,
  });
  it('keeps the config and narrows locales', () => {
    expect(routing.locales).toEqual(['en', 'vi']);
    expect(hasLocale(routing.locales, 'vi')).toBe(true);
    expect(hasLocale(routing.locales, 'fr')).toBe(false);
    expect(localePrefixMode(routing)).toBe('never');
    expect(localePrefixMode({ localePrefix: { mode: 'as-needed' } })).toBe(
      'as-needed'
    );
    expect(localePrefixMode({})).toBe('always');
  });
});

describe('next-intl/navigation getPathname', () => {
  const base = {
    defaultLocale: 'en' as const,
    locales: ['en', 'vi'] as const,
  };
  it('honours each localePrefix mode', () => {
    const never = createNavigation({ ...base, localePrefix: 'never' });
    expect(never.getPathname({ href: '/vi/people', locale: 'vi' })).toBe(
      '/people'
    );
    expect(never.getPathname({ href: '/vi?tab=a#x', locale: 'vi' })).toBe(
      '/?tab=a#x'
    );
    const asNeeded = createNavigation({ ...base, localePrefix: 'as-needed' });
    expect(asNeeded.getPathname({ href: '/people', locale: 'en' })).toBe(
      '/people'
    );
    expect(asNeeded.getPathname({ href: '/people', locale: 'vi' })).toBe(
      '/vi/people'
    );
    const always = createNavigation(base);
    expect(
      always.getPathname({
        href: { pathname: '/', query: { q: 'a b' } },
        locale: 'en',
      })
    ).toBe('/en?q=a+b');
    expect(always.getPathname({ href: 'https://x.test', locale: 'en' })).toBe(
      'https://x.test'
    );
  });
});

describe('generic next-intl/server', () => {
  it('evaluates the app request config per request and locale', async () => {
    const seen = await Promise.all(
      ['en', 'vi'].map((current) =>
        run(`https://x.test/${current}/people`, async () => {
          const t = await getTranslations('common');
          return [await getLocale(), t('hello', { name: 'An' })];
        })
      )
    );
    expect(seen).toEqual([
      ['en', 'Hello An'],
      ['vi', 'Xin chào An'],
    ]);
  });

  it('applies setRequestLocale and explicit locale overrides', async () => {
    await run('https://x.test/people', async () => {
      setRequestLocale('vi');
      expect(await getLocale()).toBe('vi');
      const messages = await getMessages({ locale: 'en' });
      expect(messages).toEqual({ common: { hello: 'Hello {name}' } });
      const t = await getTranslations({ locale: 'en', namespace: 'common' });
      expect(t('hello', { name: 'B' })).toBe('Hello B');
      const format = await getFormatter();
      expect(format.number(1234.5)).toBe('1.234,5');
    });
  });
});

describe('next-intl/navigation locale escaping', () => {
  it('matches locales with regex syntax characters literally', () => {
    const nav = createNavigation({
      defaultLocale: 'en-US',
      locales: ['en-US', 'x.y', 'a\\b'] as const,
      localePrefix: 'as-needed',
    });
    expect(nav.getPathname({ href: '/x.y/people', locale: 'en-US' })).toBe(
      '/people'
    );
    expect(nav.getPathname({ href: '/xzy/people', locale: 'en-US' })).toBe(
      '/xzy/people'
    );
    expect(nav.getPathname({ href: '/a\\b/p', locale: 'en-US' })).toBe('/p');
  });
});
