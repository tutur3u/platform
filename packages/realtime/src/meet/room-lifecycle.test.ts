import { describe, expect, it } from 'vitest';
import {
  admitOrHold,
  createMeetRoomSnapshot,
  meetRealtimeTokenPayloadSchema,
} from './index';
import { endMeetRoom } from './room-ending';
import {
  applyRoomRestore,
  emptyRoomDeadline,
  expireEmptyRoom,
  MEET_EMPTY_ROOM_TIMEOUT_MS,
  observeRoomConnections,
} from './room-lifecycle';
import type { RoomServiceState } from './room-service';

const now = Date.parse('2026-10-06T00:00:00Z');
const host = meetRealtimeTokenPayloadSchema.parse({
  exp: 2000000000,
  limits: {},
  meetingId: '5e5217de-9bb3-4e20-8d99-526ad3e7e34f',
  mode: 'call',
  role: 'host',
  roomId: 'room',
  scopes: ['meet:server'],
  userId: '9b5c036d-d38d-4c12-b8e8-2e0b2b4a2691',
  accountId: '9b5c036d-d38d-4c12-b8e8-2e0b2b4a2691',
  wsId: '0f1a64f7-780f-4d30-9d72-5530f204e95c',
});
function joined(): RoomServiceState {
  return observeRoomConnections(
    admitOrHold(createMeetRoomSnapshot(), host, new Date(now).toISOString())
      .state,
    new Set([host.userId]),
    now,
    host
  );
}
function empty(): RoomServiceState {
  return observeRoomConnections(joined(), new Set(), now + 1000);
}
function ended(): RoomServiceState {
  return endMeetRoom(empty(), new Date(now + 2000).toISOString());
}
const restore = (
  state: RoomServiceState,
  token = host,
  version = state.lifecycle?.version ?? 0,
  at = now + 3000
) =>
  applyRoomRestore(
    state,
    token,
    { action: 'room.restore', expectedVersion: version },
    at
  )!;

