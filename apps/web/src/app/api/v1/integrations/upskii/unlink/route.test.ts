import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  admit: vi.fn(async () => null),
  pace: vi.fn(async () => null),
  revoke: vi.fn(),
  verifySecret: vi.fn(),
}));

vi.mock('@/lib/integrations/upskii/rate-limit', () => ({
  admitAccountLinkRequest: mocks.admit,
  limitVerifiedAccountLinkRequest: vi.fn(async () => null),
}));
vi.mock('@/lib/external-apps/exchange-rate-limit', () => ({
  paceExternalAppExchangeFailure: mocks.pace,
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
vi.mock('@/lib/integrations/upskii/link-service', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  revokeUpskiiLinkFromProvider: mocks.revoke,
}));

const { POST } = await import('./route');

const BODY = {
  linkId: '00000000-0000-4000-9000-000000000001',
  upskiiUserId: 'u-1',
};

function request(body: unknown, appId = 'upskii', secret = 'secret') {
  return new NextRequest(
    'https://tuturuuu.com/api/v1/integrations/upskii/unlink',
    {
      body: JSON.stringify(body),
      headers: { authorization: `Basic ${btoa(`${appId}:${secret}`)}` },
      method: 'POST',
    }
  );
}

describe('POST /api/v1/integrations/upskii/unlink', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.admit.mockResolvedValue(null);
    mocks.pace.mockResolvedValue(null);
    mocks.verifySecret.mockResolvedValue({ app: {}, ok: true });
    mocks.revoke.mockResolvedValue('revoked');
  });

  it('refuses another app id before checking any secret', async () => {
    const response = await POST(request(BODY, 'other-app'));
    expect(response.status).toBe(401);
    expect(mocks.verifySecret).not.toHaveBeenCalled();
  });

  it('ignores credentials in the body', async () => {
    const response = await POST(
      new NextRequest(
        'https://tuturuuu.com/api/v1/integrations/upskii/unlink',
        {
          body: JSON.stringify({
            ...BODY,
            appId: 'upskii',
            appSecret: 'secret',
          }),
          method: 'POST',
        }
      )
    );
    expect(response.status).toBe(401);
    expect(mocks.verifySecret).not.toHaveBeenCalled();
  });

  it('answers 429 once the request is over its limit', async () => {
    mocks.admit.mockResolvedValueOnce(
      new Response(null, { status: 429 }) as never
    );
    const response = await POST(request(BODY));
    expect(response.status).toBe(429);
    expect(mocks.verifySecret).not.toHaveBeenCalled();
  });

  it('refuses a wrong secret and paces repeated failures', async () => {
    mocks.verifySecret.mockResolvedValue({ error: 'bad', ok: false });
    const response = await POST(request(BODY));
    expect(response.status).toBe(401);
    expect(mocks.pace).toHaveBeenCalledWith(
      expect.objectContaining({ appId: 'upskii' }),
      'secret'
    );
    expect(mocks.revoke).not.toHaveBeenCalled();
  });

  it('answers LINK_NOT_FOUND for another user or a missing link', async () => {
    mocks.revoke.mockResolvedValue('not_found');
    const response = await POST(request(BODY));
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ code: 'LINK_NOT_FOUND' });
  });

  it('revokes the named link', async () => {
    const response = await POST(request(BODY));
    expect(response.status).toBe(200);
    expect(mocks.revoke).toHaveBeenCalledWith(expect.anything(), {
      linkId: BODY.linkId,
      upskiiUserId: 'u-1',
    });
  });
});
