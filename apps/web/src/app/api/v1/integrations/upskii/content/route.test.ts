import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  fetchContent: vi.fn(),
  mint: vi.fn(),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: vi.fn(async () => ({})),
}));
vi.mock('@/lib/api-auth', () => ({
  withSessionAuth:
    (handler: (request: NextRequest, context: unknown) => unknown) =>
    (request: NextRequest) =>
      handler(request, { user: { id: 'session-user' } }),
}));
vi.mock('@/lib/integrations/upskii/link-store', () => ({
  createExternalAccountLinkStore: () => ({}),
}));
vi.mock('@/lib/integrations/upskii/read-token', () => ({
  mintUpskiiReadTokenForUser: mocks.mint,
}));
vi.mock('@/lib/integrations/upskii/content', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  fetchUpskiiContent: mocks.fetchContent,
}));

const { GET } = await import('./route');

const get = (query: string) =>
  (GET as unknown as (request: NextRequest) => Promise<Response>)(
    new NextRequest(
      `https://tuturuuu.com/api/v1/integrations/upskii/content${query}`
    )
  );

describe('GET /api/v1/integrations/upskii/content', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.mint.mockResolvedValue({
      linkId: 'link-1',
      ok: true,
      token: 'ttr_app_read',
      upskiiUserId: 'u-1',
    });
    mocks.fetchContent.mockResolvedValue({ items: [], ok: true });
  });

  it('reads for the session user only, ignoring user or link parameters', async () => {
    const response = await get(
      '?kind=lessons&classId=c-1&userId=someone-else&linkId=other'
    );
    expect(response.status).toBe(200);
    expect(mocks.mint).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: 'upskii:lessons:read',
        userId: 'session-user',
      })
    );
    expect(mocks.fetchContent).toHaveBeenCalledWith({
      classId: 'c-1',
      kind: 'lessons',
      token: 'ttr_app_read',
    });
    expect(JSON.stringify(await response.json())).not.toContain('ttr_app');
  });

  it.each([
    ['?kind=users', 'INVALID_KIND'],
    ['?kind=lessons', 'CLASS_ID_REQUIRED'],
    ['?kind=assessments&classId=../x', 'CLASS_ID_REQUIRED'],
  ])('refuses %s', async (query, code) => {
    const response = await get(query);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ code });
    expect(mocks.mint).not.toHaveBeenCalled();
  });

  it.each([
    ['NOT_LINKED', 404],
    ['EARLY_ACCESS_ONLY', 403],
    ['SCOPE_NOT_GRANTED', 403],
  ])('answers %s without calling Upskii', async (code, status) => {
    mocks.mint.mockResolvedValue({ code, ok: false });
    const response = await get('?kind=classes');
    expect(response.status).toBe(status);
    expect(mocks.fetchContent).not.toHaveBeenCalled();
  });

  it('passes Upskii failures through as codes', async () => {
    mocks.fetchContent.mockResolvedValue({
      code: 'CLASS_NOT_FOUND',
      ok: false,
      status: 404,
    });
    const response = await get('?kind=lessons&classId=foreign');
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ code: 'CLASS_NOT_FOUND' });
  });
});
