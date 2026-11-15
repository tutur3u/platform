import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AUTH_CANONICAL_ORIGINS } from './constants/common';
import { proxy } from './proxy';

const mocks = vi.hoisted(() => {
  process.env.NOVA_APP_URL = 'https://nova.tuturuuu.com';
  return { updateSession: vi.fn() };
});

vi.mock('@tuturuuu/supabase/next/proxy', () => ({
  updateSession: mocks.updateSession,
}));
vi.mock('next-intl/middleware', () => ({
  default: () => () => NextResponse.next(),
}));
vi.mock('next-intl/navigation', () => ({
  createNavigation: () => ({}),
}));

function anonymousRequest(origin: string, headers?: Record<string, string>) {
  return new NextRequest(`${origin}/dashboard?tab=recent`, { headers });
}

async function loginReturnUrl(req: NextRequest): Promise<URL> {
  const response = await proxy(req);
  const location = response.headers.get('location');
  expect(location).toBeTruthy();
  const returnUrl = new URL(location ?? '').searchParams.get('returnUrl');
  expect(returnUrl).toBeTruthy();
  return new URL(returnUrl ?? '');
}

describe('nova login return origin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.updateSession.mockResolvedValue({
      claims: null,
      res: NextResponse.next(),
    });
  });

  it('accepts both public Nova hosts as canonical', () => {
    expect(AUTH_CANONICAL_ORIGINS[0]).toBe('https://nova.tuturuuu.com');
    expect(AUTH_CANONICAL_ORIGINS).toEqual(
      expect.arrayContaining([
        'https://nova.ai.vn',
        'https://nova.tuturuuu.com',
      ])
    );
  });

  it.each(['https://nova.ai.vn', 'https://nova.tuturuuu.com'])(
    'returns signed-out users on %s to that host',
    async (origin) => {
      const returnUrl = await loginReturnUrl(anonymousRequest(origin));

      expect(returnUrl.origin).toBe(origin);
      expect(returnUrl.pathname).toBe('/verify-token');
      expect(returnUrl.searchParams.get('nextUrl')).toBe(
        '/dashboard?tab=recent'
      );
    }
  );

  it.each(['https://nova.ai.vn', 'https://nova.tuturuuu.com'])(
    'never reflects a hostile forwarded host on %s',
    async (origin) => {
      const returnUrl = await loginReturnUrl(
        anonymousRequest(origin, { 'x-forwarded-host': 'evil.example' })
      );

      expect(returnUrl.origin).toBe('https://nova.tuturuuu.com');
      expect(returnUrl.host).not.toContain('evil.example');
    }
  );
});
