import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  user: vi.fn(),
  bindings: vi.fn(),
  list: vi.fn(),
  read: vi.fn(),
  save: vi.fn(),
}));
vi.mock('@tuturuuu/satellite/auth', () => ({
  getSatelliteAppSessionUser: mocks.user,
}));
vi.mock('@/server/bindings', () => ({ bindings: mocks.bindings }));
vi.mock('@/server/creator-bookmarks', () => ({
  savedCreators: mocks.list,
  creatorSaved: mocks.read,
  setCreatorSaved: mocks.save,
}));
vi.mock('next/server', async (original) => ({
  ...(await original<typeof import('next/server')>()),
  connection: vi.fn(),
}));

import { GET, POST } from './route';

const actor = '00000000-0000-4000-8000-000000000001',
  creatorId = '00000000-0000-4000-8000-000000000002',
  other = '00000000-0000-4000-8000-000000000003';
const url = 'https://lettin.tuturuuu.com/api/v1/lettin/creator-bookmarks';
const body = { expectedActor: actor, creatorId, saved: true };
beforeEach(() => {
  vi.clearAllMocks();
  mocks.user.mockResolvedValue({ id: actor });
  mocks.bindings.mockResolvedValue({ db: 'fixture' });
  mocks.list.mockResolvedValue([]);
  mocks.read.mockResolvedValue({ saved: false });
  mocks.save.mockResolvedValue({ saved: true });
});
const post = (value: unknown = body, origin?: string) =>
  POST(
    new Request(url, {
      method: 'POST',
      headers: origin ? { Origin: origin } : undefined,
      body: JSON.stringify(value),
    })
  );
it('requires the owning app session before touching storage', async () => {
  mocks.user.mockResolvedValue(null);
  expect((await GET(new Request(url))).status).toBe(401);
  expect((await post()).status).toBe(401);
  expect(mocks.bindings).not.toHaveBeenCalled();
  expect(mocks.user).toHaveBeenCalledWith('lettin');
});
it('binds private no-store list and status reads to the actor', async () => {
  const response = await GET(new Request(`${url}?expectedActor=${actor}`));
  expect(response.status).toBe(200);
  expect(response.headers.get('Cache-Control')).toBe('private, no-store');
  expect(mocks.list).toHaveBeenCalledWith('fixture', actor);
  await GET(
    new Request(`${url}?expectedActor=${actor}&creatorId=${creatorId}`)
  );
  expect(mocks.read).toHaveBeenCalledWith('fixture', actor, creatorId);
});
it.each([
  `expectedActor=${other}`,
  `expectedActor=${actor}&expectedActor=${actor}`,
  'expectedActor=invalid',
  '',
])('rejects mismatched or invalid actor reads %s', async (query) => {
  expect((await GET(new Request(`${url}?${query}`))).status).toBe(
    query === `expectedActor=${other}` ? 409 : 400
  );
  expect(mocks.bindings).not.toHaveBeenCalled();
});
it.each(['creatorId=bad', `creatorId=${creatorId}&creatorId=${other}`])(
  'rejects invalid source query %s',
  async (query) => {
    expect(
      (await GET(new Request(`${url}?expectedActor=${actor}&${query}`))).status
    ).toBe(400);
    expect(mocks.read).not.toHaveBeenCalled();
  }
);
it('rejects account-switch writes and spoofed ownership fields', async () => {
  expect((await post({ ...body, expectedActor: other })).status).toBe(409);
  expect((await post({ ...body, userId: other })).status).toBe(400);
  expect(mocks.save).not.toHaveBeenCalled();
});
it('rejects cross-origin, malformed and oversized requests', async () => {
  expect((await post(body, 'https://other.example.test')).status).toBe(403);
  expect(
    (await POST(new Request(url, { method: 'POST', body: 'not json' }))).status
  ).toBe(400);
  expect(
    (await POST(new Request(url, { method: 'POST', body: 'x'.repeat(2001) })))
      .status
  ).toBe(413);
  expect(mocks.save).not.toHaveBeenCalled();
});
it('writes only the server actor and explicit command', async () => {
  expect((await post(body, 'https://lettin.tuturuuu.com')).status).toBe(200);
  expect(mocks.save).toHaveBeenCalledWith('fixture', actor, creatorId, true);
});
