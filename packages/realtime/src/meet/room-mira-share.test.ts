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
  MIRA_SHARE_CONTEXT_TTL_MS,
  MIRA_SHARE_MAX_CONTEXT_BYTES,
  MIRA_SHARE_TOTAL_CONTEXT_BYTES,
  nextMiraShareExpiry,
} from './room-mira-share';
import {
  MiraShareStorage,
  readSharedTutorChat,
} from './room-mira-share-storage';
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
 * The room Durable Object's real read path: queued text is flushed to an
 * in-memory key store, then read back the way the room serves it.
 */
async function privateRead(
  state: RoomServiceState,
  token = privateMira,
  input: unknown = read
) {
  const values = new Map<string, unknown>();
  const storage = {
    get: async <T>(key: string) => values.get(key) as T | undefined,
    put: async (key: string, value: unknown) => {
      values.set(key, structuredClone(value));
    },
    delete: async (keys: string[]) => {
      for (const key of keys) values.delete(key);
    },
  };
  const flushed = new MiraShareStorage(() => storage).flush(state);
  const result = await readSharedTutorChat(storage, flushed, token, input);
  if (!result) throw new Error('Expected a shared tutor chat read');
  return result;
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

it('starts off and lets no Mira session read before the owner shares', async () => {
  const state = room();
  expect(
    roomService(state, ownerToken, { action: 'mira.share.read' }).body
  ).toEqual({ enabled: false, revision: 0 });
  expect((await privateRead(state)).status).toBe(403);
  expect(
    roomService(state, ownerToken, { action: 'mira.share.context', tutor })
      .status
  ).toBe(403);
});

it('lets the owner share with their own registered Private Mira session', async () => {
  const state = shared();
  expect(
    roomService(state, ownerToken, { action: 'mira.share.read' }).body
  ).toEqual({ enabled: true, revision: 1, sharedAt: expect.any(Number) });
  expect((await privateRead(state)).body).toMatchObject({ tutor });
});

it('never lets Room Mira or an unregistered session read private data', async () => {
  const state = shared();
  expect((await privateRead(state, roomMira)).status).toBe(403);
  expect(
    (
      await privateRead(state, privateMira, {
        action: 'mira.share.private.read',
        sessionId: otherSession,
      })
    ).status
  ).toBe(403);
});

it('keeps each grant to its owner: a host can neither grant nor read it', async () => {
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
  expect((await privateRead(hostShared)).status).toBe(403);

  const ownerShared = shared();
  const hostMira = person(other, {
    role: 'host',
    scopes: ['meet:server', 'meet:live-server', 'meet:private-mira'],
  });
  // The host's own Private Mira reads only the host's grant, which is off.
  expect(
    (
      await privateRead(ownerShared, hostMira, {
        action: 'mira.share.private.read',
        sessionId: otherSession,
      })
    ).status
  ).toBe(403);
  expect((await privateRead(ownerShared, hostMira)).status).toBe(403);
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

it('takes effect immediately on revoke and drops the shared context', async () => {
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
  expect((await privateRead(revoked.state)).status).toBe(403);
  expect(
    roomService(revoked.state, ownerToken, {
      action: 'mira.share.context',
      tutor,
    }).status
  ).toBe(403);
});

it('ends with a changed Private Mira choice and does not revive on return', async () => {
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
  expect((await privateRead(state)).status).toBe(403);
});

it('drops stale context and every share when the meeting ends', async () => {
  const state = shared();
  expect((await privateRead(state)).body).toMatchObject({ tutor });
  const stale = {
    ...state,
    miraShares: {
      [owner]: {
        ...state.miraShares![owner]!,
        context: expiredContext(),
      },
    },
  };
  expect((await privateRead(stale)).body).toMatchObject({ tutor: [] });
  const ended = endMeetRoom(state, '2026-11-25T01:00:00Z') as RoomServiceState;
  expect(ended.miraShares).toBeUndefined();
  expect((await privateRead(ended)).status).toBe(403);
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

it('refuses shared context over the size cap and keeps the previous one', async () => {
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
  expect((await privateRead(large.state)).body).toMatchObject({ tutor });
});

it('refuses and drops expired context on the next room access', async () => {
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
  expect((await privateRead(expired)).body).toMatchObject({ tutor: [] });
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
  // Nineteen other people already share 14 KB each; only the writer needs
  // to be in the room.
  const others = Array.from({ length: 19 }, (_, index) =>
    `00000000-0000-4000-8000-${String(100 + index).padStart(12, '0')}`
  );
  let state = shared();
  const now = Date.now();
  others.forEach((id, index) => {
    state = {
      ...state,
      miraPrivate: {
        ...state.miraPrivate!,
        choices: {
          ...state.miraPrivate!.choices,
          [id]: {
            choice: 'continue',
            version,
            meetingId: ownerToken.meetingId!,
            accountId: id,
            recordedAt: now,
            revision: 1,
          },
        },
      },
      miraShares: {
        ...state.miraShares,
        [id]: {
          enabled: true,
          revision: 1,
          choiceRevision: 1,
          meetingId: ownerToken.meetingId!,
          updatedAt: now - 120_000,
          context: { updatedAt: now - 60_000 + index, bytes: 14_000 },
        },
      },
    };
  });
  const result = roomService(state, ownerToken, {
    action: 'mira.share.context',
    tutor,
  });
  expect(result.status).toBeUndefined();
  const shares = result.state.miraShares!;
  const total = Object.values(shares).reduce(
    (sum, grant) => sum + (grant.context?.bytes ?? 0),
    0
  );
  expect(total).toBeLessThanOrEqual(MIRA_SHARE_TOTAL_CONTEXT_BYTES);
  // Only the oldest goes; its grant stays on without its chat.
  expect(shares[others[0]!]?.context).toBeUndefined();
  expect(shares[others[0]!]?.enabled).toBe(true);
  expect(shares[others[1]!]?.context).toBeDefined();
  expect(shares[owner]?.context).toBeDefined();
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

