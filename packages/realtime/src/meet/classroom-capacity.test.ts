import { describe, expect, it } from 'vitest';
import {
  admitOrHold,
  applyMeetRoomCommand,
  canCloseMeetSubscriptions,
  createMeetRoomSnapshot,
  getMeetRealtimeScopesForRole,
  meetRealtimeTokenPayloadSchema,
} from './index';
const now = '2026-11-10T12:00:00.000Z';
function token(
  n: number,
  cap?: number,
  role: 'host' | 'speaker' = n === 1 ? 'host' : 'speaker'
) {
  return meetRealtimeTokenPayloadSchema.parse({
    userId: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
    role,
    exp: Date.parse(now) / 1000 + 600,
    meetingId: '11111111-1111-4111-8111-111111111111',
    wsId: '22222222-2222-4222-8222-222222222222',
    roomId: 'test:classroom',
    limits: {
      maxParticipants: cap,
      maxPublishers: cap ?? 8,
      maxViewers: cap ?? 96,
    },
    scopes: getMeetRealtimeScopesForRole(role),
  });
}
function fill(cap: number) {
  let state = createMeetRoomSnapshot();
  for (let n = 1; n <= cap; n++) {
    const result = admitOrHold(state, token(n, cap), now);
    expect(result.reply.some((x) => x.type === 'ready')).toBe(true);
    state = result.state;
  }
  return state;
}
describe('classroom room limits', () => {
  it.each([10, 50, 100])(
    'admits exactly %i signed participants including host and refuses one more',
    (cap) => {
      const state = fill(cap);
      expect(Object.keys(state.presence)).toHaveLength(cap);
      expect(admitOrHold(state, token(cap + 1, cap), now).reply).toContainEqual(
        { type: 'error', error: 'participant_limit_reached' }
      );
    }
  );
  it('rejects a signed cap above platform100 at token boundary', () =>
    expect(() => token(1, 101)).toThrow());
  it('does not let a legacy token bypass a persisted room cap', () => {
    expect(admitOrHold(fill(10), token(11), now).reply).toContainEqual({
      type: 'error',
      error: 'participant_limit_reached',
    });
  });
  it('retains the legacy publisher cap when no classroom policy is signed', () => {
    let state = createMeetRoomSnapshot();
    for (let n = 1; n <= 8; n++)
      state = admitOrHold(state, token(n), now).state;
    expect(admitOrHold(state, token(9), now).reply).toContainEqual({
      type: 'error',
      error: 'publisher_limit_reached',
    });
  });
  it('host can lower the room maximum, never over plan, and participants cannot change it', () => {
    const state = fill(2);
    const host = token(1, 2);
    const other = token(2, 2);
    const run = (
      settings: { maxParticipants?: number; admissionClosed?: boolean },
      actor = host
    ) =>
      applyMeetRoomCommand(state, {
        token: actor,
        now,
        message: { type: 'room.settings.update', settings },
      });
    expect(
      run({ maxParticipants: 3 }).state.settings?.maxParticipants
    ).toBeUndefined();
    expect(
      run({ maxParticipants: 1 }, other).state.settings?.maxParticipants
    ).toBeUndefined();
    expect(run({ maxParticipants: 1 }).state.settings?.maxParticipants).toBe(1);
  });
  it('stop admission refuses direct, remembered and lobby joins without removing current users', () => {
    let state = fill(2);
    state = applyMeetRoomCommand(state, {
      token: token(1, 2),
      now,
      message: {
        type: 'room.settings.update',
        settings: { admissionClosed: true },
      },
    }).state;
    expect(
      admitOrHold(state, token(1, 2), now).reply.some((x) => x.type === 'ready')
    ).toBe(true);
    for (const admission of ['open', 'lobby'] as const)
      expect(
        admitOrHold(state, { ...token(3, 2), admission }, now).reply
      ).toContainEqual({ type: 'error', error: 'admission_closed' });
    expect(Object.keys(state.presence)).toHaveLength(2);
  });
  it('stopped lobby decisions cannot admit a waiting participant', () => {
    let state = admitOrHold(createMeetRoomSnapshot(), token(1, 10), now).state;
    state = admitOrHold(
      state,
      { ...token(2, 10), admission: 'lobby' },
      now
    ).state;
    state = applyMeetRoomCommand(state, {
      token: token(1, 10),
      now,
      message: {
        type: 'room.settings.update',
        settings: { admissionClosed: true },
      },
    }).state;
    const result = applyMeetRoomCommand(state, {
      token: token(1, 10),
      now,
      message: {
        type: 'admission.decide',
        userId: token(2, 10).userId,
        admit: true,
      },
    });
    expect(result.state.presence[token(2, 10).userId]).toBeUndefined();
    expect(result.reply).toContainEqual({
      type: 'error',
      error: 'admission_closed',
    });
  });
});

