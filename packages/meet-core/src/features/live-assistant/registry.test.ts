import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ apply: vi.fn(), room: vi.fn() }));
vi.mock('../../cloudflare/live/memory-store', () => ({
  applyMemoryCommand: mocks.apply,
}));
vi.mock('../../cloudflare/live/room', () => ({
  liveRoomCommand: mocks.room,
}));

import { liveRegistry } from '../../cloudflare/live/registry';

const ownerId = '00000000-0000-4000-8000-000000000001';
const meetingId = '00000000-0000-4000-8000-000000000002';
const sessionId = '00000000-0000-4000-8000-000000000003';
function fixture() {
  const values = new Map<string, unknown>();
  const storage = {
    get: async (key: string) => values.get(key),
    put: async (key: string, value: unknown) => {
      values.set(key, structuredClone(value));
    },
    delete: async (key: string) => values.delete(key),
  };
  const stop = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
  const env = {
    MEET_LIVE: {
      idFromName: (value: string) => value,
      get: () => ({ fetch: stop }),
    },
  };
  const call = (path: string, input: object) =>
    liveRegistry(
      new Request(`https://live.internal/registry/${path}`, {
        method: 'POST',
        body: JSON.stringify({ ownerId, ...input }),
      }),
      storage as unknown as Parameters<typeof liveRegistry>[1],
      env as unknown as Parameters<typeof liveRegistry>[2]
    );
  return { values, stop, call };
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.apply.mockResolvedValue({ ok: true });
});
it('stops personal sessions before changing memory and keeps room sessions', async () => {
  const f = fixture();
  const personal = {
    ownerId,
    meetingId,
    sessionId,
    mode: 'personal',
    expiresAt: Date.now() + 60000,
  };
  f.values.set('active', [
    personal,
    { ...personal, sessionId: meetingId, mode: 'room' },
  ]);
  mocks.apply.mockImplementation(async () => {
    expect(f.stop).toHaveBeenCalledOnce();
    return { ok: true };
  });
  await f.call('memory', { command: { action: 'settings', enabled: false } });
  expect(f.values.get('active')).toEqual([
    { ...personal, sessionId: meetingId, mode: 'room' },
  ]);
  expect(f.values.has('pending-memory')).toBe(false);
});
it('recovers a persisted memory operation before allowing a new assistant', async () => {
  const f = fixture();
  f.values.set('pending-memory', {
    ownerId,
    command: { action: 'delete', id: meetingId },
  });
  await f.call('register', { meetingId, sessionId, mode: 'personal' });
  expect(mocks.apply).toHaveBeenCalledOnce();
  expect(f.values.has('pending-memory')).toBe(false);
  expect(f.values.get('active')).toEqual([
    expect.objectContaining({ sessionId }),
  ]);
});
it('retains a failed operation and refuses registration until recovery succeeds', async () => {
  const f = fixture();
  f.values.set('pending-memory', {
    ownerId,
    command: { action: 'settings', enabled: false },
  });
  mocks.apply.mockRejectedValue(new Error('temporary database outage'));
  await expect(f.call('register', { meetingId, sessionId })).rejects.toThrow(
    'temporary database outage'
  );
  expect(f.values.has('pending-memory')).toBe(true);
  expect(f.values.has('active')).toBe(false);
});

it('stops expired personal sessions before a privacy reset', async () => {
  const f = fixture();
  f.values.set('active', [
    { ownerId, meetingId, sessionId, mode: 'personal', expiresAt: 1 },
  ]);
  mocks.apply.mockImplementation(async () => {
    expect(f.stop).toHaveBeenCalledOnce();
    return { ok: true };
  });
  await f.call('memory', { command: { action: 'settings', enabled: false } });
  expect(f.values.get('active')).toEqual([]);
});
it('does not forget expired sessions when stopping them fails during registration', async () => {
  const f = fixture();
  f.values.set('active', [
    { ownerId, meetingId, sessionId, mode: 'personal', expiresAt: 1 },
  ]);
  f.stop.mockResolvedValue(new Response(null, { status: 503 }));
  await expect(
    f.call('register', { meetingId, sessionId: meetingId })
  ).rejects.toThrow('Live privacy reset failed');
  expect(f.values.get('active')).toEqual([
    expect.objectContaining({ sessionId }),
  ]);
});

