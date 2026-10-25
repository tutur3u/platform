import { resolveInternalApiUrl } from '@tuturuuu/internal-api/client';
import { APP_BASE_GLOBAL } from '@tuturuuu/start-bridge/app-url';
import { withBridgeRequest } from '@tuturuuu/start-bridge/request-context';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { financeApiPath } from './api-base';
import './api-base.server';

// Exercise the admitted source without building a workspace dependency here.
vi.mock(
  '@tuturuuu/internal-api/client',
  () => import('../../../../packages/internal-api/src/client')
);

afterEach(() => vi.unstubAllGlobals());

it('prefixes only Finance-owned browser API paths once', () => {
  vi.stubGlobal(APP_BASE_GLOBAL, '/finance');
  const local = '/api/workspaces/ws-1/wallets?ref=a&ref=b';
  expect(financeApiPath(local)).toBe(`/finance${local}`);
  expect(financeApiPath(`/finance${local}`)).toBe(`/finance${local}`);
  expect(financeApiPath('/api/workspaces/invitations')).toBe(
    '/api/workspaces/invitations'
  );
  expect(financeApiPath('/api/v1/workspaces/ws-1/settings/permissions')).toBe(
    '/api/v1/workspaces/ws-1/settings/permissions'
  );
  expect(financeApiPath('/api/unowned')).toBe('/api/unowned');
});

describe.each([
  { origin: 'https://finance.tuturuuu.com', base: '' },
  { origin: 'https://tuturuuu.com', base: '/finance' },
])('Finance SSR API routing: $origin$base', ({ origin, base }) => {
  it('uses the incoming host and request mount for shared clients', () => {
    withBridgeRequest(
      { request: new Request(`${origin}${base}/en/ws-1`), appBase: base },
      () => {
        expect(resolveInternalApiUrl('/api/workspaces/ws-1/wallets')).toBe(
          `${origin}${base}/api/workspaces/ws-1/wallets`
        );
        expect(resolveInternalApiUrl('/api/workspaces/invitations')).toBe(
          `${origin}/api/workspaces/invitations`
        );
        expect(resolveInternalApiUrl('/api/unowned')).toBe(
          `${origin}/api/unowned`
        );
        expect(
          resolveInternalApiUrl(
            '/api/workspaces/ws-1/wallets',
            'https://explicit.example.test'
          )
        ).toBe('https://explicit.example.test/api/workspaces/ws-1/wallets');
      }
    );
  });
});

it('isolates the URL resolver across interleaved SSR requests', async () => {
  const request = async (origin: string, base: string) =>
    withBridgeRequest(
      { request: new Request(`${origin}${base}/en/ws-1`), appBase: base },
      async () => {
        await Promise.resolve();
        return resolveInternalApiUrl('/api/workspaces/ws-1/wallets');
      }
    );
  expect(
    await Promise.all([
      request('https://tuturuuu.com', '/finance'),
      request('https://finance.tuturuuu.com', ''),
    ])
  ).toEqual([
    'https://tuturuuu.com/finance/api/workspaces/ws-1/wallets',
    'https://finance.tuturuuu.com/api/workspaces/ws-1/wallets',
  ]);
});