it('upgrades a full legacy publisher budget before testing the first current join, without renewing time', () => {
  let state = createMeetRoomSnapshot();
  for (let n = 1; n <= 8; n++) state = admitOrHold(state, token(n), now).state;
  const expiresAt = state.budget?.expiresAt;
  const next = admitOrHold(state, token(9, 50), now);
  expect(next.reply.some((x) => x.type === 'ready')).toBe(true);
  expect(next.state.budget?.maxParticipants).toBe(50);
  expect(next.state.budget?.expiresAt).toBe(expiresAt);
});
it('never raises an established plan cap from a higher-limit token', () => {
  const state = fill(10);
  const result = admitOrHold(state, token(11, 100), now);
  expect(result.reply).toContainEqual({
    type: 'error',
    error: 'participant_limit_reached',
  });
  expect(result.state.budget?.maxParticipants).toBe(10);
});
it('a second concurrent-order lobby decision observes the first filled slot', () => {
  let state = admitOrHold(createMeetRoomSnapshot(), token(1, 2), now).state;
  for (const n of [2, 3])
    state = admitOrHold(
      state,
      { ...token(n, 2), admission: 'lobby' },
      now
    ).state;
  state = applyMeetRoomCommand(state, {
    token: token(1, 2),
    now,
    message: {
      type: 'admission.decide',
      userId: token(2, 2).userId,
      admit: true,
    },
  }).state;
  const result = applyMeetRoomCommand(state, {
    token: token(1, 2),
    now,
    message: {
      type: 'admission.decide',
      userId: token(3, 2).userId,
      admit: true,
    },
  });
  expect(Object.keys(result.state.presence)).toHaveLength(2);
  expect(result.reply).toContainEqual({
    type: 'error',
    error: 'participant_limit_reached',
  });
});

it.each([50, 100])('lets signed flag-off tiers admit %i publishers', (cap) => {
  const withTier = (n: number) => {
    const signed = token(n);
    return {
      ...signed,
      limits: { ...signed.limits, maxPublishers: cap, maxViewers: cap },
    };
  };
  let state = createMeetRoomSnapshot();
  for (let n = 1; n <= cap; n++)
    state = admitOrHold(state, withTier(n), now).state;
  expect(Object.keys(state.presence)).toHaveLength(cap);
  expect(state.budget?.maxParticipants).toBeUndefined();
  expect(admitOrHold(state, withTier(cap + 1), now).reply).toContainEqual({
    type: 'error',
    error: 'publisher_limit_reached',
  });
});

