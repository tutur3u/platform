import './required-mfa-test-fixture';
import { NextRequest } from 'next/server';
import { describe, expect, it, vi } from 'vitest';
import { consumeVerifyTokenRequest } from './index';

vi.mock('@tuturuuu/supabase/next/proxy', () => ({ updateSession: vi.fn() }));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: vi.fn(),
  createClient: vi.fn(),
}));

const locales = ['en', 'vi'];

describe('tokenless verify-token redirects keep the trusted mount', () => {
  it.each(['/verify-token', '/en/verify-token', '/vi/verify-token'])(
    'stays at the root of a subdomain app: %s',
    async (path) => {
      const response = await consumeVerifyTokenRequest(
        new NextRequest(`https://finance.tuturuuu.com${path}`),
        { locales }
      );

      expect(response?.headers.get('location')).toBe(
        'https://finance.tuturuuu.com/'
      );
    }
  );

  it.each(['/verify-token', '/en/verify-token', '/vi/verify-token'])(
    'stays inside the /finance mount: %s',
    async (path) => {
      const response = await consumeVerifyTokenRequest(
        new NextRequest(`https://tuturuuu.com/finance${path}`, {
          nextConfig: { basePath: '/finance' },
        }),
        { locales }
      );

      expect(response?.headers.get('location')).toBe(
        'https://tuturuuu.com/finance'
      );
    }
  );

  it('never derives a mount from forwarded headers', async () => {
    const response = await consumeVerifyTokenRequest(
      new NextRequest('https://finance.tuturuuu.com/verify-token', {
        headers: {
          'x-forwarded-prefix': '/evil',
          'x-tuturuuu-app-base': '/evil',
        },
      }),
      { locales }
    );

    expect(response?.headers.get('location')).toBe(
      'https://finance.tuturuuu.com/'
    );
  });
});
