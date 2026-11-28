import { expect, test } from 'vitest';
import { MEET_CLASSROOM_TOOLS_SCOPE } from './classroom-tools-schema';
import {
  createMeetPresence,
  createMeetRoomSnapshot,
  meetRealtimeTokenPayloadSchema,
} from './index';
import type { MeetRealtimeTokenPayload } from './primitives';
import {
  createMeetRoomAccountAlias,
  meetRoomAccountAlias,
} from './room-account-alias';
import type { BreakoutsView } from './room-breakouts';
import { applyRoomClassroomTools } from './room-classroom-tools';
import type { RoomServiceState } from './room-service';

const SECRET = 'breakout-ids-secret';
const ROOM = 'ws:breakouts';
const now = Date.parse('2026-11-28T08:00:00.000Z');
const alias = createMeetRoomAccountAlias(() => SECRET);
const ids = {
  host: '10000000-0000-4000-8000-000000000001',
  member: '10000000-0000-4000-8000-000000000002',
  guest: '10000000-0000-4000-8000-000000000003',
  external: '10000000-0000-4000-8000-000000000004',
  other: '10000000-0000-4000-8000-000000000005',
};
type Name = keyof typeof ids;
const ALL = Object.values(ids);

function token(name: Name): MeetRealtimeTokenPayload {
  const outside = name === 'guest' || name === 'external';
  return meetRealtimeTokenPayloadSchema.parse({
    accountId: ids[name],
    // Connection ids are distinct from account ids, as issued tokens carry.
    userId: crypto.randomUUID(),
    role: name === 'host' ? 'host' : 'speaker',
    admission: outside ? 'lobby' : 'open',
    ...(name === 'guest' ? { guest: true } : {}),
    displayName: name,
    wsId: '30000000-0000-4000-8000-000000000001',
    meetingId: '20000000-0000-4000-8000-000000000001',
    roomId: ROOM,
    mode: 'call',
    exp: now / 1000 + 600,
    scopes: ['meet:server', MEET_CLASSROOM_TOOLS_SCOPE],
  });
}

function fixture() {
  const tokens = Object.fromEntries(
    (Object.keys(ids) as Name[]).map((name) => [name, token(name)])
  ) as Record<Name, MeetRealtimeTokenPayload>;
  let snapshot: RoomServiceState = createMeetRoomSnapshot();
  for (const t of Object.values(tokens))
    snapshot.presence[t.userId] = createMeetPresence(
      t,
      new Date(now).toISOString()
    );
  const send = (
    name: Name,
    command: unknown,
    accountAlias: typeof alias | undefined = alias
  ) => {
    const result = applyRoomClassroomTools(
      snapshot,
      tokens[name],
      command,
      now,
      accountAlias
    );
    if (!result) throw new Error('classroom tools declined');
    if (result.status) throw new Error(`status ${result.status}`);
    snapshot = result.state;
    return result.body;
  };
  const sessionId = crypto.randomUUID();
  send('host', {
    action: 'breakouts.create',
    sessionId,
    mode: 'student_pick',
    roomCount: 2,
    durationMinutes: 10,
  });
  // The host assigns people by their real ids; the room keeps those.
  for (const name of ['member', 'guest', 'external'] as const)
    send('host', {
      action: 'breakouts.assign',
      sessionId,
      participantId: ids[name],
      groupId: 1,
    });
  send('host', {
    action: 'breakouts.assign',
    sessionId,
    participantId: ids.other,
    groupId: 2,
  });
  const read = (name: Name, accountAlias?: typeof alias) =>
    send(name, { action: 'breakouts.read' }, accountAlias) as BreakoutsView;
  return { send, read, sessionId, state: () => snapshot };
}

const foreign = (view: BreakoutsView, own: string) => {
  const wire = JSON.stringify(view);
  return ALL.filter((id) => id !== own && wire.includes(id));
};

test('the host and workspace members keep real breakout ids', () => {
  const { read } = fixture();
  const host = read('host', alias);
  expect(host.session?.groups[0]?.memberIds).toEqual([
    ids.member,
    ids.guest,
    ids.external,
  ]);
  expect(host.participants.map(({ id }) => id)).toContain(ids.other);
  const member = read('member', alias);
  expect(member.session?.groups[0]?.memberIds).toContain(ids.guest);
  expect(member.participants.map(({ id }) => id)).toContain(ids.external);
});

test.each(['guest', 'external'] as const)(
  'a %s in a group with a member sees aliases, never real ids',
  (name) => {
    const { read } = fixture();
    const view = read(name, alias);
    expect(view.actorId).toBe(ids[name]);
    expect(foreign(view, ids[name])).toEqual([]);
    const memberAlias = meetRoomAccountAlias(SECRET, ROOM, ids.member);
    const group = view.session?.groups[0];
    // Its own id stays, so its client still finds its group.
    expect(group?.memberIds).toContain(ids[name]);
    expect(group?.memberIds).toContain(memberAlias);
    // The roster names the same alias as the member list.
    expect(view.participants.find(({ id }) => id === memberAlias)?.name).toBe(
      'member'
    );
  }
);

test('a guest still joins another group and the host still moves it', () => {
  const { send, read, sessionId, state } = fixture();
  send('guest', { action: 'breakouts.join', sessionId, groupId: 2 });
  expect(state().breakouts?.groups[1]?.memberIds).toContain(ids.guest);
  const view = read('guest', alias);
  expect(foreign(view, ids.guest)).toEqual([]);
  expect(view.session?.groups[1]?.memberIds).toEqual(
    expect.arrayContaining([
      ids.guest,
      meetRoomAccountAlias(SECRET, ROOM, ids.other),
    ])
  );
  send('host', {
    action: 'breakouts.assign',
    sessionId,
    participantId: ids.guest,
    groupId: 1,
  });
  expect(state().breakouts?.groups[0]?.memberIds).toContain(ids.guest);
});

test('without a secret other ids are left empty for outside viewers', () => {
  const { read } = fixture();
  const view = read(
    'guest',
    createMeetRoomAccountAlias(() => undefined)
  );
  expect(foreign(view, ids.guest)).toEqual([]);
  expect(view.session?.groups[0]?.memberIds).toContain(ids.guest);
});
