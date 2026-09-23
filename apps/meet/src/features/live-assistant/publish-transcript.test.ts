import { expect, it, vi } from 'vitest';
import { publishLiveTranscript } from '../../../cloudflare/live/publish-transcript';
import type { SavedSession } from '../../../cloudflare/live/session-state';
import type { LiveEnvironment } from '../../../cloudflare/live/storage';

const command = vi.hoisted(() => vi.fn(async () => ({ ok: true })));
vi.mock('../../../cloudflare/live/room', () => ({ liveRoomCommand: command }));
it('publishes only room assistant turns and retries with the same deduplication ID', async () => {
  command.mockClear();
  const saved = {
    claims: { mode: 'personal', sessionId: 'session' },
    identity: {},
  } as SavedSession;
  const env = {} as LiveEnvironment;
  await publishLiveTranscript(env, saved, 'assistant', 'Private');
  expect(command).not.toHaveBeenCalled();
  saved.claims.mode = 'room';
  await publishLiveTranscript(env, saved, 'user', 'Participant speech');
  expect(command).not.toHaveBeenCalled();
  command.mockRejectedValueOnce(new Error('Transient failure'));
  await publishLiveTranscript(env, saved, 'assistant', 'Public answer');
  expect(command).toHaveBeenCalledTimes(2);
  expect(command.mock.calls[0]).toEqual(command.mock.calls[1]);
});
