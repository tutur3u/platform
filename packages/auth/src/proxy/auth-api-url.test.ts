import { NextRequest } from 'next/server';
import { afterEach, expect, it, vi } from 'vitest';
import { resolveAuthApiUrl } from './auth-api-url';

afterEach(() => vi.unstubAllEnvs());

it.each(['refresh-app-session', 'verify-app-token'])(
  'resolves mounted %s to the app endpoint without changing root auth',
  (endpoint) => {
    const path = `/api/auth/${endpoint}`;
    const mounted = new NextRequest(
      'https://tuturuuu.com/meet/vi/verify-token',
      {
        nextConfig: { basePath: '/meet' },
      }
    );
    expect(resolveAuthApiUrl(mounted, path, false).href).toBe(
      `https://tuturuuu.com/meet${path}`
    );
    expect(resolveAuthApiUrl(mounted, `/meet${path}`, false).href).toBe(
      `https://tuturuuu.com/meet${path}`
    );
    const root = new NextRequest('https://meet.tuturuuu.com/vi/verify-token');
    expect(resolveAuthApiUrl(root, path, false).href).toBe(
      `https://meet.tuturuuu.com${path}`
    );
  }
);

it('preserves the mounted path through the local portless auth adapter', () => {
  vi.stubEnv('NODE_ENV', 'development');
  vi.stubEnv('PORT', '7805');
  const request = new NextRequest(
    'https://tuturuuu.localhost/meet/verify-token',
    {
      nextConfig: { basePath: '/meet' },
    }
  );
  expect(
    resolveAuthApiUrl(request, '/api/auth/verify-app-token', true).href
  ).toBe('http://127.0.0.1:7805/meet/api/auth/verify-app-token');
});
