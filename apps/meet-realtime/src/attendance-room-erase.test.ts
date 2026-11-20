import assert from 'node:assert/strict';
import { test } from 'bun:test';
import { verifyMeetServiceCredential } from '../../../packages/realtime/src/meet/service-credential';
import { eraseAttendanceRoom } from './attendance-room-erase';

const secret = 'disposable-room-erase-secret-0123456789';
const ws = '11111111-1111-4111-8111-111111111111';
const meeting = '33333333-3333-4333-8333-333333333333';
const user = '44444444-4444-4444-8444-444444444444';
const roomId = `${ws}:${meeting}`;
const nowMs = Date.parse('2026-11-20T03:00:00Z');

function harness(status = (_claims: unknown) => 200) {
  const calls: Array<{ roomId: string; claims: Record<string, unknown> }> = [];
  return {
    calls,
    deps: {
      secret,
      nowMs,
      fetchRoom: async (target: string, request: Request) => {
        const token =
          request.headers.get('Authorization')?.replace(/^Bearer /, '') ?? '';
        const claims = verifyMeetServiceCredential(token, secret, nowMs);
        assert.ok(claims);
        assert.equal(new URL(request.url).pathname, '/class-service');
        calls.push({ roomId: target, claims: claims as never });
        return new Response(null, { status: status(claims) });
      },
    },
  };
}

test('posts one signed erase per claim and returns the accepted keys', async () => {
  const { calls, deps } = harness();
  const result = await eraseAttendanceRoom(
    { roomId, generation: 7, keys: [`user:${user}`, `guest:${user}`] },
    deps
  );
  assert.deepEqual(result.acked, [`user:${user}`, `guest:${user}`]);
  assert.deepEqual(
    calls.map((call) => [
      call.roomId,
      call.claims.purpose,
      call.claims.roomId,
      call.claims.generation,
      call.claims.erase,
      call.claims.userId,
      call.claims.guestId,
    ]),
    [
      [roomId, 'attendance-erase', roomId, 7, 'subject', user, undefined],
      [roomId, 'attendance-erase', roomId, 7, 'subject', undefined, user],
    ]
  );
});

test('a refused or failed room post is not acknowledged', async () => {
  const { deps } = harness((claims) =>
    (claims as { guestId?: string }).guestId ? 503 : 200
  );
  const result = await eraseAttendanceRoom(
    { roomId, generation: 2, keys: [`user:${user}`, `guest:${user}`] },
    deps
  );
  assert.deepEqual(result.acked, [`user:${user}`]);

  const thrown = await eraseAttendanceRoom(
    { roomId, generation: 2, keys: ['meeting'] },
    {
      ...deps,
      fetchRoom: async () => {
        throw new Error('room unavailable');
      },
    }
  );
  assert.deepEqual(thrown.acked, []);
});

test('invalid input erases nothing', async () => {
  const { calls, deps } = harness();
  for (const input of [
    null,
    { roomId: 'workspace:meeting', generation: 1, keys: ['meeting'] },
    { roomId, generation: 0, keys: ['meeting'] },
    { roomId, generation: 1.5, keys: ['meeting'] },
    { roomId, generation: 1, keys: [] },
    { roomId, generation: 1, keys: ['meeting', 'meeting', 'meeting', 'x'] },
  ])
    assert.deepEqual((await eraseAttendanceRoom(input, deps)).acked, []);
  const unknownKeys = await eraseAttendanceRoom(
    { roomId, generation: 1, keys: ['user:not-a-uuid', `admin:${user}`] },
    deps
  );
  assert.deepEqual(unknownKeys.acked, []);
  assert.equal(calls.length, 0);
});
