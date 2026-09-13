import { expect, it, vi } from 'vitest';
import type { MeetRealtimeRoomTrack } from './messages';
import { createMeetRoomSnapshot, type MeetRoomSnapshot } from './room';
import { closeBudgetPublications } from './room-provider-cleanup';

function snapshot(tracks: MeetRealtimeRoomTrack[]) {
  return {
    ...createMeetRoomSnapshot(),
    budget: {
      expiresAt: 1,
      accountedAt: 1,
      participantMilliseconds: 0,
      maxPublishers: 8,
      maxViewers: 96,
      pendingPublications: tracks,
    },
  };
}
const one = { sessionId: 'one', userId: 'host', trackName: 'audio', mid: '0' };
it('persists successful mids from mixed close results and retries only failures', async () => {
  let state: MeetRoomSnapshot = snapshot([
    one,
    { ...one, trackName: 'video', mid: '1' },
  ]);
  const close = vi.fn().mockResolvedValue({
    tracks: [{ mid: '0' }, { mid: '1', errorCode: 'temporary' }],
  });
  await expect(
    closeBudgetPublications(state, close, async (next) => {
      state = next;
    })
  ).rejects.toThrow('cleanup failed');
  expect(state.budget?.pendingPublications?.map((track) => track.mid)).toEqual([
    '1',
  ]);
  const retry = vi.fn().mockResolvedValue({ tracks: [{ mid: '1' }] });
  expect(
    (await closeBudgetPublications(state, retry)).budget?.pendingPublications
  ).toEqual([]);
  expect(retry).toHaveBeenCalledWith({
    sessionId: 'one',
    force: true,
    tracks: [{ mid: '1' }],
  });
});
it('resolves a legacy track using the local provider track name and closes its actual mid', async () => {
  const state = snapshot([{ ...one, mid: undefined }]);
  const lookup = vi.fn().mockResolvedValue({
    tracks: [
      { location: 'remote', trackName: 'audio', mid: '9' },
      { location: 'local', trackName: 'audio', mid: '2' },
    ],
  });
  const close = vi.fn().mockResolvedValue({ tracks: [{ mid: '2' }] });
  expect(
    (await closeBudgetPublications(state, close, undefined, lookup)).budget
      ?.pendingPublications
  ).toEqual([]);
  expect(close).toHaveBeenCalledWith({
    sessionId: 'one',
    force: true,
    tracks: [{ mid: '2' }],
  });
});
it('continues other sessions when a legacy publication cannot be identified', async () => {
  let state: MeetRoomSnapshot = snapshot([
    { ...one, mid: undefined, trackName: undefined },
    { ...one, sessionId: 'two' },
  ]);
  const close = vi.fn().mockResolvedValue({});
  await expect(
    closeBudgetPublications(
      state,
      close,
      async (next) => {
        state = next;
      },
      async () => ({ tracks: [] })
    )
  ).rejects.toThrow('provider track identifier');
  expect(state.budget?.pendingPublications).toHaveLength(1);
  expect(close).toHaveBeenCalledWith({
    sessionId: 'two',
    force: true,
    tracks: [{ mid: '0' }],
  });
});
it('does not discard legacy cleanup on a malformed provider inventory', async () => {
  let state: MeetRoomSnapshot = snapshot([{ ...one, mid: undefined }]);
  const close = vi.fn();
  await expect(
    closeBudgetPublications(
      state,
      close,
      async (next) => {
        state = next;
      },
      async () => ({ tracks: [{}] })
    )
  ).rejects.toThrow('lookup failed');
  expect(state.budget?.pendingPublications).toHaveLength(1);
  expect(close).not.toHaveBeenCalled();
});
it('recognizes a missing legacy publication only from a complete provider inventory', async () => {
  const close = vi.fn();
  const result = await closeBudgetPublications(
    snapshot([{ ...one, mid: undefined }]),
    close,
    undefined,
    async () => ({ tracks: [] })
  );
  expect(result.budget?.pendingPublications).toEqual([]);
  expect(close).not.toHaveBeenCalled();
});

it('recovers closure after persistence fails without treating arbitrary close errors as success', async () => {
  const state = snapshot([one]);
  await expect(
    closeBudgetPublications(
      state,
      async () => ({ tracks: [{ mid: '0' }] }),
      async () => {
        throw new Error('storage unavailable');
      }
    )
  ).rejects.toThrow('storage unavailable');
  expect(state.budget.pendingPublications).toHaveLength(1);
  const close = vi
    .fn()
    .mockResolvedValue({
      tracks: [{ mid: '0', errorCode: 'not_found_track_error' }],
    });
  const recovered = await closeBudgetPublications(
    state,
    close,
    undefined,
    async () => ({ tracks: [] })
  );
  expect(recovered.budget?.pendingPublications).toEqual([]);
});
it('retains a failed closure when the provider still lists its mid', async () => {
  const state = snapshot([one]);
  await expect(
    closeBudgetPublications(
      state,
      async () => ({ tracks: [{ mid: '0', errorCode: 'temporary' }] }),
      undefined,
      async () => ({
        tracks: [{ location: 'local', trackName: 'audio', mid: '0' }],
      })
    )
  ).rejects.toThrow('cleanup failed');
  expect(state.budget.pendingPublications).toHaveLength(1);
});
