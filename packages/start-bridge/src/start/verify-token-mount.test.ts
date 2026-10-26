import { NextResponse } from 'next/dist/server/web/spec-extension/response';
import { describe, expect, it, vi } from 'vitest';
import { createBridgeHandler } from './handler';

vi.mock('@tuturuuu/supabase/next/proxy', () => ({ updateSession: vi.fn() }));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: vi.fn(),
  createClient: vi.fn(),
}));

const { consumeVerifyTokenRequest } = await import('@tuturuuu/auth/proxy');

// The shared satellite verify-token step, as Finance's proxy runs it.
const handle = createBridgeHandler<
  Record<string, never>,
  { waitUntil(work: Promise<unknown>): void }
>({
  mounts: {
    app: 'finance',
    rootHosts: ['finance.tuturuuu.com'],
    mountHosts: ['tuturuuu.com'],
    basePath: '/finance',
  },
  start: { fetch: async () => new Response('page') },
  proxy: async (request) =>
    (await consumeVerifyTokenRequest(request, { locales: ['en', 'vi'] })) ??
    NextResponse.next(),
  assets: () => undefined,
  centralApiOrigin: () => 'https://tuturuuu.com',
});
const ctx = { waitUntil: vi.fn() };

describe('tokenless verify-token through the bridge handler', () => {
  it.each(['/verify-token', '/en/verify-token', '/vi/verify-token'])(
    'keeps the apex mount for /finance%s',
    async (path) => {
      const response = await handle(
        new Request(`https://tuturuuu.com/finance${path}`),
        {},
        ctx
      );

      expect(response.status).toBe(307);
      expect(response.headers.get('location')).toBe(
        'https://tuturuuu.com/finance'
      );
    }
  );

  it.each(['/verify-token', '/en/verify-token'])(
    'stays at the subdomain root for %s, ignoring a forged mount header',
    async (path) => {
      const response = await handle(
        new Request(`https://finance.tuturuuu.com${path}`, {
          headers: {
            'x-forwarded-prefix': '/evil',
            'x-tuturuuu-app-base': '/evil',
          },
        }),
        {},
        ctx
      );

      expect(response.headers.get('location')).toBe(
        'https://finance.tuturuuu.com/'
      );
    }
  );
});
