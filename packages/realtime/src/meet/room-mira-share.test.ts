import { expect, it } from 'vitest';
import {
  admitOrHold,
  createMeetRoomSnapshot,
  meetRealtimeTokenPayloadSchema,
} from './index';
import { applyMeetClassService } from './class-service';
import { getMeetRealtimeScopesForRole } from './permissions';
import { endMeetRoom } from './room-ending';
import { MIRA_PRIVATE_NOTICE_VERSION as version } from './room-mira-private';
import {
  applyMiraShare,
  authorizeMiraSharePrivateRead,
  MIRA_SHARE_CONTEXT_TTL_MS,
  MIRA_SHARE_MAX_CONTEXT_BYTES,
  MIRA_SHARE_TOTAL_CONTEXT_BYTES,
  nextMiraShareExpiry,
} from './room-mira-share';
import { roomService, type RoomServiceState } from './room-service';

const owner = '00000000-0000-4000-8000-000000000001';
const other = '00000000-0000-4000-8000-000000000005';
const sessionId = '00000000-0000-4000-8000-000000000004';
const otherSession = '00000000-0000-4000-8000-000000000006';
const person = (accountId: string, extra: Record<string, unknown> = {}) =>
  meetRealtimeTokenPayloadSchema.parse({
    exp: 2000000000,
    limits: {},
    meetingId: '00000000-0000-4000-8000-000000000002',
    mode: 'call',
    role: 'speaker',
    roomId: 'room',
    scopes: ['meet:server'],
    userId: accountId,
    accountId,
    wsId: '00000000-0000-4000-8000-000000000003',
    ...extra,
  });
const ownerToken = person(owner);
const host = person(other, { role: 'host' });
const roomMira = person(owner, {
  role: 'host',
  scopes: ['meet:server', 'meet:live-server'],
});
const privateMira = person(owner, {
  scopes: ['meet:server', 'meet:live-server', 'meet:private-mira'],
});
const tutor = [
  { assistant: false, body: 'Explain photosynthesis again' },
  { assistant: true, body: 'Plants turn light into sugar.' },
];
const read = { action: 'mira.share.private.read', sessionId };

/**
 * The room Durable Object's answer to a Private Mira read, with the queued
 * text standing in for its storage key (see mira-share-storage.ts).
 */
function privateRead(
  state: RoomServiceState,
  token = privateMira,
  input: unknown = read
) {
  const result = authorizeMiraSharePrivateRead(state, token, input);
  if ('status' in result) return { status: result.status, body: result.body };
  const text = state.miraSharePending?.[result.account];
  const current =
    !!text &&
    text.revision === result.grant.revision &&
    text.updatedAt === result.grant.context?.updatedAt;
  return { status: undefined, body: { tutor: current ? text.tutor : [] } };
}
const expiredContext = () => ({
  updatedAt: Date.now() - MIRA_SHARE_CONTEXT_TTL_MS - 1,
  bytes: 100,
});

/** Owner and host are in the room; both chose Continue and started Mira. */
function room(): RoomServiceState {
  let state: RoomServiceState = createMeetRoomSnapshot();
  state = admitOrHold(state, ownerToken, '2026-11-25T00:00:00Z').state;
  state = admitOrHold(state, host, '2026-11-25T00:00:00Z').state;
  for (const token of [ownerToken, host])
    state = roomService(state, token, {
      action: 'mira.private.choice',
      choice: 'continue',
      version,
    }).state;
  state = roomService(state, ownerToken, {
    action: 'mira.private.register',
    sessionId,
  }).state;
  return roomService(state, host, {
    action: 'mira.private.register',
    sessionId: otherSession,
  }).state;
}

function shared() {
  let state = roomService(room(), ownerToken, {
    action: 'mira.share.set',
    enabled: true,
  }).state;
  state = roomService(state, ownerToken, {
    action: 'mira.share.context',
    tutor,
  }).state;
  return state;
}

