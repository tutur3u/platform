import assert from 'node:assert/strict';
import { test } from 'bun:test';
import { signRealtimePayload } from '../../../packages/realtime/src/core/token';
import {
  BOARD_TICKET_AUDIENCE,
  type BoardTicket,
} from '../../../packages/realtime/src/meet/board-sync-schema';
import { whiteboardRequest } from './whiteboard-worker';

const SECRET = 'test-secret-test-secret';
const ticket = (over: Partial<BoardTicket> = {}): BoardTicket => ({
  aud: BOARD_TICKET_AUDIENCE,
  kind: 'join',
  meetingId: crypto.randomUUID(),
  wsId: crypto.randomUUID(),
  boardId: crypto.randomUUID(),
  actorKind: 'member',
  userId: 'u',
  displayName: 'U',
  role: 'edit',
  exp: Math.floor(Date.now() / 1000) + 60,
  ...over,
});
function env() {
  const calls: Request[] = [];
  return {
    calls,
    value: {
      MEET_REALTIME_TOKEN_SECRET: SECRET,
      WHITEBOARD_ROOM: {
        idFromName: (name: string) => name,
        get: () => ({
          fetch: async (request: Request) => {
            calls.push(request);
            return new Response(null, { status: 200 });
          },
        }),
      },
    } as never,
  };
}
const upgrade = (url: string, protocols?: string) =>
  new Request(url, {
    headers: {
      Upgrade: 'websocket',
      ...(protocols ? { 'Sec-WebSocket-Protocol': protocols } : {}),
    },
  });

test('reads the join ticket from the offered subprotocols', async () => {
  const e = env();
  const token = signRealtimePayload(ticket(), SECRET);
  const response = await whiteboardRequest(
    upgrade('https://rt/whiteboard', `tuturuuu.whiteboard, bearer.${token}`),
    e.value
  );
  assert.equal(response.status, 200);
  assert.ok(e.calls[0]!.headers.get('x-board-ticket'));
});

test('ignores a ticket in the URL and refuses a request without the protocol', async () => {
  const e = env();
  const token = signRealtimePayload(ticket(), SECRET);
  const inUrl = await whiteboardRequest(
    upgrade(`https://rt/whiteboard?token=${token}`, 'tuturuuu.whiteboard'),
    e.value
  );
  assert.equal(inUrl.status, 401);
  const bare = await whiteboardRequest(
    upgrade('https://rt/whiteboard', `bearer.${token}`),
    e.value
  );
  assert.equal(bare.status, 400);
  assert.equal(e.calls.length, 0);
});

test('refuses expired, forged and wrong-kind tickets', async () => {
  const e = env();
  const offer = (t: string) => `tuturuuu.whiteboard, bearer.${t}`;
  for (const bad of [
    signRealtimePayload(ticket({ exp: 1 }), SECRET),
    signRealtimePayload(ticket(), 'another-secret-another-secret'),
  ])
    assert.equal(
      (
        await whiteboardRequest(
          upgrade('https://rt/whiteboard', offer(bad)),
          e.value
        )
      ).status,
      401
    );
  const checkpoint = signRealtimePayload(
    ticket({ kind: 'checkpoint' }),
    SECRET
  );
  assert.equal(
    (
      await whiteboardRequest(
        upgrade('https://rt/whiteboard', offer(checkpoint)),
        e.value
      )
    ).status,
    403
  );
  assert.equal(e.calls.length, 0);
});
