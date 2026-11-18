import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const handlers = vi.hoisted(() => ({
  batch: vi.fn(),
  list: vi.fn(),
  create: vi.fn(),
  get: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  connection: async () => undefined,
}));
vi.mock('@/lib/cite/api/library/batch', () => ({ POST: handlers.batch }));
vi.mock('@/lib/cite/api/library/collection', () => ({
  GET: handlers.list,
  POST: handlers.create,
}));
vi.mock('@/lib/cite/api/library/item', () => ({
  GET: handlers.get,
  PATCH: handlers.update,
  DELETE: handlers.remove,
}));
const route = await import('./route');

const itemId = '33333333-3333-4333-8333-333333333333';
const call = (
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  segments?: string[]
) =>
  route[method](
    new NextRequest(
      'https://tuturuuu.com/api/v1/workspaces/ws-1/cite/library',
      {
        method,
      }
    ),
    { params: Promise.resolve({ wsId: 'ws-1', segments }) }
  );

beforeEach(() => {
  for (const handler of Object.values(handlers)) {
    handler.mockReset();
    handler.mockResolvedValue(Response.json({ ok: true }));
  }
});

function only(name: keyof typeof handlers) {
  for (const [key, handler] of Object.entries(handlers))
    expect(handler).toHaveBeenCalledTimes(key === name ? 1 : 0);
}

describe('cite library route', () => {
  it('serves the collection', async () => {
    expect((await call('GET')).status).toBe(200);
    only('list');
    expect(handlers.list.mock.calls[0]?.[1]).toEqual({
      params: expect.any(Promise),
    });
    await expect(handlers.list.mock.calls[0]?.[1].params).resolves.toEqual({
      wsId: 'ws-1',
    });
  });

  it('creates through the collection and reads the batch', async () => {
    await call('POST');
    only('create');
    for (const handler of Object.values(handlers)) handler.mockClear();
    await call('POST', ['batch']);
    only('batch');
  });

  it.each([
    ['GET', 'get'],
    ['PATCH', 'update'],
    ['DELETE', 'remove'],
  ] as const)(
    'sends %s on an item id to its handler with the id',
    async (method, name) => {
      expect((await call(method, [itemId])).status).toBe(200);
      only(name);
      await expect(handlers[name].mock.calls[0]?.[1].params).resolves.toEqual({
        wsId: 'ws-1',
        itemId,
      });
    }
  );

  it.each([
    ['PATCH', undefined, 'GET, POST'],
    ['DELETE', undefined, 'GET, POST'],
    ['GET', ['batch'], 'POST'],
    ['PATCH', ['batch'], 'POST'],
    ['POST', [itemId], 'GET, PATCH, DELETE'],
  ] as const)('rejects %s on %j with 405', async (method, segments, allow) => {
    const response = await call(method, segments ? [...segments] : undefined);
    expect(response.status).toBe(405);
    expect(response.headers.get('allow')).toBe(allow);
    for (const handler of Object.values(handlers))
      expect(handler).not.toHaveBeenCalled();
  });

  it('returns a fixed 404 for deeper paths', async () => {
    const response = await call('GET', [itemId, 'extra']);
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'NOT_FOUND' });
    for (const handler of Object.values(handlers))
      expect(handler).not.toHaveBeenCalled();
  });
});