it('holds the default lobby and admits automatically only while admission is open and capacity remains', () => {
  const host = token(1, 2);
  const guest = { ...token(2, 2), admission: 'lobby' as const };
  const initial = admitOrHold(createMeetRoomSnapshot(), host, now).state;
  expect(initial.settings?.skipLobby ?? false).toBe(false);
  expect(
    admitOrHold(initial, guest, now).state.waiting[guest.userId]
  ).toBeDefined();
  const open = { ...initial, settings: { shareNotes: false, skipLobby: true } };
  const admitted = admitOrHold(open, guest, now);
  expect(admitted.state.presence[guest.userId]).toBeDefined();
  expect(
    admitOrHold(admitted.state, { ...guest, userId: token(3, 2).userId }, now)
      .reply
  ).toContainEqual({ type: 'error', error: 'participant_limit_reached' });
  expect(
    admitOrHold(
      { ...open, settings: { ...open.settings, admissionClosed: true } },
      guest,
      now
    ).reply
  ).toContainEqual({ type: 'error', error: 'admission_closed' });
});

it('bulk admit fills the room, reports overflow, and keeps overflow waiting for an explicit decision', () => {
  const host = token(1, 3);
  const cohost = {
    ...token(2, 3),
    scopes: [...token(2, 3).scopes, 'participants:manage'],
  };
  const first = { ...token(3, 3), admission: 'lobby' as const };
  const second = { ...token(4, 3), admission: 'lobby' as const };
  let state = createMeetRoomSnapshot();
  for (const actor of [host, cohost, first, second])
    state = admitOrHold(state, actor, now).state;
  const decide = (actor: typeof host, admit: boolean) =>
    applyMeetRoomCommand(state, {
      token: actor,
      now,
      message: { type: 'admission.decideAll', admit, requestId: 'bulk' },
    });
  expect(decide(first, true).reply[0]).toMatchObject({ type: 'error' });
  const admitted = decide(cohost, true);
  expect(admitted.reply[0]).toEqual({
    type: 'admission.bulkResult',
    admitted: 1,
    denied: 0,
    remaining: 1,
    requestId: 'bulk',
  });
  expect(admitted.state.waiting[second.userId]).toBeDefined();
  expect(admitted.toManagers.map((message) => message.type)).toEqual([
    'admission.pending',
    'admission.approved',
  ]);
  state = admitted.state;
  const denied = decide(host, false);
  expect(denied.disconnect).toEqual([second.userId]);
  const reopened = {
    ...denied.state,
    settings: { shareNotes: false, skipLobby: true },
  };
  expect(
    admitOrHold(reopened, second, now).state.waiting[second.userId]
  ).toBeDefined();
});

