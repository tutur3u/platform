import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  admit: vi.fn(async () => null),
  introspect: vi.fn(),
  verifySecret: vi.fn(),
}));

vi.mock('@/lib/integrations/upskii/rate-limit', () => ({
  admitAccountLinkRequest: mocks.admit,
  limitVerifiedAccountLinkRequest: vi.fn(async () => null),
}));
vi.mock('@/lib/external-apps/exchange-rate-limit', () => ({
  paceExternalAppExchangeFailure: vi.fn(async () => null),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: vi.fn(async () => ({})),
}));
vi.mock('@/lib/app-coordination/external-apps', () => ({
  verifyExternalAppSecret: mocks.verifySecret,
}));
vi.mock('@/lib/integrations/upskii/link-store', () => ({
  createExternalAccountLinkStore: () => ({}),
}));
vi.mock('@/lib/integrations/upskii/link-service', () => ({
  introspectUpskiiReadToken: mocks.introspect,
}));

const { POST } = await import('./route');

function request(body: unknown, secret = 'secret') {
  return new NextRequest(
    'https://tuturuuu.com/api/v1/integrations/upskii/introspect',
    {
      body: JSON.stringify(body),
      headers: { authorization: `Basic ${btoa(`upskii:${secret}`)}` },
      method: 'POST',
    }
  );
}

describe('POST /api/v1/integrations/upskii/introspect', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.admit.mockResolvedValue(null);
    mocks.verifySecret.mockResolvedValue({ app: {}, ok: true });
    mocks.introspect.mockResolvedValue({ active: false });
  });

  it('answers only Upskii with valid credentials', async () => {
    mocks.verifySecret.mockResolvedValue({ error: 'bad', ok: false });
    const response = await POST(request({ token: 'ttr_app_x' }, 'wrong'));
    expect(response.status).toBe(401);
    expect(mocks.introspect).not.toHaveBeenCalled();
  });

  it('answers 429 before checking credentials when over the limit', async () => {
    mocks.admit.mockResolvedValueOnce(
      new Response(null, { status: 429 }) as never
    );
    const response = await POST(request({ token: 'ttr_app_x' }));
    expect(response.status).toBe(429);
    expect(mocks.verifySecret).not.toHaveBeenCalled();
  });

  it('returns the link answer without caching', async () => {
    const response = await POST(request({ token: 'ttr_app_x' }));
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual({ active: false });
  });
});
