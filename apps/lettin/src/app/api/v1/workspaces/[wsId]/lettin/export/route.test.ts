import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  actor: vi.fn(),
  bindings: vi.fn(),
  export: vi.fn(),
}));
vi.mock('@/server/identity', () => ({ resolveActor: mocks.actor }));
vi.mock('@/server/bindings', () => ({ bindings: mocks.bindings }));
vi.mock('@/server/notebook-export', () => ({ exportNotebook: mocks.export }));
vi.mock('next/server', async (original) => ({
  ...(await original<typeof import('next/server')>()),
  connection: vi.fn(),
}));

import { LettinError } from '@/server/context';
import { GET } from './route';

const actor = '00000000-0000-4000-8000-000000000001',
  worldId = '00000000-0000-4000-8000-000000000002';
const url =
    'https://lettin.tuturuuu.com/api/v1/workspaces/personal/lettin/export',
  context = { params: Promise.resolve({ wsId: 'personal' }) };
beforeEach(() => {
  vi.clearAllMocks();
  mocks.actor.mockResolvedValue({ id: actor });
  mocks.bindings.mockResolvedValue({ db: 'fixture' });
  mocks.export.mockResolvedValue({ format: 'lettin-notebook' });
});
it('defaults to published export, binds actor and emits a private attachment', async () => {
  const response = await GET(
    new Request(`${url}?worldId=${worldId}&expectedActor=${actor}`),
    context
  );
  expect(response.status).toBe(200);
  expect(response.headers.get('Cache-Control')).toBe('private, no-store');
  expect(response.headers.get('Content-Disposition')).toContain(
    'lettin-notebook.json'
  );
  expect(mocks.export).toHaveBeenCalledWith(
    'fixture',
    { id: actor },
    worldId,
    'published',
    false
  );
  expect(mocks.actor).toHaveBeenCalledWith('personal');
});
it.each([
  'worldId=bad',
  `worldId=${worldId}&worldId=${worldId}`,
  `worldId=${worldId}&scope=bad`,
  `worldId=${worldId}&extra=1`,
])('rejects unchecked export input %s', async (query) => {
  expect(
    (await GET(new Request(`${url}?${query}&expectedActor=${actor}`), context))
      .status
  ).toBe(400);
  expect(mocks.export).not.toHaveBeenCalled();
});
it('rejects account changes before reading documents', async () => {
  expect(
    (
      await GET(
        new Request(`${url}?worldId=${worldId}&expectedActor=${worldId}`),
        context
      )
    ).status
  ).toBe(409);
  expect(mocks.bindings).not.toHaveBeenCalled();
});
it('preserves authorization failures without resolving storage', async () => {
  mocks.actor.mockRejectedValue(new LettinError(401));
  expect((await GET(new Request(url), context)).status).toBe(401);
  expect(mocks.bindings).not.toHaveBeenCalled();
});
