import { expect, test } from 'vitest';
import {
  admitOrHold,
  createMeetRoomSnapshot,
  meetRealtimeTokenPayloadSchema,
} from './index';
import { MEET_CLASSROOM_TOOLS_SCOPE } from './classroom-tools-schema';
import type { MeetRealtimeTokenPayload } from './primitives';
import { applyRoomClassroomTools } from './room-classroom-tools';
import type { RoomServiceState } from './room-service';

const now = Date.parse('2026-11-20T00:00:00.000Z');
const makeActor = (role: 'host' | 'speaker', name: string) => {
  const id = crypto.randomUUID();
  return meetRealtimeTokenPayloadSchema.parse({
    accountId: id,
    userId: id,
    role,
    displayName: name,
    wsId: crypto.randomUUID(),
    meetingId: crypto.randomUUID(),
    roomId: 'classroom',
    mode: 'call',
    exp: now / 1000 + 60,
    scopes: ['meet:server', MEET_CLASSROOM_TOOLS_SCOPE],
  });
};

function fixture() {
  const host = makeActor('host', 'Host');
  const attendees = ['One', 'Two', 'Three', 'Four', 'Five'].map((name) =>
    makeActor('speaker', name)
  );
  const [one, two] = attendees;
  if (!one || !two) throw new Error('Missing classroom fixtures');
  const secondDevice = { ...one, userId: crypto.randomUUID() };
  let snapshot: RoomServiceState = [host, ...attendees, secondDevice].reduce(
    (state, actor) =>
      admitOrHold(
        state,
        { ...actor, wsId: host.wsId, meetingId: host.meetingId },
        new Date(now).toISOString()
      ).state,
    createMeetRoomSnapshot()
  );
  function send(actor: MeetRealtimeTokenPayload, command: unknown, at = now) {
    const result = applyRoomClassroomTools(snapshot, actor, command, at);
    if (result) snapshot = result.state;
    return result;
  }
  return { host, one, two, secondDevice, send };
}

test('whiteboard shares completed strokes, skips unchanged content, and respects author undo', () => {
  const { host, one, two, secondDevice, send } = fixture();
  const stroke = {
    kind: 'stroke',
    id: crypto.randomUUID(),
    color: 'ink',
    points: [
      [12, 40],
      [32, 64],
    ],
    width: 3,
  };
  const action = { action: 'whiteboard.draw', item: stroke };
  const written = send(one, action);
  expect(written?.status).toBeUndefined();
  expect(send(secondDevice, action)?.state).toBe(written?.state);
  const viewed = send(two, { action: 'whiteboard.read' });
  expect(viewed?.body).toMatchObject({
    items: [stroke],
    canClear: false,
    canUndo: false,
  });
  const revision = viewed?.state.whiteboard?.revision;
  expect(
    send(two, { action: 'whiteboard.read', since: revision })?.body
  ).not.toHaveProperty('items');
  expect(send(two, { action: 'whiteboard.undo' })?.state).toBe(written?.state);
  expect(send(two, { action: 'whiteboard.clear' })?.status).toBe(403);
  expect(
    send(secondDevice, { action: 'whiteboard.undo' })?.state.whiteboard?.items
  ).toEqual([]);
  expect(
    send(two, { action: 'whiteboard.read', since: revision })?.body
  ).toMatchObject({ items: [] });
  send(two, action);
  expect(
    send(host, { action: 'whiteboard.clear' })?.state.whiteboard?.items
  ).toEqual([]);
});

test('whiteboard enforces author capacity while breakout controls remain available', () => {
  const { host, one, send } = fixture();
  for (let index = 0; index < 32; index++) {
    expect(
      send(one, {
        action: 'whiteboard.draw',
        item: {
          kind: 'shape',
          id: crypto.randomUUID(),
          color: 'green',
          x: 200,
          y: 100,
        },
      })?.status
    ).toBeUndefined();
  }
  expect(
    send(one, {
      action: 'whiteboard.draw',
      item: {
        kind: 'shape',
        id: crypto.randomUUID(),
        color: 'green',
        x: 200,
        y: 100,
      },
    })?.status
  ).toBe(409);
  expect(
    send(host, {
      action: 'breakouts.create',
      sessionId: crypto.randomUUID(),
      mode: 'manual',
      roomCount: 2,
      durationMinutes: 10,
    })?.state.breakouts?.groups
  ).toHaveLength(2);
});

