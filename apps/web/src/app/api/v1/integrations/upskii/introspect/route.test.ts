import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  introspect: vi.fn(),
  verifySecret: vi.fn(),
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

function request(body: unknown) {
  return new NextRequest(
    'https://tuturuuu.com/api/v1/integrations/upskii/introspect',
    { body: JSON.stringify(body), method: 'POST' }
  );
}

describe('POST /api/v1/integrations/upskii/introspect', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.verifySecret.mockResolvedValue({ app: {}, ok: true });
    mocks.introspect.mockResolvedValue({ active: false });
  });

  it('answers only Upskii with valid credentials', async () => {
    mocks.verifySecret.mockResolvedValue({ error: 'bad', ok: false });
    const response = await POST(
      request({ appId: 'upskii', appSecret: 'wrong', token: 'ttr_app_x' })
    );
    expect(response.status).toBe(401);
    expect(mocks.introspect).not.toHaveBeenCalled();
  });

  it('returns the link answer without caching', async () => {
    const response = await POST(
      request({ appId: 'upskii', appSecret: 'secret', token: 'ttr_app_x' })
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual({ active: false });
  });
});
