import { describe, expect, it } from 'vitest';
import {
  type MeetRealtimeClientMessage,
  meetRealtimeClientMessageSchema,
} from './messages';
import { getMeetRealtimeScopesForRole } from './permissions';
import {
  type MeetRealtimeTokenPayload,
  meetRealtimeTokenPayloadSchema,
} from './primitives';
import {
  admitOrHold,
  applyMeetRoomCommand,
  createMeetPresence,
  createMeetRoomSnapshot,
  type MeetRoomSnapshot,
} from './room';
import { applyRoomNavigation } from './room-navigation';

const hostId = '9b5c036d-d38d-4c12-b8e8-2e0b2b4a2691';
const aliceId = '4b320da6-6c8a-43fe-b1bf-09fbe77303f9';
const bobId = '1f9a8c2e-3d4b-4e5f-9a6b-7c8d9e0f1a2b';
const absentId = '7d6e5f4a-3b2c-4d1e-8f9a-0b1c2d3e4f5a';
const now = '2026-11-22T05:00:00.000Z';
const later = (ms: number) => new Date(Date.parse(now) + ms).toISOString();

const token = (userId: string, role: 'host' | 'speaker' = 'speaker') =>
  meetRealtimeTokenPayloadSchema.parse({
    role,
    admission: role === 'host' ? 'open' : 'lobby',
    userId,
    displayName: role,
    avatarUrl: 'https://example.com/avatar.png',
    roomId: 'test',
    meetingId: '5e5217de-9bb3-4e20-8d99-526ad3e7e34f',
    wsId: '0f1a64f7-780f-4d30-9d72-5530f204e95c',
    exp: 2_000_000_000,
    limits: {},
    scopes: getMeetRealtimeScopesForRole(role),
  });
const host = token(hostId, 'host');
const alice = token(aliceId);
const bob = token(bobId);

function room(...people: MeetRealtimeTokenPayload[]): MeetRoomSnapshot {
  const state = createMeetRoomSnapshot();
  for (const person of people)
    state.presence[person.userId] = createMeetPresence(person, now);
  return state;
}

const request = (
  overrides: Partial<
    Extract<MeetRealtimeClientMessage, { type: 'navigation.request' }>
  > = {}
): MeetRealtimeClientMessage => ({
  type: 'navigation.request',
  requestId: 'nav-1',
  mode: 'summon',
  targets: 'everyone',
  view: { surface: 'programming' },
  ...overrides,
});

describe('navigation.request schema', () => {
  it('requires a view for every mode except follow.stop', () => {
    const parse = (value: unknown) =>
      meetRealtimeClientMessageSchema.safeParse(value).success;
    expect(
      parse({ type: 'navigation.request', mode: 'summon', targets: 'everyone' })
    ).toBe(false);
    expect(
      parse({ type: 'navigation.request', mode: 'follow', targets: 'everyone' })
    ).toBe(false);
    expect(
      parse({
        type: 'navigation.request',
        mode: 'follow.stop',
        targets: 'everyone',
      })
    ).toBe(true);
    expect(
      parse({
        type: 'navigation.request',
        mode: 'follow.update',
        targets: [aliceId],
        view: { surface: 'tool', toolId: 'quiz' },
      })
    ).toBe(true);
  });

  it('rejects malformed views and target lists', () => {
    const parse = (value: unknown) =>
      meetRealtimeClientMessageSchema.safeParse(value).success;
    expect(
      parse({
        type: 'navigation.request',
        mode: 'summon',
        targets: 'everyone',
        view: { surface: 'tool', toolId: 'Not A Tool!' },
      })
    ).toBe(false);
    expect(
      parse({
        type: 'navigation.request',
        mode: 'summon',
        targets: [],
        view: { surface: 'stage' },
      })
    ).toBe(false);
    expect(
      parse({
        type: 'navigation.request',
        mode: 'summon',
        targets: ['not-a-uuid'],
        view: { surface: 'stage' },
      })
    ).toBe(false);
  });
});

