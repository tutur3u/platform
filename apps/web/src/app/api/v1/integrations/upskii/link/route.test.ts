import { createAppCoordinationToken } from '@tuturuuu/utils/app-coordination-token';
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  canLink: vi.fn(async () => true),
  linkUpskiiAccount: vi.fn(),
  requireLiveExternalApp: vi.fn(async () => ({ ok: true })),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: vi.fn(async () => ({})),
}));
vi.mock('@/lib/api-auth', () => ({
  withSessionAuth: (handler: unknown) => handler,
}));
vi.mock('@/lib/app-coordination/external-app-bearer', () => ({
  requireLiveExternalApp: mocks.requireLiveExternalApp,
}));
vi.mock('@/lib/integrations/upskii/access', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  canUserLinkUpskii: mocks.canLink,
}));
vi.mock('@/lib/integrations/upskii/link-store', () => ({
  createExternalAccountLinkStore: () => ({}),
}));
vi.mock('@/lib/integrations/upskii/link-service', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  linkUpskiiAccount: mocks.linkUpskiiAccount,
}));

const { POST } = await import('./route');

const USER_ID = '00000000-0000-4000-8000-00000000000a';
const BODY = {
  scopes: ['upskii:classes:read'],
  upskiiEmail: 'Learner@Upskii.test',
  upskiiUserId: 'u-1',
};

function bearer(targetApp: string, scopes: string[]) {
  return createAppCoordinationToken({
    email: 'staff@tuturuuu.com',
    scopes,
    targetApp,
    userId: USER_ID,
  }).token;
}

function request(token: string | null, body: unknown = BODY) {
  return new NextRequest(
    'https://tuturuuu.com/api/v1/integrations/upskii/link',
    {
      body: JSON.stringify(body),
      headers: token ? { authorization: `Bearer ${token}` } : {},
      method: 'POST',
    }
  );
}

describe('POST /api/v1/integrations/upskii/link', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.canLink.mockResolvedValue(true);
    mocks.requireLiveExternalApp.mockResolvedValue({ ok: true });
    mocks.linkUpskiiAccount.mockResolvedValue({
      created: true,
      link: {
        id: '00000000-0000-4000-9000-000000000001',
        linked_at: '2026-11-24T00:00:00.000Z',
        scopes: ['upskii:classes:read'],
      },
      ok: true,
    });
  });

  it.each([
    ['no bearer', null],
    ['another app', bearer('other-app', ['upskii-link:write'])],
    [
      'a bearer without the link scope',
      bearer('upskii', ['users:profile:read']),
    ],
  ])('refuses %s', async (_label, token) => {
    const response = await POST(request(token));
    expect(response.status).toBe(401);
    expect(mocks.linkUpskiiAccount).not.toHaveBeenCalled();
  });

  it('refuses a bearer from a disabled or rotated app', async () => {
    mocks.requireLiveExternalApp.mockResolvedValue({
      ok: false,
      response: new Response(null, { status: 403 }),
    } as never);
    const response = await POST(
      request(bearer('upskii', ['upskii-link:write']))
    );
    expect(response.status).toBe(403);
    expect(mocks.linkUpskiiAccount).not.toHaveBeenCalled();
  });

  it('refuses scopes outside the read-only set', async () => {
    const response = await POST(
      request(bearer('upskii', ['upskii-link:write']), {
        ...BODY,
        scopes: ['upskii:classes:write'],
      })
    );
    expect(response.status).toBe(400);
  });

  it('keeps linking to verified staff during early access', async () => {
    mocks.canLink.mockResolvedValue(false);
    const response = await POST(
      request(bearer('upskii', ['upskii-link:write']))
    );
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: 'EARLY_ACCESS_ONLY' });
    expect(mocks.linkUpskiiAccount).not.toHaveBeenCalled();
  });

  it('answers a cross-account conflict with the side that is taken', async () => {
    mocks.linkUpskiiAccount.mockResolvedValue({
      code: 'LINK_CONFLICT',
      ok: false,
      side: 'upskii',
    });
    const response = await POST(
      request(bearer('upskii', ['upskii-link:write']))
    );
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      code: 'LINK_CONFLICT',
      side: 'upskii',
    });
  });

  it('links the bearer user, never a user named in the body', async () => {
    const response = await POST(
      request(bearer('upskii', ['upskii-link:write']), {
        ...BODY,
        userId: '00000000-0000-4000-8000-00000000000b',
      })
    );
    expect(response.status).toBe(201);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(mocks.linkUpskiiAccount).toHaveBeenCalledWith(expect.anything(), {
      scopes: ['upskii:classes:read'],
      upskiiEmail: 'learner@upskii.test',
      upskiiUserId: 'u-1',
      userId: USER_ID,
    });
  });
});