describe('empty-room lifecycle', () => {
  it('does not time out a never-admitted room', () => {
    const state = observeRoomConnections(
      createMeetRoomSnapshot(),
      new Set(),
      now
    );
    expect(emptyRoomDeadline(state)).toBeUndefined();
    expect(
      expireEmptyRoom(
        state,
        state.lifecycle?.version,
        new Set(),
        now + 86400000
      )
    ).toBeNull();
  });
  it('quiet and muted connected calls remain live', () => {
    const state = observeRoomConnections(
      joined(),
      new Set([host.userId]),
      now + 45 * 60000
    );
    expect(emptyRoomDeadline(state)).toBeUndefined();
    expect(
      expireEmptyRoom(
        state,
        state.lifecycle?.version,
        new Set([host.userId]),
        now + 45 * 60000
      )
    ).toBeNull();
  });
  it('starts at disconnect despite retained recovery presence and does not slide on sweeps', () => {
    const state = empty();
    expect(state.presence[host.userId]).toBeDefined();
    expect(emptyRoomDeadline(state)).toBe(
      now + 1000 + MEET_EMPTY_ROOM_TIMEOUT_MS
    );
    expect(observeRoomConnections(state, new Set(), now + 120000)).toBe(state);
    expect(
      expireEmptyRoom(
        state,
        state.lifecycle!.version,
        new Set(),
        emptyRoomDeadline(state)! - 1
      )
    ).toBeNull();
    const result = expireEmptyRoom(
      state,
      state.lifecycle!.version,
      new Set(),
      emptyRoomDeadline(state)!
    )!;
    expect(result.state.ended).toBe(true);
    expect(result.broadcast).toEqual([{ type: 'room.ended' }]);
    expect(result.disconnect).toContain(host.userId);
    expect(
      expireEmptyRoom(
        result.state,
        result.state.lifecycle!.version,
        new Set(),
        now + 600000
      )
    ).toBeNull();
  });
  it('reconnect cancels the deadline and stale alarm generations cannot end a later empty period', () => {
    const first = empty();
    const back = observeRoomConnections(
      first,
      new Set([host.userId]),
      now + 120000
    );
    expect(emptyRoomDeadline(back)).toBeUndefined();
    expect(back.lifecycle!.version).toBeGreaterThan(first.lifecycle!.version);
    const second = observeRoomConnections(back, new Set(), now + 180000);
    expect(emptyRoomDeadline(second)).toBe(now + 480000);
    expect(
      expireEmptyRoom(second, first.lifecycle!.version, new Set(), now + 600000)
    ).toBeNull();
    expect(
      expireEmptyRoom(
        second,
        second.lifecycle!.version,
        new Set([host.userId]),
        now + 600000
      )
    ).toBeNull();
    expect(
      expireEmptyRoom(
        second,
        second.lifecycle!.version,
        new Set(),
        now + 600000
      )?.state.ended
    ).toBe(true);
  });
  it('waiting sockets do not keep an admitted empty call alive', () => {
    const state = observeRoomConnections(
      joined(),
      new Set(['waiting-device']),
      now + 1000
    );
    expect(emptyRoomDeadline(state)).toBe(now + 301000);
  });
  it.each([
    { ...host, role: 'speaker' as const },
    { ...host, scopes: [] },
    { ...host, accountId: 'another-account' },
  ])(
    'only the original owner with a server token can restore (%j)',
    (token) => {
      const state = ended();
      expect(restore(state, token).status).toBe(403);
      expect(restore(state, token).state).toBe(state);
    }
  );
  it('rejects stale version, a live room, and malformed commands without side effects', () => {
    const state = ended();
    expect(restore(state, host, state.lifecycle!.version - 1).status).toBe(409);
    expect(restore(joined()).status).toBe(409);
    expect(
      applyRoomRestore(
        state,
        host,
        { action: 'room.restore', expectedVersion: -1 },
        now
      )?.status
    ).toBe(400);
    expect(
      applyRoomRestore(
        state,
        host,
        {
          action: 'room.restore',
          expectedVersion: state.lifecycle!.version,
          surprise: true,
        },
        now
      )?.status
    ).toBe(400);
  });
  it('does not grant a new budget to missing, historically unknown, or exhausted rooms', () => {
    const state = ended();
    expect(restore({ ...state, budget: undefined }).status).toBe(409);
    expect(
      restore({
        ...state,
        budget: { ...state.budget!, historicalUsageUnknown: true },
      }).status
    ).toBe(409);
    expect(
      restore(state, host, state.lifecycle!.version, state.budget!.expiresAt)
        .status
    ).toBe(409);
  });
  it('preserves original duration, cumulative usage, caps and deferred cleanup on restore', () => {
    const state = ended();
    state.budget = {
      ...state.budget!,
      participantMilliseconds: 4567,
      cleanupAttempts: 3,
      nextCleanupAt: now + 60000,
    };
    const result = restore(state);
    expect(result.status).toBeUndefined();
    expect(result.state.ended).toBe(false);
    expect(result.state.budget).toMatchObject({
      expiresAt: state.budget.expiresAt,
      participantMilliseconds: 4567,
      maxPublishers: state.budget.maxPublishers,
      maxViewers: state.budget.maxViewers,
      cleanupAttempts: 3,
      nextCleanupAt: now + 60000,
    });
    expect(result.state.presence).toEqual({});
    expect(result.state.tracks).toEqual({});
    expect(result.state.liveShares).toEqual({});
    expect(result.state.liveAssistant).toBeUndefined();
    expect(result.state.lifecycle!.version).toBe(state.lifecycle!.version + 1);
    expect(emptyRoomDeadline(result.state)).toBe(now + 303000);
    expect(restore(result.state).status).toBe(409);
  });
});

it('restoration retires legacy active publications without losing distinct provider cleanup', () => {
  const state = ended();
  state.budget!.pendingPublications = [
    { userId: host.userId, sessionId: 'session', mid: '0' },
  ];
  state.tracks.audio = {
    userId: host.userId,
    sessionId: 'session',
    mid: '1',
    kind: 'audio',
  };
  const result = restore(state);
  expect(result.state.tracks).toEqual({});
  expect(
    result.state.budget!.pendingPublications?.map((track) => track.mid)
  ).toEqual(['0', '1']);
  expect(result.state.budget!.expiresAt).toBe(state.budget!.expiresAt);
});