describe('applyRoomNavigation', () => {
  it('ignores other message types', () => {
    expect(
      applyRoomNavigation(
        room(host),
        { type: 'reaction.send', reaction: 'like' },
        host,
        now
      )
    ).toBeNull();
  });

  it('denies a sender who is not in the room', () => {
    const result = applyRoomNavigation(room(host), request(), alice, now);
    expect(result?.direct).toEqual([]);
    expect(result?.reply).toEqual([
      { type: 'error', error: 'awaiting_admission', requestId: 'nav-1' },
    ]);
  });

  it('delivers everyone to each present person except the sender', () => {
    const result = applyRoomNavigation(
      room(host, alice, bob),
      request(),
      host,
      now
    );
    expect(result?.direct.map((entry) => entry.userId).sort()).toEqual(
      [aliceId, bobId].sort()
    );
    expect(result?.direct[0]?.message).toEqual({
      type: 'navigation',
      mode: 'summon',
      from: hostId,
      view: { surface: 'programming' },
      forced: true,
      createdAt: now,
    });
    expect(result?.broadcast).toEqual([]);
    expect(result?.state.lastNavigationAt).toEqual({
      [hostId]: Date.parse(now),
    });
  });

  it('filters explicit targets to present people and drops the sender', () => {
    const result = applyRoomNavigation(
      room(host, alice, bob),
      request({ targets: [aliceId, absentId, hostId, aliceId] }),
      host,
      now
    );
    expect(result?.direct.map((entry) => entry.userId)).toEqual([aliceId]);
  });

  it('reports when nobody is left to reach', () => {
    const result = applyRoomNavigation(
      room(host, alice),
      request({ targets: [absentId] }),
      host,
      now
    );
    expect(result?.direct).toEqual([]);
    expect(result?.reply).toEqual([
      { type: 'error', error: 'navigation_no_targets', requestId: 'nav-1' },
    ]);
  });

  it('forces only for people who manage participants', () => {
    const fromHost = applyRoomNavigation(
      room(host, alice),
      request(),
      host,
      now
    );
    const fromAlice = applyRoomNavigation(
      room(host, alice),
      request(),
      alice,
      now
    );
    expect(fromHost?.direct[0]?.message).toMatchObject({ forced: true });
    expect(fromAlice?.direct[0]?.message).toMatchObject({
      forced: false,
      from: aliceId,
    });
    expect(fromAlice?.direct.map((entry) => entry.userId)).toEqual([hostId]);
  });

  it('relays follow.stop without a view', () => {
    const result = applyRoomNavigation(
      room(host, alice),
      request({ mode: 'follow.stop', view: undefined }),
      host,
      now
    );
    expect(result?.direct[0]?.message).toEqual({
      type: 'navigation',
      mode: 'follow.stop',
      from: hostId,
      forced: true,
      createdAt: now,
    });
  });

  it('drops fast follow updates silently and rate limits other requests', () => {
    const first = applyRoomNavigation(
      room(host, alice),
      request({ mode: 'follow' }),
      host,
      now
    )!;
    const update = applyRoomNavigation(
      first.state,
      request({ mode: 'follow.update', view: { surface: 'document' } }),
      host,
      later(100)
    );
    expect(update?.direct).toEqual([]);
    expect(update?.reply).toEqual([]);
    expect(update?.state).toBe(first.state);

    const allowedUpdate = applyRoomNavigation(
      first.state,
      request({ mode: 'follow.update', view: { surface: 'document' } }),
      host,
      later(300)
    );
    expect(allowedUpdate?.direct).toHaveLength(1);

    const summon = applyRoomNavigation(
      first.state,
      request(),
      host,
      later(500)
    );
    expect(summon?.direct).toEqual([]);
    expect(summon?.reply).toEqual([
      { type: 'error', error: 'navigation_rate_limited', requestId: 'nav-1' },
    ]);
    expect(
      applyRoomNavigation(first.state, request(), host, later(1000))?.direct
    ).toHaveLength(1);
  });

  it('paces invitations from people who cannot manage participants', () => {
    const first = applyRoomNavigation(
      room(host, alice),
      request(),
      alice,
      now
    )!;
    expect(
      applyRoomNavigation(first.state, request(), alice, later(1000))?.reply
    ).toEqual([
      { type: 'error', error: 'navigation_rate_limited', requestId: 'nav-1' },
    ]);
    expect(
      applyRoomNavigation(first.state, request(), alice, later(5000))?.direct
    ).toHaveLength(1);
  });

  it('always relays a stop right after a start or an update', () => {
    const stopRequest = request({ mode: 'follow.stop', view: undefined });
    const started = applyRoomNavigation(
      room(host, alice),
      request({ mode: 'follow' }),
      host,
      now
    )!;
    const stoppedAtOnce = applyRoomNavigation(
      started.state,
      stopRequest,
      host,
      later(1)
    )!;
    expect(stoppedAtOnce.direct).toHaveLength(1);
    expect(stoppedAtOnce.direct[0]?.message).toMatchObject({
      mode: 'follow.stop',
    });

    const updated = applyRoomNavigation(
      started.state,
      request({ mode: 'follow.update', view: { surface: 'document' } }),
      host,
      later(400)
    )!;
    expect(
      applyRoomNavigation(updated.state, stopRequest, host, later(401))?.direct
    ).toHaveLength(1);

    // A repeated stop adds nothing; a later one is relayed again.
    const repeated = applyRoomNavigation(
      stoppedAtOnce.state,
      stopRequest,
      host,
      later(500)
    )!;
    expect(repeated.direct).toEqual([]);
    expect(repeated.reply).toEqual([]);
    expect(repeated.state).toBe(stoppedAtOnce.state);
    expect(
      applyRoomNavigation(stoppedAtOnce.state, stopRequest, host, later(1100))
        ?.direct
    ).toHaveLength(1);
    // A stop does not use up the pacing of the next start.
    expect(
      applyRoomNavigation(
        stoppedAtOnce.state,
        request({ mode: 'follow' }),
        host,
        later(1000)
      )?.direct
    ).toHaveLength(1);
  });

  it('keeps Follow and Summon to managers when the room turns it off', () => {
    const state = room(host, alice);
    state.settings = { shareNotes: false, participantNavigation: false };
    expect(applyRoomNavigation(state, request(), alice, now)?.reply).toEqual([
      { type: 'error', error: 'permission_denied', requestId: 'nav-1' },
    ]);
    expect(applyRoomNavigation(state, request(), host, now)?.direct).toEqual([
      expect.objectContaining({ userId: aliceId }),
    ]);
  });

  it('keeps the throttle map to people still in the room', () => {
    const state = {
      ...room(host, alice),
      lastNavigationAt: { [absentId]: 1, [aliceId]: 2 },
    };
    const result = applyRoomNavigation(state, request(), host, now);
    expect(result?.state.lastNavigationAt).toEqual({
      [hostId]: Date.parse(now),
      [aliceId]: 2,
    });
    expect(result?.state.lastNavigationStopAt).toEqual({});
  });

  it('runs through the room command pipeline', () => {
    const hosting = admitOrHold(createMeetRoomSnapshot(), host, now).state;
    const waiting = admitOrHold(hosting, alice, now).state;
    const admitted = applyMeetRoomCommand(waiting, {
      message: { type: 'admission.decide', userId: aliceId, admit: true },
      token: host,
      now,
    }).state;
    const result = applyMeetRoomCommand(admitted, {
      message: request(),
      token: host,
      now: later(10),
    });
    expect(result.reply).toEqual([]);
    expect(result.direct).toEqual([
      {
        userId: aliceId,
        message: expect.objectContaining({
          type: 'navigation',
          from: hostId,
          forced: true,
        }),
      },
    ]);
  });
});
