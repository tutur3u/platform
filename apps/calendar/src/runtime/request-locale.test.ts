import { describe, expect, it, vi } from 'vitest';

vi.mock('@tanstack/react-start/server-only', () => ({}));

import viMessages from '../../messages/vi.json';
import { getLocale, getMessages } from './intl-server';
import { loadLocaleContext } from './locale-context.server';
import { withCalendarRequest } from './request-context';
import { resolveCalendarLocale } from './request-locale';

function request(path: string, headers: HeadersInit = {}) {
  return new Request(`https://calendar.test${path}`, { headers });
}
function context<T>(input: Request, run: () => T) {
  return withCalendarRequest(
    { request: input, responseHeaders: new Headers(), waitUntil: () => {} },
    run
  );
}
describe('Calendar locale selection for documents and native functions', () => {
  it.each([
    [
      '/personal',
      { cookie: 'NEXT_LOCALE=vi', 'accept-language': 'en-US' },
      'vi',
    ],
    ['/personal', { 'accept-language': 'vi-VN,vi;q=0.9,en;q=0.8' }, 'vi'],
    ['/personal', { cookie: 'NEXT_LOCALE=en', 'accept-language': 'vi' }, 'en'],
    ['/en/personal', { cookie: 'NEXT_LOCALE=vi' }, 'en'],
    ['/vi/personal', { cookie: 'NEXT_LOCALE=en' }, 'vi'],
    [
      '/personal',
      { cookie: 'NEXT_LOCALE=unsupported', 'accept-language': 'vi' },
      'vi',
    ],
    [
      '/personal',
      { cookie: 'NEXT_LOCALE=vi', 'x-next-intl-locale': 'en' },
      'vi',
    ],
  ] satisfies [string, HeadersInit, 'en' | 'vi'][])(
    'uses the canonical preference precedence for %s and %j',
    (path, headers, locale) => {
      expect(resolveCalendarLocale(request(path, headers))).toBe(locale);
    }
  );
  it.each([
    new Headers({ cookie: 'NEXT_LOCALE=vi' }),
    new Headers({ 'accept-language': 'vi-VN,en;q=0.5' }),
  ])(
    'keeps Vietnamese for the document, RPC navigation and refresh with %j',
    async (headers) => {
      await context(request('/personal', headers), async () => {
        expect(await getLocale()).toBe('vi');
        expect(await getMessages()).toBe(viMessages);
      });
      await context(
        request('/_calendar/functions/fixture', headers),
        async () => {
          expect(loadLocaleContext('/personal')).toBe('vi');
          expect(loadLocaleContext('/personal/tasks?view=list')).toBe('vi');
          expect(loadLocaleContext('/personal')).toBe('vi');
          expect(loadLocaleContext('/en/personal')).toBe('en');
        }
      );
    }
  );
  it('keeps concurrent locale context isolated and rejects external logical URLs', async () => {
    const locales = await Promise.all(
      ['vi', 'en'].map((locale) =>
        context(
          request('/_calendar/functions/fixture', {
            cookie: `NEXT_LOCALE=${locale}`,
          }),
          async () => {
            await Promise.resolve();
            return loadLocaleContext('/personal');
          }
        )
      )
    );
    expect(locales).toEqual(['vi', 'en']);
    context(request('/_calendar/functions/fixture'), () =>
      expect(() => loadLocaleContext('//foreign.test/personal')).toThrow(
        'Invalid Calendar locale origin'
      )
    );
  });
});

it.each([
  ['*', 'en'],
  ['*;q=1,vi-VN;q=0.8,en-US;q=0.5', 'vi'],
  ['vi-VN;q=0.8,*;q=0.5,en-US;q=0.2', 'vi'],
  ['en_US,vi-VN;q=0.8', 'vi'],
  ['en_US', 'en'],
  ['vi;q=0,*;q=0', 'en'],
  ['vi;q=0,en-GB;q=0.5,*;q=1', 'en'],
  ['vi-VN,en-US;q=0.5', 'vi'],
  ['en-GB', 'en'],
  ['en-GB,vi-VN;q=0.5', 'vi'],
  ['en-US;q=0.4,vi-VN;q=0.9', 'vi'],
  ['vi;q=0.5,en;q=0.5', 'vi'],
  ['', 'en'],
])(
  'resolves browser preference %s without passing invalid tags to Intl: %s',
  (language, locale) => {
    expect(
      resolveCalendarLocale(
        request('/verify-token', { 'accept-language': language })
      )
    ).toBe(locale);
  }
);

it.each([
  ['/en/verify-token', 'NEXT_LOCALE=vi', 'en'],
  ['/vi/verify-token', 'NEXT_LOCALE=en', 'vi'],
  ['/verify-token', 'NEXT_LOCALE=vi', 'vi'],
  ['/verify-token', 'NEXT_LOCALE=en', 'en'],
])(
  'preserves path then valid cookie precedence over wildcard for %s',
  (path, cookie, locale) => {
    expect(
      resolveCalendarLocale(request(path, { cookie, 'accept-language': '*' }))
    ).toBe(locale);
  }
);
