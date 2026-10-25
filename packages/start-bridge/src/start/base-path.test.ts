import { afterEach, describe, expect, it, vi } from 'vitest';
import { appBasePath, routerBasepath, withAppBase } from './base-path';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('build-time basePath helpers', () => {
  it('is the identity at the root', () => {
    expect(appBasePath()).toBe('');
    expect(routerBasepath()).toBe('/');
    expect(withAppBase('/login')).toBe('/login');
  });

  it('prefixes path-absolute hrefs under /meet', () => {
    vi.stubEnv('VITE_TUTURUUU_BASE_PATH', '/meet');
    expect(appBasePath()).toBe('/meet');
    expect(routerBasepath()).toBe('/meet');
    expect(withAppBase('/')).toBe('/meet');
    expect(withAppBase('/r/x?y=1')).toBe('/meet/r/x?y=1');
    expect(withAppBase('/meet/r/x')).toBe('/meet/r/x');
    expect(withAppBase('https://tuturuuu.com/')).toBe('https://tuturuuu.com/');
    expect(withAppBase('//x.test/')).toBe('//x.test/');
    expect(withAppBase('/\\x.test')).toBe('/\\x.test');
  });
});
