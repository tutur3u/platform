import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  status: vi.fn(),
  verifySecret: vi.fn(),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: vi.fn(async () => ({})),
}));
vi.mock('@/lib/app-coordination/external-apps', () => ({
  verifyExternalAppSecret: mocks.verifySecret,
}));
vi.mock('@/lib/integrations/upskii/rate-limit', () => ({
  admitAccountLinkRequest: vi.fn(async () => null),
  limitVerifiedAccountLinkRequest: vi.fn(async () => null),
}));
vi.mock('@/lib/external-apps/exchange-rate-limit', () => ({
  paceExternalAppExchangeFailure: vi.fn(async () => null),
}));
vi.mock('@/lib/integrations/upskii/link-store', () => ({
  createExternalAccountLinkStore: () => ({}),
}));
vi.mock('@/lib/integrations/upskii/link-service', () => ({
  getUpskiiLinkStatusForProvider: mocks.status,
}));

const { POST } = await import('./route');

const BODY = {
  linkId: '00000000-0000-4000-9000-000000000001',
  upskiiUserId: 'u-1',
};

function request(secret = 'secret') {
  return new NextRequest(
    'https://tuturuuu.com/api/v1/integrations/upskii/link-status',
    {
      body: JSON.stringify(BODY),
      headers: { authorization: `Basic ${btoa(`upskii:${secret}`)}` },
      method: 'POST',
    }
  );
}

describe('POST /api/v1/integrations/upskii/link-status', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.verifySecret.mockResolvedValue({ app: {}, ok: true });
    mocks.status.mockResolvedValue({ active: true });
  });

  it('answers only Upskii with valid credentials', async () => {
    mocks.verifySecret.mockResolvedValue({ error: 'bad', ok: false });
    expect((await POST(request('wrong'))).status).toBe(401);
    expect(mocks.status).not.toHaveBeenCalled();
  });

  it('checks the named link for the named Upskii user, uncached', async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual({ active: true });
    expect(mocks.status).toHaveBeenCalledWith(expect.anything(), BODY);
  });
});