it('starts off and lets no Mira session read before the owner shares', () => {
  const state = room();
  expect(
    roomService(state, ownerToken, { action: 'mira.share.read' }).body
  ).toEqual({ enabled: false, revision: 0 });
  expect(privateRead(state).status).toBe(403);
  expect(
    roomService(state, ownerToken, { action: 'mira.share.context', tutor })
      .status
  ).toBe(403);
});

it('lets the owner share with their own registered Private Mira session', () => {
  const state = shared();
  expect(
    roomService(state, ownerToken, { action: 'mira.share.read' }).body
  ).toEqual({ enabled: true, revision: 1 });
  expect(privateRead(state).body).toEqual({ tutor });
});

it('never lets Room Mira or an unregistered session read private data', () => {
  const state = shared();
  expect(privateRead(state, roomMira).status).toBe(403);
  expect(
    privateRead(state, privateMira, {
      action: 'mira.share.private.read',
      sessionId: otherSession,
    }).status
  ).toBe(403);
});

it('keeps each grant to its owner: a host can neither grant nor read it', () => {
  const state = room();
  expect(
    roomService(state, host, {
      action: 'mira.share.set',
      enabled: true,
      accountId: owner,
    }).status
  ).toBe(400);
  const hostShared = roomService(state, host, {
    action: 'mira.share.set',
    enabled: true,
  }).state;
  expect(hostShared.miraShares?.[owner]).toBeUndefined();
  expect(privateRead(hostShared).status).toBe(403);

  const ownerShared = shared();
  const hostMira = person(other, {
    role: 'host',
    scopes: ['meet:server', 'meet:live-server', 'meet:private-mira'],
  });
  // The host's own Private Mira reads only the host's grant, which is off.
  expect(
    privateRead(ownerShared, hostMira, {
      action: 'mira.share.private.read',
      sessionId: otherSession,
    }).status
  ).toBe(403);
  expect(privateRead(ownerShared, hostMira).status).toBe(403);
});

it('refuses Mira itself and guests when they try to change a grant', () => {
  const state = room();
  for (const token of [privateMira, roomMira])
    expect(
      roomService(state, token, { action: 'mira.share.set', enabled: true })
        .status
    ).toBe(403);
  expect(
    roomService(state, person(owner, { guest: true }), {
      action: 'mira.share.set',
      enabled: true,
    }).status
  ).toBe(403);
});

it('takes effect immediately on revoke and drops the shared context', () => {
  const revoked = roomService(shared(), ownerToken, {
    action: 'mira.share.set',
    enabled: false,
  });
  expect(revoked.body).toEqual({
    enabled: false,
    revision: 2,
    sessions: [sessionId],
  });
  expect(revoked.state.miraShares?.[owner]?.context).toBeUndefined();
  expect(privateRead(revoked.state).status).toBe(403);
  expect(
    roomService(revoked.state, ownerToken, {
      action: 'mira.share.context',
      tutor,
    }).status
  ).toBe(403);
});

it('ends with a changed Private Mira choice and does not revive on return', () => {
  let state = roomService(shared(), ownerToken, {
    action: 'mira.private.ended',
    sessionId,
  }).state;
  for (const choice of ['mute', 'continue'])
    state = roomService(state, ownerToken, {
      action: 'mira.private.choice',
      choice,
      version,
    }).state;
  state = roomService(state, ownerToken, {
    action: 'mira.private.register',
    sessionId,
  }).state;
  expect(
    roomService(state, ownerToken, { action: 'mira.share.read' }).body
  ).toMatchObject({ enabled: false });
  expect(privateRead(state).status).toBe(403);
});

