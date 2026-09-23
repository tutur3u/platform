import { expect, it, vi } from 'vitest';
import {
  LiveTranscriptPublisher,
  publishLiveTranscript,
} from '../../../cloudflare/live/publish-transcript';
import type { SavedSession } from '../../../cloudflare/live/session-state';
import type { LiveEnvironment } from '../../../cloudflare/live/storage';

const command = vi.hoisted(() =>
  vi.fn(async (..._args: unknown[]) => ({ ok: true }))
);
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

it('preserves long replies in ordered chunks without splitting Unicode pairs', async () => {
  command.mockClear();
  const saved = {
    claims: { mode: 'room', sessionId: 'session' },
    identity: {},
  } as SavedSession;
  const text = `${'a'.repeat(7999)}\u{1f600}${'b'.repeat(9000)}`;
  await publishLiveTranscript({} as LiveEnvironment, saved, 'assistant', text);
  const chunks = command.mock.calls.map(
    (call) => call[3] as { text: string; id: string }
  );
  expect(chunks.map(({ text }) => text).join('')).toBe(text);
  expect(
    chunks.every(({ text }) => text.length <= 8000 && text.isWellFormed())
  ).toBe(true);
  expect(new Set(chunks.map(({ id }) => id)).size).toBe(chunks.length);
});

it('serializes publication separately from live command processing', async () => {
  command.mockClear();
  let finishFirst: () => void = () => {};
  command.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finishFirst = () => resolve({ ok: true });
      })
  );
  const publisher = new LiveTranscriptPublisher();
  const saved = {
    claims: { mode: 'room', sessionId: 'session' },
    identity: {},
  } as SavedSession;
  const env = {} as LiveEnvironment;
  const first = publisher.turn(env, saved, 'assistant', 'First');
  const second = publisher.turn(env, saved, 'assistant', 'Second');
  await vi.waitFor(() => expect(command).toHaveBeenCalledTimes(1));
  finishFirst();
  await Promise.all([first, second]);
  expect(
    command.mock.calls.map((call) => (call[3] as { text: string }).text)
  ).toEqual(['First', 'Second']);
});
