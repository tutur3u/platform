import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  browserMountedAppBase,
  getTuturuuuBrowserCookieDeleteOptions,
  getTuturuuuBrowserSharedCookieOptions,
} from './shared-cookie';

const LOCALE = { maxAge: 31_536_000, path: '/', sameSite: 'lax' as const };
type Global = { __tuturuuuAppBase?: unknown };

function mountAt(base: unknown) {
  (globalThis as Global).__tuturuuuAppBase = base;
}

beforeEach(() => {
  vi.stubEnv('TUTURUUU_DEPLOY_ENV', 'production');
  vi.stubGlobal('location', new URL('https://tuturuuu.com/tasks/en'));
});
afterEach(() => {
  delete (globalThis as Global).__tuturuuuAppBase;
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('browser cookies in a mounted app', () => {
  it.each([
    ['/tasks', '/tasks'],
    ['/tasks/', '/tasks'],
    [() => '/finance', '/finance'],
  ])('writes host-only at the base %s', (base, path) => {
    mountAt(base);
    const options = getTuturuuuBrowserSharedCookieOptions({
      ...LOCALE,
      domain: '.tuturuuu.com',
    });
    expect(options).toEqual({ ...LOCALE, path });
    expect(options).not.toHaveProperty('domain');
  });

  it('deletes only its own base copy, never the shared origin cookies', () => {
    mountAt('/tasks');
    expect(getTuturuuuBrowserCookieDeleteOptions(LOCALE)).toEqual([
      { ...LOCALE, maxAge: 0, path: '/tasks' },
    ]);
  });

  it.each(['', '/', undefined, 7])(
    'keeps root behaviour for base %s',
    (base) => {
      mountAt(base);
      expect(browserMountedAppBase()).toBe('');
      expect(getTuturuuuBrowserSharedCookieOptions(LOCALE).path).toBe('/');
      expect(
        getTuturuuuBrowserCookieDeleteOptions(LOCALE).length
      ).toBeGreaterThan(0);
    }
  );

  it('ignores the global on the server', () => {
    vi.stubGlobal('document', undefined);
    mountAt('/tasks');
    expect(browserMountedAppBase()).toBe('');
  });
});
