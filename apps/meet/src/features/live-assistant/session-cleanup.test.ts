import { expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ remove: vi.fn(), room: vi.fn() }));
vi.mock('../../../cloudflare/live/registry-heartbeat', () => ({
  removeLiveRegistry: mocks.remove,
}));
vi.mock('../../../cloudflare/live/room', () => ({
  liveRoomCommand: mocks.room,
}));

import { cleanupEndedLiveSession } from '../../../cloudflare/live/session-cleanup';
import type { SavedSession } from '../../../cloudflare/live/session-state';
import type { LiveEnvironment } from '../../../cloudflare/live/storage';

it('retries failed registry compensation independently of room cleanup', async () => {
  mocks.remove
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValue(undefined);
  mocks.room.mockResolvedValue(undefined);
  const saved = {
    ended: true,
    claims: { mode: 'room', sessionId: 'session' },
    identity: {},
  } as SavedSession;
  const retry = vi.fn(async () => {});
  const persist = vi.fn(async () => {});
  await cleanupEndedLiveSession({} as LiveEnvironment, saved, persist, retry);
  expect(saved.registryRemoved).toBeUndefined();
  expect(saved.roomReleased).toBe(true);
  expect(retry).toHaveBeenCalledOnce();
  await cleanupEndedLiveSession({} as LiveEnvironment, saved, persist, retry);
  expect(saved.registryRemoved).toBe(true);
  expect(mocks.room).toHaveBeenCalledOnce();
  await cleanupEndedLiveSession({} as LiveEnvironment, saved, persist, retry);
  expect(mocks.remove).toHaveBeenCalledTimes(2);
});