it('drops stale context and every share when the meeting ends', () => {
  const state = shared();
  expect(privateRead(state).body).toEqual({ tutor });
  const stale = {
    ...state,
    miraShares: {
      [owner]: {
        ...state.miraShares![owner]!,
        context: expiredContext(),
      },
    },
  };
  expect(privateRead(stale).body).toEqual({ tutor: [] });
  const ended = endMeetRoom(state, '2026-11-25T01:00:00Z') as RoomServiceState;
  expect(ended.miraShares).toBeUndefined();
  expect(privateRead(ended).status).toBe(403);
});

it('refuses a browser call token for everything but the owner revoking', () => {
  const browser = person(owner, {
    scopes: getMeetRealtimeScopesForRole('speaker'),
  });
  const state = shared();
  for (const input of [
    { action: 'mira.share.set', enabled: true },
    { action: 'mira.share.context', tutor },
    { action: 'mira.share.read' },
  ]) {
    expect(applyMiraShare(room(), browser, input)?.status).toBe(403);
    expect(roomService(room(), browser, input).status).toBe(403);
  }
  const revoked = applyMiraShare(state, browser, {
    action: 'mira.share.set',
    enabled: false,
  });
  expect(revoked?.status).toBeUndefined();
  expect(revoked?.state.miraShares?.[owner]?.enabled).toBe(false);
  // The trusted room service itself still needs a server-issued token.
  expect(
    roomService(state, browser, { action: 'mira.share.set', enabled: false })
      .status
  ).toBe(403);
});

it('refuses shared context over the size cap and keeps the previous one', () => {
  const state = shared();
  const turn = { assistant: true, body: 'x'.repeat(2000) };
  const large = roomService(state, ownerToken, {
    action: 'mira.share.context',
    tutor: Array.from(
      { length: Math.ceil(MIRA_SHARE_MAX_CONTEXT_BYTES / 2000) + 1 },
      () => turn
    ).slice(0, 12),
  });
  expect(large.status).toBe(413);
  expect(privateRead(large.state).body).toEqual({ tutor });
});

it('refuses and drops expired context on the next room access', () => {
  const state = shared();
  const expired = {
    ...state,
    miraShares: {
      [owner]: {
        ...state.miraShares![owner]!,
        context: expiredContext(),
      },
    },
  };
  expect(privateRead(expired).body).toEqual({ tutor: [] });
  const choice = roomService(expired, ownerToken, {
    action: 'mira.private.read',
  });
  expect(choice.state.miraShares?.[owner]?.context).toBeUndefined();
});

it('drops shared context as soon as the Private Mira choice changes', () => {
  let state = roomService(shared(), ownerToken, {
    action: 'mira.private.ended',
    sessionId,
  }).state;
  expect(state.miraShares?.[owner]?.context).toBeDefined();
  state = roomService(state, ownerToken, {
    action: 'mira.private.choice',
    choice: 'mute',
    version,
  }).state;
  expect(state.miraShares?.[owner]?.context).toBeUndefined();
});

it('reports the caller’s own share status on their Private Mira choice read', () => {
  const choice = { action: 'mira.private.read' };
  expect(roomService(room(), ownerToken, choice).body).toMatchObject({
    shared: false,
  });
  const state = shared();
  expect(roomService(state, ownerToken, choice).body).toMatchObject({
    shared: true,
  });
  expect(roomService(state, host, choice).body).toMatchObject({
    shared: false,
  });
});

it('erases a subject’s share and every share when the meeting is erased', () => {
  const state = roomService(shared(), host, {
    action: 'mira.share.set',
    enabled: true,
  }).state;
  const erase = (claims: Record<string, unknown>) =>
    applyMeetClassService(
      state,
      {
        aud: 'meet-service',
        purpose: 'attendance-erase',
        roomId: 'room',
        exp: 1_800_000_000,
        generation: 1,
        ...claims,
      } as Parameters<typeof applyMeetClassService>[1],
      { attendance: false, timer: false },
      '2026-11-25T01:00:00.000Z'
    );
  const subject = erase({ erase: 'subject', userId: owner });
  const after = subject.snapshot as RoomServiceState;
  expect(after.miraShares?.[owner]).toBeUndefined();
  expect(after.miraShares?.[other]?.enabled).toBe(true);
  expect(subject.persist).toBe(true);
  const meeting = erase({ erase: 'meeting' }).snapshot as RoomServiceState;
  expect(meeting.miraShares).toBeUndefined();
});

