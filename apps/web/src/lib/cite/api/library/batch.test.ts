import { NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  options: [] as unknown[],
  authorize: vi.fn(),
  getMany: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/api-auth', () => ({
  withSessionAuth: (
    handler: (r: Request, a: unknown, p: unknown) => unknown,
    options: unknown
  ) => {
    mocks.options.push(options);
    return (request: Request, context: { params: unknown }) =>
      handler(
        request,
        { supabase: {}, user: { id: 'user-1' } },
        context.params
      );
  },
}));
vi.mock('@/lib/cite/library/authorization', () => ({
  authorizeCitationLibrary: mocks.authorize,
  createAuthorizedCitationLibraryService: async () => ({
    getMany: mocks.getMany,
  }),
}));
const { POST } = await import('./batch');

const context = { params: { wsId: 'ws-1' } };
const post = (body: string, type = 'application/json') =>
  new Request(
    'https://tuturuuu.com/api/v1/workspaces/ws-1/cite/library/batch',
    {
      method: 'POST',
      headers: { 'content-type': type },
      body,
    }
  );

beforeEach(() => {
  mocks.authorize.mockReset();
  mocks.getMany.mockReset();
});

describe('citation library batch route', () => {
  it('uses session auth with the small batch payload cap', () => {
    expect(mocks.options).toEqual([
      { allowAppSessionAuth: true, maxPayloadSize: 4096 },
    ]);
  });

  it('denies before reading the body or touching the service', async () => {
    mocks.authorize.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 }),
    });
    const response = await POST(post('{}') as never, context as never);
    expect(response.status).toBe(403);
    expect(mocks.getMany).not.toHaveBeenCalled();
  });

  it('passes the authorized scope and parsed body to the service', async () => {
    const scope = { wsId: 'verified-ws', actorId: 'user-1' };
    mocks.authorize.mockResolvedValue({ ok: true, scope });
    mocks.getMany.mockResolvedValue({ items: [], missingIds: [] });
    const response = await POST(
      post('{"ids":["a"]}') as never,
      context as never
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(mocks.getMany).toHaveBeenCalledWith(scope, { ids: ['a'] });
  });

  it('rejects a non-JSON body with a fixed 400', async () => {
    mocks.authorize.mockResolvedValue({
      ok: true,
      scope: { wsId: 'ws', actorId: 'user-1' },
    });
    const response = await POST(
      post('ids=a', 'text/plain') as never,
      context as never
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'INVALID_INPUT' });
    expect(mocks.getMany).not.toHaveBeenCalled();
  });
});
