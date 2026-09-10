import { expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ room: vi.fn() }));
vi.mock('../../../cloudflare/live/room', () => ({
  liveRoomCommand: mocks.room,
}));

import { createRoomLiveAudioBatcher } from '../../../cloudflare/live/room-audio-batcher';
import type { SavedSession } from '../../../cloudflare/live/session-state';
import type { LiveEnvironment } from '../../../cloudflare/live/storage';

it('reports recovery only after audio was forwarded', async () => {
  mocks.room
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValueOnce({ forwarded: false })
    .mockResolvedValueOnce({ forwarded: true });
  const emit = vi.fn();
  const batcher = createRoomLiveAudioBatcher(
    {} as LiveEnvironment,
    { claims: {}, identity: {} } as SavedSession,
    emit,
    () => 'listening'
  );
  batcher.push('AAAAAA==');
  await batcher.drain();
  expect(emit).toHaveBeenCalledWith(
    expect.objectContaining({ state: 'recovering' })
  );
  batcher.push('AAAAAA==');
  await batcher.drain();
  expect(emit).toHaveBeenCalledTimes(1);
  batcher.push('AAAAAA==');
  await batcher.drain();
  expect(emit).toHaveBeenLastCalledWith({ type: 'state', state: 'listening' });
});
