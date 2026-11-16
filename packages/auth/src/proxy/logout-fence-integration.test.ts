import { NextRequest } from 'next/server';
import { describe, expect, it, vi } from 'vitest';
vi.mock('@tuturuuu/supabase/next/proxy', () => ({
  updateSession: vi.fn(() => {
    throw new Error('Provider auth must not run');
  }),
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createClient: vi.fn(),
  createAdminClient: vi.fn(),
}));
import { createCentralizedAuthProxy } from './index';

const proxy = createCentralizedAuthProxy({
  canonicalOrigins: ['https://parley.tuturuuu.com'],
  webAppUrl: 'https://tuturuuu.com',
  publicPaths: ['/login'],
  skipApiRoutes: false,
});
const request = (path: string) =>
  new NextRequest(`https://parley.tuturuuu.com${path}`, {
    headers: {
      cookie: '__Host-tuturuuu_app_signed_out=1; sb-shared-auth-token=fixture',
    },
  });
describe('Supabase-only proxy logout fence', () => {
  it.each(['/r/code', '/login', '/vi/login'])(
    'requires an explicit central confirmation at %s',
    async (path) => {
      const response = await proxy(request(path));
      const location = new URL(response.headers.get('location')!);
      expect(location.origin).toBe('https://tuturuuu.com');
      expect(location.pathname).toBe('/login');
      expect(location.searchParams.get('confirmAccount')).toBe('1');
      expect(new URL(location.searchParams.get('returnUrl')!).origin).toBe(
        'https://parley.tuturuuu.com'
      );
      expect(response.headers.has('set-cookie')).toBe(false);
    }
  );
  it('denies private API requests without calling provider auth', async () => {
    const response = await proxy(request('/api/meet-call/room/token'));
    expect(response.status).toBe(401);
    expect(response.headers.has('set-cookie')).toBe(false);
  });
});
