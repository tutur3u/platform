import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ apply: vi.fn() }));
vi.mock('../../../cloudflare/live/memory-store', () => ({
  applyMemoryCommand: mocks.apply,
}));

import { liveRegistry } from '../../../cloudflare/live/registry';

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
  expect(f.values.get('active')).toEqual([
    expect.objectContaining({ sessionId, expiresAt: expect.any(Number) }),
  ]);
});
