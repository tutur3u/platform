import { describe, expect, it } from 'vitest';
import { getMountedAppVerifyTokenMatch } from './internal-app-mounts';

describe('getMountedAppVerifyTokenMatch', () => {
  it('matches a registered app verifier mounted on the platform apex', () => {
    const match = getMountedAppVerifyTokenMatch(
      'https://tuturuuu.com/inventory/verify-token?nextUrl=%2Fpersonal%2Fcatalog'
    );

    expect(match).toMatchObject({
      basePath: '/inventory',
      kind: 'internal',
      name: 'inventory',
      nextUrl: '/personal/catalog',
      origin: 'https://tuturuuu.com',
    });
  });

  it('accepts a locale segment before verify-token', () => {
    expect(
      getMountedAppVerifyTokenMatch(
        'https://tuturuuu.com/tasks/vi/verify-token'
      )?.name
    ).toBe('tasks');
  });

  it.each([
    ['the platform verifier', 'https://tuturuuu.com/verify-token?nextUrl=%2F'],
    ['an unregistered app', 'https://tuturuuu.com/not-an-app/verify-token'],
    ['the platform name', 'https://tuturuuu.com/platform/verify-token'],
    ['another app page', 'https://tuturuuu.com/inventory/personal'],
    ['a deeper path', 'https://tuturuuu.com/inventory/a/b/verify-token'],
    ['an unsupported locale', 'https://tuturuuu.com/inventory/fr/verify-token'],
    ['an encoded slash', 'https://tuturuuu.com/inventory%2Fverify-token'],
    ['an empty segment', 'https://tuturuuu.com/inventory//verify-token'],
    ['a subdomain verifier', 'https://inventory.tuturuuu.com/verify-token'],
    [
      'a lookalike host',
      'https://tuturuuu.com.evil.test/inventory/verify-token',
    ],
    ['credentials', 'https://user:pass@tuturuuu.com/inventory/verify-token'],
    ['a non-http scheme', 'javascript://tuturuuu.com/inventory/verify-token'],
  ])('rejects %s', (_label, url) => {
    expect(getMountedAppVerifyTokenMatch(url)).toBeNull();
  });
});
