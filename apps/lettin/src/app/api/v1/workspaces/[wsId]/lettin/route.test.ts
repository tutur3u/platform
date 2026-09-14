import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  actor: vi.fn(),
  mutate: vi.fn(),
  overview: vi.fn(),
  world: vi.fn(),
}));
vi.mock('next/server', async (original) => ({
  ...(await original<typeof import('next/server')>()),
  connection: vi.fn(),
}));
vi.mock('@/server/bindings', () => ({ bindings: async () => ({ db: {} }) }));
vi.mock('@/server/identity', () => ({ resolveActor: mocks.actor }));
vi.mock('@/server/mutations', () => ({ mutate: mocks.mutate }));
vi.mock('@/server/queries', () => ({
  readOverview: mocks.overview,
  readWorld: mocks.world,
}));

import { LettinError } from '@/server/context';
import { GET, POST } from './route';

const context = { params: Promise.resolve({ wsId: 'personal' }) };
beforeEach(() => {
  vi.clearAllMocks();
  mocks.actor.mockResolvedValue({ id: 'actor', wsId: 'normalized' });
  mocks.overview.mockResolvedValue({ worlds: [] });
  mocks.mutate.mockResolvedValue({ id: 'world' });
});
it('uses the resolved shared identity and does not cache private data', async () => {
  const response = await GET(
    new Request('https://lettin.tuturuuu.com/api'),
    context
  );
  expect(mocks.actor).toHaveBeenCalledWith('personal');
  expect(mocks.overview).toHaveBeenCalledWith(
    {},
    { id: 'actor', wsId: 'normalized' }
  );
  expect(response.headers.get('cache-control')).toContain('no-store');
});
it('denies data access before querying D1', async () => {
  mocks.actor.mockRejectedValue(new LettinError(403));
  expect(
    (await GET(new Request('https://lettin.tuturuuu.com/api'), context)).status
  ).toBe(403);
  expect(mocks.overview).not.toHaveBeenCalled();
});
it('rejects malformed and oversized bodies before mutations', async () => {
  for (const [body, status] of [
    ['{', 400],
    ['x'.repeat(300001), 413],
  ] as const) {
    expect(
      (
        await POST(
          new Request('https://lettin.tuturuuu.com/api', {
            method: 'POST',
            body,
          }),
          context
        )
      ).status
    ).toBe(status);
  }
  expect(mocks.mutate).not.toHaveBeenCalled();
});
it('returns revision conflicts and strips spoofed actor fields', async () => {
  mocks.mutate.mockRejectedValue(new LettinError(409, 'Revision conflict'));
  const request = new Request('https://lettin.tuturuuu.com/api', {
    method: 'POST',
    body: JSON.stringify({
      action: 'publishWorld',
      worldId: '00000000-0000-4000-8000-000000008401',
      version: 1,
      actor: 'spoofed',
    }),
  });
  expect((await POST(request, context)).status).toBe(409);
  expect(mocks.mutate.mock.calls[0]?.[2]).not.toHaveProperty('actor');
});

it('validates and dispatches selected world reads', async () => {
  const id = '00000000-0000-4000-8000-000000008401';
  mocks.world.mockResolvedValue({ world: { id } });
  const response = await GET(
    new Request(`https://lettin.tuturuuu.com/api?worldId=${id}`),
    context
  );
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ world: { id } });
  expect(mocks.world).toHaveBeenCalledWith(
    {},
    { id: 'actor', wsId: 'normalized' },
    id
  );
  mocks.world.mockClear();
  expect(
    (
      await GET(
        new Request('https://lettin.tuturuuu.com/api?worldId=invalid'),
        context
      )
    ).status
  ).toBe(400);
  expect(mocks.world).not.toHaveBeenCalled();
});
it('returns successful mutation results', async () => {
  const response = await POST(
    new Request('https://lettin.tuturuuu.com/api', {
      method: 'POST',
      body: JSON.stringify({
        action: 'publishWorld',
        worldId: '00000000-0000-4000-8000-000000008401',
        version: 1,
      }),
    }),
    context
  );
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ id: 'world' });
});