it('renews the registering session without stopping it after lease expiry', async () => {
  const f = fixture();
  f.values.set('active', [
    { ownerId, meetingId, sessionId, mode: 'personal', expiresAt: 1 },
  ]);
  expect(
    (await f.call('register', { meetingId, sessionId, mode: 'personal' })).ok
  ).toBe(true);
  expect(f.stop).not.toHaveBeenCalled();
  const [entry] = f.values.get('active') as Array<{
    sessionId: string;
    expiresAt: number;
  }>;
  expect(entry?.sessionId).toBe(sessionId);
  expect(entry!.expiresAt).toBeGreaterThan(Date.now());
});

it('on withdrawal revokes each meeting share and stops every Private Mira', async () => {
  const f = fixture();
  const workspaceId = '00000000-0000-4000-8000-000000000009';
  await f.call('register', {
    meetingId,
    sessionId,
    mode: 'personal',
    workspaceId,
  });
  const room = { ownerId, meetingId, sessionId: meetingId, mode: 'room' };
  f.values.set('active', [
    ...(f.values.get('active') as object[]),
    { ...room, expiresAt: Date.now() + 60000 },
  ]);
  mocks.room.mockRejectedValueOnce(new Error('live_room_503'));
  const response = await f.call('withdraw', {});
  expect(response.status).toBe(200);
  expect(mocks.room).toHaveBeenCalledExactlyOnceWith(
    expect.anything(),
    { ownerId, meetingId, mode: 'personal' },
    { workspaceId, isHost: false, displayName: 'Mira' },
    { action: 'mira.share.set', enabled: false }
  );
  // A failed revoke still stops the session that could read the share.
  expect(f.stop).toHaveBeenCalledOnce();
  expect(f.values.get('active')).toEqual([
    expect.objectContaining({ mode: 'room' }),
  ]);
});

it('stops each session before revoking its share and keeps failures for a retry', async () => {
  const f = fixture();
  const workspaceId = '00000000-0000-4000-8000-000000000009';
  const other = '00000000-0000-4000-8000-000000000008';
  const entry = (id: string) => ({
    ownerId,
    meetingId,
    sessionId: id,
    mode: 'personal',
    workspaceId,
    expiresAt: Date.now() + 60000,
  });
  f.values.set('active', [entry(sessionId), entry(other)]);
  const order: string[] = [];
  f.stop.mockImplementation(async (_url: string, init: RequestInit) => {
    const { sessionId: id } = JSON.parse(String(init.body));
    order.push(`stop:${id}`);
    if (id === other) throw new Error('Live session unreachable');
    return new Response(null, { status: 200 });
  });
  mocks.room.mockImplementation(async () => {
    order.push('revoke');
    return { ok: true };
  });
  const response = await f.call('withdraw', {});
  expect(response.status).toBe(503);
  // Every session stops before its share is revoked; a throwing stop does
  // not abort the others, and its share is still revoked.
  expect(order.indexOf(`stop:${sessionId}`)).toBeLessThan(
    order.lastIndexOf('revoke')
  );
  expect(order.filter((step) => step === 'revoke')).toHaveLength(2);
  expect(f.values.get('active')).toEqual([
    expect.objectContaining({ sessionId: other }),
  ]);
});

it('bounds a withdrawal when a session never answers', async () => {
  vi.useFakeTimers();
  try {
    const f = fixture();
    f.values.set('active', [
      {
        ownerId,
        meetingId,
        sessionId,
        mode: 'personal',
        expiresAt: Date.now() + 60000,
      },
    ]);
    f.stop.mockReturnValue(new Promise(() => undefined));
    const pending = f.call('withdraw', {});
    await vi.advanceTimersByTimeAsync(5000);
    expect((await pending).status).toBe(503);
    expect(f.values.get('active')).toEqual([
      expect.objectContaining({ sessionId }),
    ]);
  } finally {
    vi.useRealTimers();
  }
});
