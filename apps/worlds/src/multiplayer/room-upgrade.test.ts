import assert from 'node:assert/strict';
import { test } from 'bun:test';
import { createAppSessionToken } from '@tuturuuu/auth/app-session-core';
import { WORLDS_SESSION_COOKIE } from '../session/session.ts';
import { verifyRoomAdmission } from './admission.ts';
import {
  handleRoomUpgrade,
  MAX_SHARD_ATTEMPTS,
  ROOM_SOCKET_PATH,
} from './room-upgrade.ts';

const origin = 'https://worlds.example.test';
const sessionSecret = 'synthetic-worlds-session-fixture-key';
const roomSecret = 'synthetic-worlds-room-fixture-key-32-bytes';
const now = Date.now();
const clock = () => now;
const session = (targetApp = 'worlds', at = now) =>
  createAppSessionToken(
    { targetApp, userId: 'actor-1', expiresInSeconds: 120 },
    { secret: sessionSecret, now: new Date(at) }
  ).token;

function request(
  token?: string,
  headers = {},
  url = origin + ROOM_SOCKET_PATH
) {
  return new Request(url, {
    headers: {
      origin,
      upgrade: 'websocket',
      ...(token && { cookie: `${WORLDS_SESSION_COOKIE}=${token}` }),
      ...headers,
    },
  });
}

function fixture(statuses: number[] = []) {
  const calls: { name: string; request: Request }[] = [];
  return {
    calls,
    env: {
      WORLDS_VIEWER_ORIGIN: origin,
      TUTURUUU_APP_COORDINATION_SECRET: sessionSecret,
      WORLDS_ROOM_ADMISSION_SECRET: roomSecret,
      WORLDS_ROOMS: {
        idFromName: (name: string) => name,
        get: (id: object | string) => ({
          fetch: async (request: Request) => {
            calls.push({ name: String(id), request });
            return new Response('internal room details', {
              status: statuses.shift() ?? 429,
              headers: { authorization: 'internal' },
            });
          },
        }),
      },
    },
  };
}

test('rejects missing, foreign, and lookalike origins before touching a room', async () => {
  const { env, calls } = fixture();
  for (const value of [
    '',
    'null',
    origin + '.invalid',
    origin + ':8443',
    origin + '/',
  ]) {
    assert.equal(
      (
        await handleRoomUpgrade(
          request(session(), { origin: value }),
          env,
          clock
        )
      ).status,
      403
    );
  }
  assert.equal(
    (
      await handleRoomUpgrade(
        request(session(), {}, 'https://other.test' + ROOM_SOCKET_PATH),
        env,
        clock
      )
    ).status,
    403
  );
  assert.equal(calls.length, 0);
});

test('requires a live Worlds cookie and honors the logout fence', async () => {
  const { env, calls } = fixture();
  for (const input of [
    request(),
    request(session('web')),
    request(session('worlds', now - 121_000)),
    request(undefined, { authorization: 'Bearer ' + session() }),
    request(undefined, { cookie: 'tuturuuu_app_session=' + session() }),
    request(undefined, {
      cookie: `${WORLDS_SESSION_COOKIE}=${session()}; ${WORLDS_SESSION_COOKIE}=${session()}`,
    }),
    request(undefined, {
      cookie: `${WORLDS_SESSION_COOKIE}=${session()}; __Host-tuturuuu_app_signed_out=1`,
    }),
    request(undefined, { cookie: `${WORLDS_SESSION_COOKIE}=%` }),
  ]) {
    assert.equal((await handleRoomUpgrade(input, env, clock)).status, 401);
  }
  assert.equal(calls.length, 0);
});

test('overflows only on capacity and forwards a scoped grant without browser credentials', async () => {
  const { env, calls } = fixture([429, 409, 429]);
  const response = await handleRoomUpgrade(
    request(session(), { authorization: 'Bearer untrusted' }),
    env,
    clock
  );
  assert.equal(response.status, 409);
  assert.equal(response.headers.get('authorization'), null);
  assert.equal(await response.text(), '');
  assert.equal(calls.length, 2);

  for (const [shard, call] of calls.entries()) {
    assert.equal(call.name, `worlds:v1:edufest-hall:edufest-hall-v1:${shard}`);
    assert.equal(call.request.headers.get('cookie'), null);
    assert.equal(call.request.headers.get('origin'), null);
    assert.equal(new URL(call.request.url).pathname, '/room');
    const grant = await verifyRoomAdmission(
      call.request.headers.get('authorization')?.slice(7) ?? '',
      roomSecret,
      clock
    );
    assert.ok(grant);
    assert.equal(grant.shard, shard);
    assert.equal(grant.actorId, 'actor-1');
    assert.equal(grant.leaseUntil, Math.floor(now / 1000) + 120);
  }
});

test('caps the number of capacity probes and rejects client-selected shards', async () => {
  const { env, calls } = fixture();
  assert.equal(
    (
      await handleRoomUpgrade(
        request(session(), {}, origin + ROOM_SOCKET_PATH + '?shard=9'),
        env,
        clock
      )
    ).status,
    400
  );
  assert.equal(calls.length, 0);
  assert.equal(
    (await handleRoomUpgrade(request(session()), env, clock)).status,
    429
  );
  assert.equal(calls.length, MAX_SHARD_ATTEMPTS);
});
