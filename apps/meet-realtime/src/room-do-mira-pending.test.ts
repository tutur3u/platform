import assert from 'node:assert/strict';
import { afterEach, setSystemTime, spyOn, test } from 'bun:test';
import { createMeetRoomSnapshot } from '../../../packages/realtime/src/meet';
import { MIRA_ROOM_NOTICE_VERSION } from '../../../packages/realtime/src/meet/room-mira-acceptance';
import { isCurrentMiraRoomOn } from '../../../packages/realtime/src/meet/room-mira-choices';
import { acceptMira } from '../../../packages/realtime/src/meet/room-mira.fixtures';
import { MIRA_ON_PENDING_TTL_MS } from '../../../packages/realtime/src/meet/room-mira-pending';
import { endMeetRoom } from '../../../packages/realtime/src/meet/room-ending';
import {
  admit,
  alice,
  host,
  env as selfEnv,
  tokenOf,
  transcriptChoice,
} from '../../../packages/realtime/src/meet/room-self-capture.fixtures';
import { MeetRoomDurableObject, type MeetRoomEnv } from './room-do';
import type { RoomServiceState } from './room-service';

Object.assign(globalThis, { WebSocketRequestResponsePair: class {} });
const meetingId = '00000000-0000-4000-8000-000000000002';
afterEach(() => setSystemTime());

function seed() {
  let state: RoomServiceState = createMeetRoomSnapshot();
  for (const id of [host, alice]) state = admit(state, id);
  return acceptMira(state, host, 1, Date.now() - 60_000);
}

