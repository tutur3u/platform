import { expect, it } from 'vitest';
import {
  admitOrHold,
  createMeetRoomSnapshot,
  meetRealtimeTokenPayloadSchema,
} from './index';
import { endMeetRoom } from './room-ending';
import { MIRA_PRIVATE_NOTICE_VERSION as version } from './room-mira-private';
import { MIRA_SHARE_CONTEXT_TTL_MS } from './room-mira-share';
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
  expect(roomService(state, privateMira, read).status).toBe(403);
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
  expect(roomService(state, privateMira, read).body).toEqual({ tutor });
});

it('never lets Room Mira or an unregistered session read private data', () => {
  const state = shared();
  expect(roomService(state, roomMira, read).status).toBe(403);
  expect(
    roomService(state, privateMira, {
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
  expect(roomService(hostShared, privateMira, read).status).toBe(403);

  const ownerShared = shared();
  const hostMira = person(other, {
    role: 'host',
    scopes: ['meet:server', 'meet:live-server', 'meet:private-mira'],
  });
  // The host's own Private Mira reads only the host's grant, which is off.
  expect(
    roomService(ownerShared, hostMira, {
      action: 'mira.share.private.read',
      sessionId: otherSession,
    }).status
  ).toBe(403);
  expect(roomService(ownerShared, hostMira, read).status).toBe(403);
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
  expect(revoked.body).toEqual({ enabled: false, revision: 2 });
  expect(revoked.state.miraShares?.[owner]?.context).toBeUndefined();
  expect(roomService(revoked.state, privateMira, read).status).toBe(403);
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
  expect(roomService(state, privateMira, read).status).toBe(403);
});

it('drops stale context and every share when the meeting ends', () => {
  const state = shared();
  expect(roomService(state, privateMira, read).body).toEqual({ tutor });
  const stale = {
    ...state,
    miraShares: {
      [owner]: {
        ...state.miraShares![owner]!,
        context: {
          tutor,
          updatedAt: Date.now() - MIRA_SHARE_CONTEXT_TTL_MS - 1,
        },
      },
    },
  };
  expect(roomService(stale, privateMira, read).body).toEqual({ tutor: [] });
  const ended = endMeetRoom(state, '2026-11-25T01:00:00Z') as RoomServiceState;
  expect(ended.miraShares).toBeUndefined();
  expect(roomService(ended, privateMira, read).status).toBe(403);
});
