import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  admin: vi.fn(),
  update: vi.fn(),
  eq: vi.fn(),
  select: vi.fn(),
  result: vi.fn(),
}));
vi.mock('@/features/call/lib/call-access', () => ({
  getMeetCallAccess: mocks.access,
  MeetCallAccessError: class extends Error {
    status = 401;
  },
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: mocks.admin,
}));

import { PATCH } from './route';

const params = Promise.resolve({ meetingId: 'meeting' });
const request = (body: string, origin = 'https://meet.tuturuuu.com') =>
  new Request('https://meet.tuturuuu.com/api/meet-call/meeting/title', {
    method: 'PATCH',
    headers: { origin, 'Content-Type': 'application/json' },
    body,
  });
beforeEach(() => {
  vi.resetAllMocks();
  mocks.access.mockResolvedValue({ user: { id: 'owner' }, isHost: true });
  const query = {
    update: mocks.update,
    eq: mocks.eq,
    select: mocks.select,
    maybeSingle: mocks.result,
  };
  for (const fn of [mocks.update, mocks.eq, mocks.select])
    fn.mockReturnValue(query);
  mocks.admin.mockResolvedValue({ from: () => query });
  mocks.result.mockResolvedValue({ data: { name: 'Renamed' }, error: null });
});
it('changes only name and constrains the update to its owner', async () => {
  const response = await PATCH(request('{"name":" Renamed "}'), { params });
  expect(response.status).toBe(200);
  expect(mocks.update).toHaveBeenCalledWith({ name: 'Renamed' });
  expect(mocks.eq).toHaveBeenCalledWith('creator_id', 'owner');
  expect(mocks.eq).toHaveBeenCalledWith('id', 'meeting');
  expect(response.headers.get('cache-control')).toBe('private, no-store');
});
it('rejects cross-origin requests before resolving the actor', async () => {
  expect(
    (await PATCH(request('{}', 'https://other.test'), { params })).status
  ).toBe(403);
  expect(mocks.access).not.toHaveBeenCalled();
});
it('denies invited participants even though they can access the call', async () => {
  mocks.access.mockResolvedValue({ user: { id: 'guest' }, isHost: false });
  expect((await PATCH(request('{"name":"Changed"}'), { params })).status).toBe(
    403
  );
  expect(mocks.admin).not.toHaveBeenCalled();
});
it.each([
  '{"name":" "}',
  '{"name":1}',
  '{',
  JSON.stringify({ name: 'x'.repeat(256) }),
])('rejects invalid input %s', async (body) => {
  expect((await PATCH(request(body), { params })).status).toBe(400);
  expect(mocks.update).not.toHaveBeenCalled();
});
it('bounds request bytes and handles a concurrently removed meeting', async () => {
  expect((await PATCH(request('x'.repeat(4097)), { params })).status).toBe(413);
  mocks.result.mockResolvedValue({ data: null, error: null });
  expect((await PATCH(request('{"name":"Changed"}'), { params })).status).toBe(
    404
  );
});