test('automatic groups balance admitted accounts and deduplicate devices', () => {
  const { host, one, two, send } = fixture();
  const sessionId = crypto.randomUUID();
  const create = {
    action: 'breakouts.create',
    sessionId,
    mode: 'auto',
    roomCount: 2,
    durationMinutes: 10,
  };
  expect(send(one, create)?.status).toBe(403);
  const result = send(host, create);
  const room = result?.state.breakouts;
  expect(room?.groups.map(({ memberIds }) => memberIds.length)).toEqual([3, 2]);
  expect(room?.groups.flatMap(({ memberIds }) => memberIds)).toHaveLength(5);
  expect(
    send(one, { action: 'breakouts.join', sessionId, groupId: 2 })?.status
  ).toBe(403);
  expect(
    send(two, {
      action: 'breakouts.help',
      sessionId,
      groupId: 1,
      requested: true,
    })?.status
  ).toBe(403);
  expect(
    send(one, {
      action: 'breakouts.help',
      sessionId,
      groupId: 1,
      requested: true,
    })?.state.breakouts?.groups[0]?.needsHelp
  ).toBe(true);
  expect(
    send(host, {
      action: 'breakouts.assign',
      sessionId,
      participantId: one.userId,
      groupId: 2,
    })?.state.breakouts?.groups.map(({ memberIds }) =>
      memberIds.includes(one.userId)
    )
  ).toEqual([false, true]);
});

test('self-selection, host broadcasts, expiry, and stale session fencing', () => {
  const { host, one, two, send } = fixture();
  const sessionId = crypto.randomUUID();
  const create = {
    action: 'breakouts.create',
    sessionId,
    mode: 'student_pick',
    roomCount: 2,
    durationMinutes: 1,
  };
  send(host, create);
  const join = { action: 'breakouts.join', sessionId, groupId: 1 };
  expect(send(one, join)?.state.breakouts?.groups[0]?.memberIds).toEqual([
    one.userId,
  ]);
  expect(send(two, { action: 'breakouts.read' })?.body).toMatchObject({
    session: { groups: [{ memberIds: [] }, { memberIds: [] }] },
  });
  const broadcast = {
    action: 'breakouts.broadcast',
    sessionId,
    message: 'Two minutes left',
  };
  expect(send(one, broadcast)?.status).toBe(403);
  send(host, broadcast);
  expect(send(two, { action: 'breakouts.read' })?.body).toMatchObject({
    session: { broadcast: broadcast.message },
  });
  expect(
    send(host, { action: 'breakouts.extend', sessionId })?.state.breakouts
      ?.endsAt
  ).toBe(now + 360_000);
  expect(send(one, join, now + 360_000)?.status).toBe(409);
  const renewed = crypto.randomUUID();
  send(host, { ...create, sessionId: renewed }, now + 360_001);
  expect(send(one, join, now + 360_002)?.status).toBe(409);
  expect(
    send(host, { action: 'breakouts.close', sessionId: renewed }, now + 360_002)
      ?.state.breakouts
  ).toBeUndefined();
});

test('an ordinary server credential, a browser credential, and an unadmitted actor cannot use classroom tools', () => {
  const { host, send } = fixture();
  const command = { action: 'whiteboard.read' };
  expect(send({ ...host, scopes: ['meet:server'] }, command)).toBeNull();
  expect(
    send({ ...host, scopes: [MEET_CLASSROOM_TOOLS_SCOPE] }, command)
  ).toBeNull();
  expect(send(makeActor('speaker', 'Outside'), command)?.status).toBe(403);
});
