import { afterEach, test } from 'bun:test';
import assert from 'node:assert/strict';
import {
  getMeetRealtimeScopesForRole,
  type MeetRealtimeServerMessage,
  meetRealtimeTokenPayloadSchema,
} from '../../../packages/realtime/src/meet';
import { signMeetRealtimeToken } from '../../../packages/realtime/src/meet/token';
import { meetRoomRequest } from './meet-room-worker';
import {
  getRoom,
  type MeetWebSocket,
  rooms,
  sendToManagers,
  sendToUser,
} from './room-state';

const ROOM = 'room-local-delivery';
const COHOST = [...getMeetRealtimeScopesForRole('speaker'), 'class:cohost'];
const frame = (value: unknown) => value as MeetRealtimeServerMessage;

/** A connected local socket that records the types of the frames it gets. */
function connect(role: 'host' | 'speaker', scopes: readonly string[]) {
  const token = meetRealtimeTokenPayloadSchema.parse({
    roomId: ROOM,
    wsId: crypto.randomUUID(),
    meetingId: crypto.randomUUID(),
    userId: crypto.randomUUID(),
    role,
    scopes,
    exp: 2_000_000_000,
  });
  const frames: string[] = [];
  const socket = {
    data: { token },
    readyState: 1,
    send: (wire: string) => void frames.push(JSON.parse(wire).type),
  } as unknown as MeetWebSocket;
  getRoom(ROOM).clients.add(socket);
  return { frames, userId: token.userId };
}

afterEach(() => void rooms.delete(ROOM));

test('the Meet Worker forwards a Unicode display name as ASCII JSON', async () => {
  const secret = 'meet-worker-test-secret';
  const token = meetRealtimeTokenPayloadSchema.parse({
    roomId: ROOM,
    wsId: crypto.randomUUID(),
    meetingId: crypto.randomUUID(),
    userId: crypto.randomUUID(),
    role: 'host',
    scopes: getMeetRealtimeScopesForRole('host'),
    displayName: 'Nguyễn \u{1f600}',
    exp: Math.floor(Date.now() / 1000) + 60,
  });
  const url = new URL('https://meet.example.invalid/realtime');
  url.searchParams.set('token', signMeetRealtimeToken(token, secret));
  const request = new Request(url, { headers: { Upgrade: 'websocket' } });
  const response = await meetRoomRequest(request, url, {
    MEET_REALTIME_TOKEN_SECRET: secret,
    MEET_ROOM: {
      idFromName: (name: string) => name,
      get: (id: string) => ({
        fetch: async (forwarded: Request) => {
          assert.equal(id, token.roomId);
          const header = forwarded.headers.get('x-meet-token');
          assert.ok(header);
          assert.match(header, /^[\x20-\x7e]+$/);
          assert.deepEqual(JSON.parse(header), token);
          return new Response(null, { status: 204 });
        },
      }),
    } as unknown as DurableObjectNamespace,
  });
  assert.equal(response.status, 204);
});

test('the local transport sends private activity frames only to people admitted right now', () => {
  const host = connect('host', getMeetRealtimeScopesForRole('host'));
  const cohost = connect('speaker', COHOST);
  const guest = connect('speaker', getMeetRealtimeScopesForRole('speaker'));
  // Connected with the co-host scope, but still in the waiting room.
  const waiting = connect('speaker', COHOST);
  const { snapshot } = getRoom(ROOM);
  const presence = snapshot.presence as Record<string, unknown>;
  for (const person of [host, cohost, guest])
    presence[person.userId] = { userId: person.userId };
  (snapshot.waiting as Record<string, unknown>)[waiting.userId] = {
    userId: waiting.userId,
  };

  const view = frame({ type: 'activity.host', host: { answer: 'Private' } });
  const notice = frame({ type: 'room.title.changed', title: 'Managers' });
  sendToManagers(ROOM, [view, notice]);
  assert.deepEqual(host.frames, ['activity.host', 'room.title.changed']);
  // A workspace co-host gets the activity view and no other manager notice.
  assert.deepEqual(cohost.frames, ['activity.host']);
  assert.deepEqual(guest.frames, []);
  // Someone waiting gets nothing, whatever scopes their token carries.
  assert.deepEqual(waiting.frames, []);
  sendToUser(ROOM, waiting.userId, [frame({ type: 'activity.mine' })]);
  assert.deepEqual(waiting.frames, []);
  sendToUser(ROOM, guest.userId, [frame({ type: 'activity.mine' })]);
  assert.deepEqual(guest.frames, ['activity.mine']);

  // A room that has ended sends no private frame to anyone.
  snapshot.ended = true;
  sendToManagers(ROOM, [view]);
  sendToUser(ROOM, guest.userId, [frame({ type: 'penboard.snapshot' })]);
  assert.deepEqual(host.frames, ['activity.host', 'room.title.changed']);
  assert.deepEqual(guest.frames, ['activity.mine']);
});
