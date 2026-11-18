import { expect, it } from 'vitest';
import {
  type MeetRealtimeTokenPayload,
  meetRoomLimitsSchema,
} from './primitives';
import { createMeetPresence, createMeetRoomSnapshot } from './room';
import { type RoomServiceState, roomService } from './room-service';

const snapshot = createMeetRoomSnapshot();
const token = {
  accountId: 'guest',
  userId: 'guest',
  role: 'speaker',
  scopes: ['meet:server'],
  limits: meetRoomLimitsSchema.parse({}),
} as MeetRealtimeTokenPayload;
it('requires admission even for a signed server caller', () =>
  expect(
    roomService(snapshot, token, { action: 'programming.read' })?.status
  ).toBe(403));
it('allows admitted reading but restricts selection to the host', () => {
  const admitted = {
    ...snapshot,
    approved: { guest: { userId: 'guest', displayName: 'Guest' } },
  };
  expect(
    roomService(admitted, token, { action: 'programming.read' })?.body
  ).toEqual({ selection: null });
  expect(
    roomService(admitted, token, {
      action: 'programming.set',
      selection: null,
    })?.status
  ).toBe(403);
});
it('denies ended rooms and broadcasts authorized selections', () => {
  const host = { ...token, role: 'host' } as MeetRealtimeTokenPayload;
  expect(
    roomService({ ...snapshot, ended: true }, host, {
      action: 'programming.read',
    })?.status
  ).toBe(403);
  const selection = {
    kind: 'playground',
    id: '00000000-0000-4000-8000-000000000001',
    language: 'python',
  };
  expect(
    roomService(snapshot, host, {
      action: 'programming.set',
      selection,
    })?.messages?.[0]
  ).toMatchObject({
    type: 'room.settings',
    settings: { programming: selection },
  });
});

const host = {
  ...token,
  role: 'host',
  meetingId: 'meeting',
  displayName: 'Editor',
} satisfies MeetRealtimeTokenPayload;
const generation = '00000000-0000-4000-8000-000000000010';
const id = '00000000-0000-4000-8000-000000000011';
const sessionId = '00000000-0000-4000-8000-000000000012';
const selection = {
  kind: 'problem',
  id: '00000000-0000-4000-8000-000000000013',
  language: 'python',
} as const;
const attempt = { id, generation };
function openRoom(): RoomServiceState {
  return {
    ...snapshot,
    settings: { shareNotes: false, programming: selection },
    presence: {
      joined: createMeetPresence(host, '2026-11-18T00:00:00Z'),
      observer: createMeetPresence(
        { ...token, userId: 'other', accountId: 'other' },
        '2026-11-18T00:00:00Z'
      ),
    },
    programmingMira: { generation, presence: null },
    miraPrivate: {
      choices: {
        guest: {
          choice: 'continue' as const,
          version: '2026-11-13-private-v1',
          meetingId: 'meeting',
          accountId: host.userId,
          revision: 1,
          recordedAt: 1,
        },
      },
      sessions: { guest: [sessionId] },
    },
  };
}
const start = {
  action: 'programming.miraPresence',
  phase: 'start',
  attempt,
  revision: 1,
  source: 'live',
  sessionId,
  context: {
    filePath: 'app.py',
    startLine: 1,
    endLine: 2,
    original: 'print(1)',
    digest: 'a'.repeat(64),
    intent: 'fix',
  },
};
const viaLive = { ...host, scopes: ['meet:server', 'meet:live-server'] };
const draft = {
  action: 'programming.voiceContext',
  sessionId,
  id,
  answer: { explanation: 'Use the expected value.', replacement: 'print(2)' },
};

it('rejects forged, stale and non-admitted Mira actions', () => {
  const room = openRoom();
  expect(roomService(room, token, start)?.status).toBe(403);
  expect(roomService(room, { ...host, scopes: [] }, start)?.status).toBe(403);
  expect(roomService({ ...room, presence: {} }, host, start)?.status).toBe(403);
  expect(
    roomService(room, host, {
      ...start,
      attempt: { id, generation: null },
    })?.status
  ).toBe(409);
  expect(roomService(room, host, { ...start, revision: 2 })?.status).toBe(403);
});

it('keeps live drafts private until the host publishes and serializes resolution', () => {
  const staged = roomService(openRoom(), host, start)!.state;
  expect(roomService(staged, host, draft)?.status).toBe(403);
  const drafted = roomService(staged, viaLive, draft)!.state;
  const other = {
    ...token,
    userId: 'other',
    accountId: 'other',
    scopes: ['meet:server', 'meet:workspace-member'],
  };
  const read = { action: 'programming.read', mira: true };
  expect(roomService(drafted, other, read)?.body).toMatchObject({
    voiceDraft: null,
  });
  expect(JSON.stringify(roomService(drafted, other, read)?.body)).not.toContain(
    'print(2)'
  );
  const published = roomService(drafted, host, {
    action: 'programming.miraPresence',
    phase: 'publish',
    attempt,
  })!.state;
  expect(roomService(published, other, read)?.body).toMatchObject({
    miraPresence: {
      source: 'live',
      proposedFix: { status: 'proposed', original: 'print(1)' },
    },
  });
  const resolve = {
    action: 'programming.resolveFix',
    phase: 'begin',
    attempt,
    decision: 'accepted',
  };
  const locked = roomService(published, host, resolve)!.state;
  expect(
    roomService(locked, host, { ...resolve, decision: 'dismissed' })?.status
  ).toBe(409);
  expect(
    roomService(locked, host, {
      action: 'programming.set',
      selection: null,
    })?.status
  ).toBe(409);
  expect(
    roomService(locked, host, { ...resolve, phase: 'finish' })?.body
  ).toMatchObject({
    miraPresence: { proposedFix: { status: 'accepted', acceptedBy: 'Editor' } },
  });
});
