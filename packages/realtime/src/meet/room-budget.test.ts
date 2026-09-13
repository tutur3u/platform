import { describe, expect, it, vi } from 'vitest';
import {
  admitOrHold,
  createMeetRoomSnapshot,
  getMeetRealtimeScopesForRole,
  meetRealtimeTokenPayloadSchema,
} from './index';
import {
  accountRoomTime,
  closeBudgetPublications,
  deferBudgetCleanup,
  expireRoomBudget,
  MEET_MAX_ROOM_DURATION_MS,
} from './room-budget';
import { mergePublicationCleanup } from './room-cleanup';

const now = Date.parse('2026-09-13T00:00:00Z');
function token(userId = '9b5c036d-d38d-4c12-b8e8-2e0b2b4a2691', role = 'host') {
  return meetRealtimeTokenPayloadSchema.parse({
    userId,
    role,
    exp: now / 1000 + 600,
    limits: { maxPublishers: 1 },
    meetingId: '5e5217de-9bb3-4e20-8d99-526ad3e7e34f',
    roomId: 'room',
    wsId: '0f1a64f7-780f-4d30-9d72-5530f204e95c',
    scopes: getMeetRealtimeScopesForRole('host'),
  });
}
const initial = () =>
  admitOrHold(createMeetRoomSnapshot(), token(), new Date(now).toISOString())
    .state;

describe('meeting resource budget', () => {
  it('backs off failed cleanup without discarding unresolved publications', () => {
    let state = initial();
    state.budget!.pendingPublications = [
      { userId: 'host', sessionId: 'pending', mid: '0' },
    ];
    state = deferBudgetCleanup(state, now);
    expect(state.budget!.nextCleanupAt).toBe(now + 10_000);
    for (let i = 0; i < 40; i++) state = deferBudgetCleanup(state, now);
    expect(state.budget!.nextCleanupAt).toBe(now + 3_600_000);
    expect(state.budget!.pendingPublications).toHaveLength(1);
  });
  it('persists successful closures before retrying a later provider failure', async () => {
    const state = initial();
    state.tracks.one = {
      userId: 'host',
      sessionId: 'one',
      mid: '0',
      kind: 'audio',
    };
    state.tracks.two = {
      userId: 'host',
      sessionId: 'two',
      mid: '1',
      kind: 'video',
    };
    let persisted = expireRoomBudget(
      state,
      now + MEET_MAX_ROOM_DURATION_MS
    )!.state;
    const close = vi
      .fn()
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ tracks: [{ errorCode: 'temporary' }] });
    await expect(
      closeBudgetPublications(persisted, close, async (progress) => {
        persisted = progress;
      })
    ).rejects.toThrow('cleanup failed');
    expect(
      persisted.budget?.pendingPublications?.map((track) => track.sessionId)
    ).toEqual(['two']);
    const retry = vi.fn().mockResolvedValue({});
    await closeBudgetPublications(persisted, retry);
    expect(retry).toHaveBeenCalledTimes(1);
    expect(retry).toHaveBeenCalledWith({
      sessionId: 'two',
      force: true,
      tracks: [{ mid: '1' }],
    });
  });

  it('bounds publishers and does not extend the deadline on reconnect', () => {
    const state = initial();
    const denied = admitOrHold(
      state,
      token('8b5c036d-d38d-4c12-b8e8-2e0b2b4a2691', 'speaker'),
      new Date(now + 1000).toISOString()
    );
    expect(denied.reply).toContainEqual({
      type: 'error',
      error: 'publisher_limit_reached',
    });
    expect(denied.disconnect).toEqual(['8b5c036d-d38d-4c12-b8e8-2e0b2b4a2691']);
    expect(
      admitOrHold(state, token(), new Date(now + 1000).toISOString()).state
        .budget?.expiresAt
    ).toBe(now + MEET_MAX_ROOM_DURATION_MS);
  });
  it('accounts participant time with server time, without counting beyond the deadline', () => {
    expect(
      accountRoomTime(initial(), now + 60_000).budget?.participantMilliseconds
    ).toBe(60_000);
    const ended = expireRoomBudget(
      initial(),
      now + MEET_MAX_ROOM_DURATION_MS + 9999
    );
    expect(ended?.state.ended).toBe(true);
    expect(ended?.state.budget?.participantMilliseconds).toBe(
      MEET_MAX_ROOM_DURATION_MS
    );
    expect(ended?.disconnect).toEqual(['9b5c036d-d38d-4c12-b8e8-2e0b2b4a2691']);
    expect(
      expireRoomBudget(ended!.state, now + MEET_MAX_ROOM_DURATION_MS + 20000)
    ).toBeNull();
  });
  it('retains cleanup obligations on provider failure and force-closes recorded publications', async () => {
    const state = initial();
    state.tracks.t = {
      userId: 'host',
      sessionId: 'session',
      mid: '0',
      kind: 'video',
    };
    const ended = expireRoomBudget(
      state,
      now + MEET_MAX_ROOM_DURATION_MS
    )!.state;
    const close = vi
      .fn()
      .mockRejectedValueOnce(new Error('provider unavailable'))
      .mockResolvedValue({});
    await expect(closeBudgetPublications(ended, close)).rejects.toThrow(
      'provider unavailable'
    );
    expect(ended.budget?.pendingPublications).toHaveLength(1);
    const cleaned = await closeBudgetPublications(ended, close);
    expect(close).toHaveBeenLastCalledWith({
      sessionId: 'session',
      force: true,
      tracks: [{ mid: '0' }],
    });
    expect(cleaned.budget?.pendingPublications).toEqual([]);
  });
});

it('expires admitted legacy snapshots without inventing historical usage', () => {
  const legacy = { ...initial(), budget: undefined };
  const expired = expireRoomBudget(legacy, now + 1000);
  expect(expired?.state.budget?.expiresAt).toBe(now + 1000);
  expect(expired?.state.ended).toBe(true);
  expect(expired?.state.budget?.participantMilliseconds).toBe(0);
  expect(expired?.state.budget?.historicalUsageUnknown).toBe(true);
  expect(expired?.reply).toEqual([]);
  expect(expired?.broadcast).toEqual([{ type: 'room.ended' }]);
});
it('preserves current accounting and newly queued publications during cleanup', () => {
  const started = initial();
  const oldTrack = { sessionId: 'old', userId: 'host', mid: '0' };
  const newTrack = { sessionId: 'new', userId: 'host', mid: '1' };
  started.budget!.pendingPublications = [oldTrack];
  const current = accountRoomTime(started, now + 1000);
  current.budget!.pendingPublications = [oldTrack, newTrack];
  const progress = {
    ...started,
    budget: { ...started.budget!, pendingPublications: [] },
  };
  const merged = mergePublicationCleanup(current, started, progress);
  expect(merged.budget?.participantMilliseconds).toBe(1000);
  expect(merged.budget?.accountedAt).toBe(now + 1000);
  expect(merged.budget?.pendingPublications).toEqual([newTrack]);
});