it.each([
  ['audio', 'micsLocked', 'mic', 'audioEnabled'],
  ['video', 'camerasLocked', 'camera', 'videoEnabled'],
  ['screen', 'screensLocked', 'screen', 'screenEnabled'],
  ['screen_audio', 'screensLocked', 'screen', 'screenEnabled'],
] as const)(
  'enforces the %s lock in presence, SFU publication and override revocation',
  (kind, lock, override, field) => {
    const host = token(1, 5);
    const guest = token(2, 5);
    const cohost = {
      ...token(3, 5),
      scopes: [...token(3, 5).scopes, 'participants:manage'],
    };
    let state = createMeetRoomSnapshot();
    for (const actor of [host, guest, cohost])
      state = admitOrHold(state, actor, now).state;
    const run = (
      actor: typeof host,
      message: Parameters<typeof applyMeetRoomCommand>[1]['message']
    ) => applyMeetRoomCommand(state, { token: actor, now, message });
    const publish = (actor: typeof host, mid = '0') =>
      run(actor, {
        type: 'sfu.tracks.publish',
        sessionId: actor.userId,
        requestId: 'pub',
        sessionDescription: { type: 'offer', sdp: 'fixture' },
        tracks: [
          { mid, trackName: `${actor.userId}-${kind}`, location: 'local' },
        ],
      });
    expect(
      run(guest, { type: 'room.settings.update', settings: { [lock]: true } })
        .reply[0]
    ).toMatchObject({ error: 'permission_denied' });
    state = publish(guest).state;
    const locked = run(cohost, {
      type: 'room.settings.update',
      settings: { [lock]: true },
    });
    state = locked.state;
    expect(locked.broadcast).toContainEqual(
      expect.objectContaining({
        type: 'participant.muted',
        userId: guest.userId,
        kinds: expect.arrayContaining([kind]),
      })
    );
    expect(locked.broadcast).toContainEqual(
      expect.objectContaining({ type: 'track.closed', userId: guest.userId })
    );
    expect(state.budget?.pendingPublications).toHaveLength(1);
    expect(publish(guest).reply[0]).toMatchObject({
      error: 'publish_not_allowed',
    });
    expect(publish(host).sfu).not.toBeNull();
    expect(publish(cohost).sfu).not.toBeNull();
    const media = {
      audioEnabled: true,
      screenEnabled: true,
      videoEnabled: true,
    };
    for (const type of ['presence.join', 'presence.update'] as const)
      expect(
        run(guest, { type, media }).state.presence[guest.userId]?.media[field]
      ).toBe(false);
    state = run(host, {
      type: 'room.mediaOverride',
      userId: guest.userId,
      override: { [override]: true },
    }).state;
    expect(
      run(guest, { type: 'presence.update', media }).state.presence[
        guest.userId
      ]?.media[field]
    ).toBe(true);
    state = publish(guest, '1').state;
    expect(Object.keys(state.tracks)).toHaveLength(1);
    state = run(host, {
      type: 'room.mediaOverride',
      userId: guest.userId,
      override: null,
    }).state;
    expect(Object.keys(state.tracks)).toHaveLength(0);
    expect(publish(guest).reply[0]).toMatchObject({
      error: 'publish_not_allowed',
    });
  }
);

it('rejects a camera SDP section declared as audio while cameras are locked', () => {
  const host = token(1, 5);
  const guest = token(2, 5);
  let state = admitOrHold(createMeetRoomSnapshot(), host, now).state;
  state = admitOrHold(state, guest, now).state;
  state = applyMeetRoomCommand(state, {
    token: host,
    now,
    message: {
      type: 'room.settings.update',
      settings: { camerasLocked: true },
    },
  }).state;
  const result = applyMeetRoomCommand(state, {
    token: guest,
    now,
    message: {
      type: 'sfu.tracks.publish',
      sessionId: 'session',
      requestId: 'publish',
      sessionDescription: {
        type: 'offer',
        sdp: 'v=0\r\nm=video 9 UDP/TLS/RTP/SAVPF 96\r\na=mid:0\r\n',
      },
      tracks: [{ mid: '0', kind: 'audio', trackName: `${guest.userId}-audio` }],
    },
  });
  expect(result.sfu).toBeNull();
  expect(result.reply).toContainEqual({
    type: 'error',
    requestId: 'publish',
    error: 'publish_not_allowed',
  });
});

it('allows closing a confirmed receiver MID without touching publisher state', () => {
  const viewer = {
    ...token(2, 5),
    role: 'viewer' as const,
    scopes: getMeetRealtimeScopesForRole('viewer'),
  };
  const state = admitOrHold(createMeetRoomSnapshot(), viewer, now).state;
  const message = {
    type: 'sfu.tracks.close' as const,
    subscription: true as const,
    requestId: 'close',
    sessionId: 'receiver',
    tracks: [{ mid: '7' }],
  };
  const attempt = (mids: string[]) =>
    applyMeetRoomCommand(state, {
      token: viewer,
      now,
      message,
      canCloseSubscriptions: () =>
        canCloseMeetSubscriptions({ receiver: mids }, message),
    });
  expect(attempt(['8']).reply).toContainEqual({
    type: 'error',
    requestId: 'close',
    error: 'permission_denied',
  });
  const accepted = attempt(['7']);
  expect(accepted.sfu?.message).toEqual({ ...message, force: true });
  expect(accepted.broadcast).toEqual([]);
  expect(accepted.state.tracks).toBe(state.tracks);
});