it('keeps shared text out of the room snapshot metadata', () => {
  const state = shared();
  const grant = state.miraShares?.[owner];
  expect(grant?.context).toEqual({
    updatedAt: expect.any(Number),
    bytes: expect.any(Number),
  });
  expect(JSON.stringify(state.miraShares)).not.toContain('photosynthesis');
  expect(state.miraSharePending?.[owner]).toMatchObject({
    tutor,
    revision: grant?.revision,
    updatedAt: grant?.context?.updatedAt,
  });
});

it('evicts the oldest shared chat once the room cap is reached', () => {
  const ids = Array.from({ length: 20 }, (_, index) =>
    `00000000-0000-4000-8000-${String(100 + index).padStart(12, '0')}`
  );
  let state: RoomServiceState = createMeetRoomSnapshot();
  const big = Array.from({ length: 7 }, (_, index) => ({
    assistant: index % 2 === 1,
    body: 'y'.repeat(1990),
  }));
  ids.forEach((id, index) => {
    const token = person(id);
    state = admitOrHold(state, token, '2026-11-25T00:00:00Z').state;
    for (const input of [
      { action: 'mira.private.choice', choice: 'continue', version },
      { action: 'mira.share.set', enabled: true },
    ])
      state = roomService(state, token, input).state;
    const result = applyMiraShare(
      state,
      token,
      { action: 'mira.share.context', tutor: big },
      1_800_000_000_000 + index
    )!;
    expect(result.status).toBeUndefined();
    state = result.state;
  });
  const kept = ids.filter((id) => state.miraShares?.[id]?.context);
  const total = kept.reduce(
    (sum, id) => sum + state.miraShares![id]!.context!.bytes,
    0
  );
  expect(total).toBeLessThanOrEqual(MIRA_SHARE_TOTAL_CONTEXT_BYTES);
  expect(kept.length).toBeLessThan(ids.length);
  // The oldest go first; the newest are always kept.
  expect(state.miraShares?.[ids[0]!]?.context).toBeUndefined();
  expect(kept).toEqual(ids.slice(ids.length - kept.length));
  expect(state.miraShares?.[ids[0]!]?.enabled).toBe(true);
});

it('returns the owner’s sessions on revoke even when they are not admitted', () => {
  const state = shared();
  const left = { ...state, presence: {} };
  const revoked = roomService(left, ownerToken, {
    action: 'mira.share.set',
    enabled: false,
  });
  expect(revoked.status).toBeUndefined();
  expect(revoked.body).toMatchObject({ enabled: false, sessions: [sessionId] });
});

it('lets the owner’s own Private Mira revoke but never turn sharing on', () => {
  const state = shared();
  expect(
    roomService(state, privateMira, { action: 'mira.share.set', enabled: true })
      .status
  ).toBe(403);
  expect(
    roomService(state, roomMira, { action: 'mira.share.set', enabled: false })
      .status
  ).toBe(403);
  const revoked = roomService(state, privateMira, {
    action: 'mira.share.set',
    enabled: false,
  });
  expect(revoked.status).toBeUndefined();
  expect(revoked.state.miraShares?.[owner]?.enabled).toBe(false);
});

it('reports when the next shared chat expires so the room can sweep it', () => {
  expect(nextMiraShareExpiry(room())).toBeUndefined();
  const state = shared();
  const at = state.miraShares![owner]!.context!.updatedAt;
  expect(nextMiraShareExpiry(state)).toBe(at + MIRA_SHARE_CONTEXT_TTL_MS);
});

