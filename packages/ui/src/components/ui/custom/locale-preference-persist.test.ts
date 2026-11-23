import { beforeEach, describe, expect, it, vi } from 'vitest';
import { persistLocalePreference } from './locale-preference';

const calls: string[] = [];

vi.mock('cookies-next', () => ({
  deleteCookie: (name: string, options: { path?: string }) =>
    calls.push(`delete ${name} ${options.path ?? ''}`),
  setCookie: (name: string, value: string) =>
    calls.push(`set ${name}=${value}`),
}));

vi.mock('@tuturuuu/utils/shared-cookie', () => ({
  browserMountedAppBase: () => '',
  getTuturuuuBrowserCookieDeleteOptions: () => [
    { path: '/' },
    { domain: '.tuturuuu.com', path: '/' },
  ],
  getTuturuuuBrowserSharedCookieOptions: (options: object) => options,
}));

describe('persistLocalePreference', () => {
  beforeEach(() => {
    calls.length = 0;
  });

  it('clears every reachable copy before storing the new locale', () => {
    persistLocalePreference('vi');
    expect(calls).toEqual([
      'delete NEXT_LOCALE /',
      'delete NEXT_LOCALE /',
      'set NEXT_LOCALE=vi',
    ]);
  });
});
