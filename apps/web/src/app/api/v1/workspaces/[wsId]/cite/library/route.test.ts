import { NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  wrapped: [] as { options: unknown }[],
  authorize: vi.fn(),
  list: vi.fn(),
  create: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  connection: async () => undefined,
}));
vi.mock('@/lib/api-auth', () => ({
  withSessionAuth: (
    handler: (r: Request, a: unknown, p: unknown) => unknown,
    options: unknown
  ) => {
    mocks.wrapped.push({ options });
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
}));
vi.mock('@/lib/cite/library/store', () => ({
  getCitationLibraryStore: () => ({}),
}));
vi.mock('@/lib/cite/library/service', () => ({
  createCitationLibraryService: () => ({
    list: mocks.list,
    create: mocks.create,
  }),
}));
const { GET, POST } = await import('./route');

const context = { params: { wsId: 'ws-1' } };
const get = () =>
  new Request('https://tuturuuu.com/api/v1/workspaces/ws-1/cite/library');

beforeEach(() => {
  for (const mock of [mocks.authorize, mocks.list, mocks.create])
    mock.mockReset();
});

describe('citation library collection route', () => {
  it('requires session auth with a bounded payload on every method', () => {
    expect(mocks.wrapped).toHaveLength(2);
    for (const { options } of mocks.wrapped)
      expect(options).toEqual({
        allowAppSessionAuth: true,
        maxPayloadSize: 65536,
      });
  });

  it('returns the authorization denial without touching the service', async () => {
    mocks.authorize.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 }),
    });
    const read = await GET(get() as never, context as never);
    expect(read.status).toBe(403);
    const write = await POST(
      new Request(get().url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      }) as never,
      context as never
    );
    expect(write.status).toBe(403);
    expect(mocks.list).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('lists only within the authorized workspace scope', async () => {
    const scope = { wsId: 'verified-ws', actorId: 'user-1' };
    mocks.authorize.mockResolvedValue({ ok: true, scope });
    mocks.list.mockResolvedValue({ items: [], limit: 50, offset: 0 });
    const response = await GET(get() as never, context as never);
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(mocks.list.mock.calls[0]?.[0]).toBe(scope);
  });

  it('reports an unprovisioned store as a fixed 503 without internal detail', async () => {
    mocks.authorize.mockResolvedValue({
      ok: true,
      scope: { wsId: 'ws', actorId: 'user-1' },
    });
    mocks.list.mockRejectedValue(new Error('relation missing'));
    const response = await GET(get() as never, context as never);
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: 'LIBRARY_UNAVAILABLE' });
  });
});