function fixture(initial: RoomServiceState) {
  const values = new Map<string, unknown>([['snapshot', initial]]);
  let deadline: number | null = null;
  const socketOf = (id: string) => ({
    readyState: WebSocket.OPEN as number,
    deserializeAttachment: () => ({
      token: { ...tokenOf(id), roomId: 'ws:room' },
    }),
    serializeAttachment: () => undefined,
    send: () => undefined,
    close: () => undefined,
  });
  const sockets = [socketOf(host), socketOf(alice)];
  const state = {
    storage: {
      get: async (key: string) => values.get(key),
      put: async (key: string, value: unknown) => {
        values.set(key, structuredClone(value));
      },
      getAlarm: async () => deadline,
      setAlarm: async (next: number) => {
        deadline = next;
      },
    },
    setWebSocketAutoResponse: () => undefined,
    getWebSockets: () => sockets,
    blockConcurrencyWhile: (run: () => Promise<void>) => run(),
    waitUntil: () => undefined,
  } as unknown as DurableObjectState;
  const room = new MeetRoomDurableObject(state, {
    ...selfEnv,
    MEET_REALTIME_TOKEN_SECRET: 'mira-pending-secret',
  } as MeetRoomEnv);
  const call = async (
    id: string,
    body: object,
    extra: Record<string, unknown> = {}
  ) => {
    const response = await room.fetch(
      new Request('https://meet.test/room-service', {
        method: 'POST',
        headers: {
          'x-meet-token': JSON.stringify({
            ...tokenOf(id),
            roomId: 'ws:room',
            ...extra,
          }),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      })
    );
    return {
      status: response.status,
      body: (await response.json()) as Record<string, unknown>,
    };
  };
  return {
    room,
    call,
    sockets,
    snapshot: () => values.get('snapshot') as RoomServiceState,
    deadline: () => deadline,
  };
}

const choice = (value: 'on' | 'off') => ({
  action: 'mira.room.choice',
  choice: value,
  version: MIRA_ROOM_NOTICE_VERSION,
  acceptanceRevision: 1,
  source: 'confirm',
});
const confirm = (pendingId: unknown, extra: object = {}) => ({
  action: 'mira.room.confirm',
  pendingId,
  ...extra,
});
const isOn = (snapshot: RoomServiceState) =>
  isCurrentMiraRoomOn(snapshot, meetingId, alice);

test('account-based room activation leaves a transcript decline intact', async () => {
  const f = fixture(seed());
  const declined = await f.call(alice, transcriptChoice('decline'));
  assert.equal(declined.status, 200);
  const staged = await f.call(alice, {
    ...choice('on'),
    accountConfirmed: true,
  });
  assert.equal(staged.status, 200);
  const finished = await f.call(
    alice,
    confirm(staged.body.pendingId, { allowUndecidedTranscript: true })
  );
  assert.equal(finished.status, 200);
  assert.equal(isOn(f.snapshot()), true);
  assert.equal(
    f.snapshot().transcriptConsent?.choices[alice]?.choice,
    'decline'
  );
});

test('ending an incompatible acceptance leaves another revision intact', async () => {
  const f = fixture(seed());
  const ended = await f.call(host, {
    action: 'mira.room.end',
    reason: 'turned_off',
    expectedRevision: 2,
  });
  assert.equal(ended.status, 200);
  assert.equal(ended.body.endedRevision, null);
  assert.equal(f.snapshot().miraRoom?.acceptance?.revision, 1);
});

test('a staged on has no consent effect until the server confirms it', async () => {
  const f = fixture(seed());
  const staged = await f.call(alice, choice('on'));
  assert.equal(staged.status, 200);
  const { pendingId, pendingUntil } = staged.body;
  assert.match(String(pendingId), /^[0-9a-f-]{36}$/);
  assert.ok(
    Number(pendingUntil) - Date.now() <= MIRA_ON_PENDING_TTL_MS &&
      Number(pendingUntil) > Date.now()
  );
  assert.equal(staged.body.pending, true);
  assert.equal(staged.body.choice, null);
  assert.equal(staged.body.ready, false);
  assert.equal(isOn(f.snapshot()), false);
  // A transcript Allow still needs Mira on.
  assert.equal((await f.call(alice, transcriptChoice('allow'))).status, 409);
  const confirmed = await f.call(alice, confirm(pendingId));
  assert.equal(confirmed.status, 200);
  assert.equal(confirmed.body.choice, 'on');
  assert.equal(confirmed.body.pending, false);
  assert.equal(isOn(f.snapshot()), true);
  // A repeated confirm of the same id is idempotent.
  assert.equal((await f.call(alice, confirm(pendingId))).status, 200);
});

test('a confirm counts only for the same room, account and notice mode', async () => {
  const warn = spyOn(console, 'warn').mockImplementation(() => undefined);
  const f = fixture(seed());
  const { pendingId } = (await f.call(alice, choice('on'))).body;
  const refusals = [
    await f.call(host, confirm(pendingId)),
    await f.call(alice, confirm(pendingId), { roomId: 'ws:other' }),
    await f.call(alice, confirm(pendingId, { noticeMode: 'self' })),
    await f.call(alice, confirm(crypto.randomUUID())),
  ];
  for (const refused of refusals) {
    assert.equal(refused.status, 409);
    assert.equal(refused.body.code, 'MIRA_ROOM_PENDING_EXPIRED');
  }
  assert.equal(isOn(f.snapshot()), false);
  assert.ok(
    warn.mock.calls.every(
      ([line, ids]) =>
        line === '[meet-mira] stale pending confirm' &&
        Object.keys(ids as object).join() === 'pendingId'
    )
  );
  // A mode change between the choice and the confirm makes it stale too.
  assert.equal(
    (await f.call(host, { action: 'transcript.mode.set', mode: 'self' }))
      .status,
    200
  );
  assert.equal((await f.call(alice, confirm(pendingId))).status, 409);
  warn.mockRestore();
});

test('an unconfirmed on expires on the alarm and keeps the previous state', async () => {
  const f = fixture(seed());
  assert.equal((await f.call(alice, choice('off'))).status, 200);
  const staged = await f.call(alice, choice('on'));
  const until = Number(staged.body.pendingUntil);
  // The room wakes when the pending on expires.
  assert.ok((f.deadline() ?? Infinity) <= until);
  setSystemTime(new Date(until + 1));
  await f.room.alarm();
  assert.deepEqual(f.snapshot().miraRoom?.pendingOn, {});
  assert.equal(f.snapshot().miraRoom?.choices[alice]?.choice, 'off');
  const late = await f.call(alice, confirm(staged.body.pendingId));
  assert.equal(late.status, 409);
  assert.equal(isOn(f.snapshot()), false);
});

test('an off supersedes a pending on, and a late on after it stays unconfirmed', async () => {
  const f = fixture(seed());
  const first = (await f.call(alice, choice('on'))).body.pendingId;
  assert.equal((await f.call(alice, choice('off'))).status, 200);
  assert.equal(f.snapshot().miraRoom?.pendingOn?.[alice], undefined);
  assert.equal((await f.call(alice, confirm(first))).status, 409);
  // A late on that arrives after the off is only staged; nobody confirms it.
  const late = (await f.call(alice, choice('on'))).body;
  assert.equal(late.pending, true);
  assert.equal(isOn(f.snapshot()), false);
  assert.equal(f.snapshot().miraRoom?.choices[alice]?.choice, 'off');
  // One pending on per account: the newer one replaces the older.
  const newer = (await f.call(alice, choice('on'))).body.pendingId;
  assert.equal((await f.call(alice, confirm(late.pendingId))).status, 409);
  assert.equal((await f.call(alice, confirm(newer))).status, 200);
  assert.equal(isOn(f.snapshot()), true);
});

test('hibernation and restore drop a pending on', async () => {
  const f = fixture(seed());
  const { pendingId } = (await f.call(alice, choice('on'))).body;
  assert.ok(f.snapshot().miraRoom?.pendingOn?.[alice]);
  // A fresh object loads only storage and drops the pending on.
  const g = fixture(structuredClone(f.snapshot()));
  const read = await g.call(alice, { action: 'mira.room.read' });
  assert.equal(read.body.pending, false);
  assert.equal(Object.keys(g.snapshot().miraRoom?.pendingOn ?? {}).length, 0);
  assert.equal((await g.call(alice, confirm(pendingId))).status, 409);
  // A restored room starts without room Mira state at all.
  const ended = endMeetRoom(
    {
      ...structuredClone(f.snapshot()),
      budget: {
        expiresAt: Date.now() + 3_600_000,
        accountedAt: Date.now(),
        participantMilliseconds: 0,
        maxPublishers: 10,
        maxViewers: 10,
      },
      lifecycle: { version: 0, hadConnection: true, ownerAccountId: host },
    },
    new Date().toISOString()
  ) as RoomServiceState;
  const h = fixture(ended);
  const restored = await h.call(host, {
    action: 'room.restore',
    expectedVersion: ended.lifecycle!.version,
  });
  assert.equal(restored.status, 200);
  assert.equal(h.snapshot().miraRoom, undefined);
});

test('a confirm after an acceptance change, room end, leave or expiry changes nothing', async () => {
  const warn = spyOn(console, 'warn').mockImplementation(() => undefined);
  // The acceptance ends between the choice and the confirm.
  const a = fixture(seed());
  const ended = (await a.call(alice, choice('on'))).body.pendingId;
  assert.equal(
    (await a.call(host, { action: 'mira.room.end', reason: 'turned_off' }, {}))
      .status,
    200
  );
  assert.equal((await a.call(alice, confirm(ended))).status, 409);
  // The room ends.
  const b = fixture(seed());
  const roomEnd = (await b.call(alice, choice('on'))).body.pendingId;
  await b.room.webSocketMessage(
    b.sockets[0] as unknown as WebSocket,
    JSON.stringify({ type: 'room.end' })
  );
  assert.equal(b.snapshot().ended, true);
  assert.equal((await b.call(alice, confirm(roomEnd))).status, 409);
  // The person leaves.
  const c = fixture(seed());
  const left = (await c.call(alice, choice('on'))).body.pendingId;
  const leaving = c.sockets[1]!;
  leaving.readyState = WebSocket.CLOSED;
  await c.room.webSocketClose(leaving as unknown as WebSocket, 1000);
  assert.equal(c.snapshot().presence[alice], undefined);
  assert.equal((await c.call(alice, confirm(left))).status, 409);
  // The pending on expires before the confirm arrives.
  const d = fixture(seed());
  const staged = (await d.call(alice, choice('on'))).body;
  setSystemTime(new Date(Number(staged.pendingUntil) + 1));
  assert.equal((await d.call(alice, confirm(staged.pendingId))).status, 409);
  for (const snapshot of [a, b, c, d].map((f) => f.snapshot()))
    assert.equal(isCurrentMiraRoomOn(snapshot, meetingId, alice), false);
  assert.equal(warn.mock.calls.length, 4);
  warn.mockRestore();
});
