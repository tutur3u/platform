import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  session: vi.fn(),
  policy: vi.fn(),
  fetch: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('next/server', () => ({ connection: vi.fn() }));
vi.mock('@tuturuuu/storage-core/workspace-storage-provider', () => ({
  WorkspaceStorageError: class extends Error {
    status = 503;
  },
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: vi.fn(),
}));
vi.mock('@tuturuuu/utils/account-benefits-server', () => ({
  AccountServiceError: class extends Error {
    status = 503;
  },
}));
vi.mock('@tuturuuu/meet-core/features/call/lib/call-access', () => ({
  getMeetCallAccess: mocks.access,
  MeetCallAccessError: class extends Error {
    constructor(
      public status: number,
      message: string
    ) {
      super(message);
    }
  },
}));
vi.mock('@tuturuuu/meet-core/features/call/lib/call-session', () => ({
  getMeetCallSession: mocks.session,
}));
vi.mock('@tuturuuu/meet-core/features/meeting-ai/server/room-access', () => ({
  readMeetingRoomPolicy: mocks.policy,
}));

import { GET, POST } from './route';

afterEach(() => vi.unstubAllGlobals());
const actor = '9b5c036d-d38d-4c12-b8e8-2e0b2b4a2691';
const meetingId = '5e5217de-9bb3-4e20-8d99-526ad3e7e34f';
const params = { params: Promise.resolve({ meetingId }) };
function request(body: unknown, origin = 'https://meet.example') {
  return new Request(`https://meet.example/api/meet-call/${meetingId}/state`, {
    method: 'POST',
    headers: { origin, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal('fetch', mocks.fetch);
  mocks.access.mockResolvedValue({
    user: { id: actor },
    meeting: { id: meetingId, ws_id: 'workspace' },
    isHost: true,
    displayName: 'Owner',
    canReadWorkspace: true,
  });
  mocks.session.mockResolvedValue({
    realtimeUrl: 'wss://realtime.example/room',
    token: 'synthetic-test-token',
  });
  mocks.fetch.mockResolvedValue(
    Response.json({ ended: false, lifecycleVersion: 8 })
  );
});
it('returns a private fresh lifecycle version without joining', async () => {
  mocks.policy.mockResolvedValue({
    ended: true,
    canReadNotes: true,
    lifecycleVersion: 7,
  });
  const response = await GET(new Request('https://meet.example'), params);
  expect(await response.json()).toEqual({
    ended: true,
    canReadNotes: true,
    lifecycleVersion: 7,
  });
  expect(response.headers.get('Cache-Control')).toBe('private, no-store');
  expect(mocks.session).not.toHaveBeenCalled();
});
it('uses actual same-origin roomRoute and server-signed owner service session', async () => {
  const response = await POST(
    request({ expectedVersion: 7, expectedActorId: actor }),
    params
  );
  expect(response.status).toBe(200);
  expect(response.headers.get('Cache-Control')).toBe('private, no-store');
  expect(mocks.session).toHaveBeenCalledWith(
    expect.objectContaining({ userId: actor, isHost: true, service: true })
  );
  expect(mocks.fetch).toHaveBeenCalledOnce();
  const [url, init] = mocks.fetch.mock.calls[0]!;
  expect(String(url)).toBe('https://realtime.example/room-service');
  expect(init.method).toBe('POST');
  expect(init.cache).toBe('no-store');
  expect(JSON.parse(init.body)).toEqual({
    action: 'room.restore',
    expectedVersion: 7,
  });
  expect(init.headers).toEqual({
    Authorization: 'Bearer synthetic-test-token',
    'Content-Type': 'application/json',
  });
  expect(init.signal).toBeInstanceOf(AbortSignal);
});
it('rejects another origin before actor resolution or credentials', async () => {
  expect(
    (
      await POST(
        request(
          { expectedVersion: 7, expectedActorId: actor },
          'https://attacker.example'
        ),
        params
      )
    ).status
  ).toBe(403);
  expect(mocks.access).not.toHaveBeenCalled();
  expect(mocks.session).not.toHaveBeenCalled();
});
it('a moderator or participant cannot restore the original owner room', async () => {
  mocks.access.mockResolvedValue({ user: { id: actor }, isHost: false });
  expect(
    (
      await POST(
        request({ expectedVersion: 7, expectedActorId: actor }),
        params
      )
    ).status
  ).toBe(403);
  expect(mocks.session).not.toHaveBeenCalled();
});
it('rejects actor changes before issuing a service token', async () => {
  expect(
    (
      await POST(
        request({
          expectedVersion: 7,
          expectedActorId: '11111111-1111-4111-8111-111111111111',
        }),
        params
      )
    ).status
  ).toBe(409);
  expect(mocks.session).not.toHaveBeenCalled();
});
it.each([
  { expectedVersion: -1, expectedActorId: actor },
  { expectedVersion: 7 },
  { expectedVersion: 7, expectedActorId: actor, surprise: true },
])('rejects malformed restore input %j', async (body) => {
  expect((await POST(request(body), params)).status).toBe(400);
  expect(mocks.session).not.toHaveBeenCalled();
});
it('preserves durable CAS or allowance denial rather than claiming a restoration', async () => {
  mocks.fetch.mockResolvedValue(
    Response.json({ error: 'Meeting state changed' }, { status: 409 })
  );
  const response = await POST(
    request({ expectedVersion: 7, expectedActorId: actor }),
    params
  );
  expect(response.status).toBe(409);
  expect(await response.json()).toEqual({
    error: 'Room action is unavailable',
  });
});
