import { NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CitationLibraryError } from '@/lib/cite/library/contracts';

const mocks = vi.hoisted(() => ({
  options: [] as unknown[],
  authorize: vi.fn(),
  get: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
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
    get: mocks.get,
    update: mocks.update,
    remove: mocks.remove,
  }),
}));
const { GET, PATCH, DELETE } = await import('./route');

const itemId = '33333333-3333-4333-8333-333333333333';
const scope = { wsId: 'verified-ws', actorId: 'user-1' };
const context = (id = itemId) => ({ params: { wsId: 'ws-1', itemId: id } });
const call = (method: string, body?: unknown) =>
  new Request('https://tuturuuu.com/api/v1/workspaces/ws-1/cite/library/x', {
    method,
    headers: { 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

beforeEach(() => {
  for (const mock of [mocks.authorize, mocks.get, mocks.update, mocks.remove])
    mock.mockReset();
  mocks.authorize.mockResolvedValue({ ok: true, scope });
});

describe('citation library item route', () => {
  it('uses session auth with the item payload cap on every method', () => {
    expect(mocks.options).toHaveLength(3);
    for (const options of mocks.options)
      expect(options).toEqual({
        allowAppSessionAuth: true,
        maxPayloadSize: 65536,
      });
  });

  it('denies every method before touching the service', async () => {
    mocks.authorize.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 }),
    });
    for (const [handler, method, body] of [
      [GET, 'GET'],
      [PATCH, 'PATCH', {}],
      [DELETE, 'DELETE', { expectedVersion: 1 }],
    ] as const) {
      const response = await handler(
        call(method, body) as never,
        context() as never
      );
      expect(response.status).toBe(403);
    }
    expect(mocks.get).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it('rejects a non-UUID item id with a fixed 400', async () => {
    const response = await GET(call('GET') as never, context('nope') as never);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'INVALID_INPUT' });
    expect(mocks.get).not.toHaveBeenCalled();
  });

  it('reads one item within the authorized scope', async () => {
    mocks.get.mockResolvedValue({ id: itemId });
    const response = await GET(call('GET') as never, context() as never);
    expect(response.status).toBe(200);
    expect(mocks.get).toHaveBeenCalledWith(scope, itemId);
  });

  it('maps a missing item and a version conflict to fixed statuses', async () => {
    mocks.get.mockRejectedValue(new CitationLibraryError('NOT_FOUND', 404));
    expect((await GET(call('GET') as never, context() as never)).status).toBe(
      404
    );
    mocks.update.mockRejectedValue(
      new CitationLibraryError('VERSION_CONFLICT', 409)
    );
    const response = await PATCH(
      call('PATCH', { expectedVersion: 1 }) as never,
      context() as never
    );
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: 'VERSION_CONFLICT' });
  });

  it('deletes with the expected version and returns an empty 204', async () => {
    mocks.remove.mockResolvedValue(undefined);
    const response = await DELETE(
      call('DELETE', { expectedVersion: 3 }) as never,
      context() as never
    );
    expect(response.status).toBe(204);
    expect(mocks.remove).toHaveBeenCalledWith(scope, itemId, 3);
  });

  it('refuses a delete without an expected version', async () => {
    const response = await DELETE(
      call('DELETE', {}) as never,
      context() as never
    );
    expect(response.status).toBe(400);
    expect(mocks.remove).not.toHaveBeenCalled();
  });
});
