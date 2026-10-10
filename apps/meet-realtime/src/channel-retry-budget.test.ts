import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Y } from '../../../packages/realtime/src/collaboration';
import { ChannelRoomDurableObject } from './channel-room-do';

function fixture() {
  let now = 1_900_000_000_000;
  const values = new Map<string, any>([
    [
      'metadata',
      {
        topic: 'meeting-document-fixture',
        ownerId: 'owner',
        documentId: 'document',
        checkpointAt: 0,
        version: 0,
      },
    ],
  ]);
  const doc = new Y.Doc();
  doc.getText('content').insert(0, 'retained draft');
  values.set('document', Y.encodeStateAsUpdate(doc));
  doc.destroy();
  const counts = {
    reads: 0,
    reservations: 0,
    completions: 0,
    provider: 0,
    alarms: 0,
  };
  let failReservation = false;
  let failCompletion = false;
  let succeeds = false;
  let delay = 0;
  const sockets: any[] = [];
  const storage = {
    async get(key: string) {
      counts.reads++;
      return structuredClone(values.get(key));
    },
    async put(key: string | Record<string, unknown>, value?: unknown) {
      if (typeof key === 'string') {
        counts.reservations++;
        if (failReservation) throw new Error('reservation failed');
        values.set(key, structuredClone(value));
      } else {
        counts.completions++;
        if (failCompletion) throw new Error('completion failed');
        for (const [name, entry] of Object.entries(key))
          values.set(name, structuredClone(entry));
      }
    },
    async getAlarm() {
      return null;
    },
    async setAlarm(at: number) {
      assert.ok(at > now);
      counts.alarms++;
    },
  };
  const pending: Promise<unknown>[] = [];
  const state = {
    storage,
    acceptWebSocket: (socket: any) => sockets.push(socket),
    waitUntil: (promise: Promise<unknown>) => pending.push(promise),
    getWebSockets: () => sockets,
    blockConcurrencyWhile: (run: () => Promise<void>) => run(),
  };
  const nativeNow = Date.now;
  const nativeFetch = globalThis.fetch;
  Date.now = () => now;
  globalThis.fetch = (async () => {
    counts.provider++;
    now += delay;
    return new Response(null, { status: succeeds ? 200 : 503 });
  }) as typeof fetch;
  return {
    async rejoin(room: ChannelRoomDurableObject, role: string) {
      const nativePair = (globalThis as any).WebSocketPair;
      const NativeResponse = globalThis.Response;
      (globalThis as any).WebSocketPair = class {
        0 = {};
        1 = {
          attachment: null as any,
          serializeAttachment(value: unknown) {
            this.attachment = value;
          },
          deserializeAttachment() {
            return this.attachment;
          },
          send() {},
          close() {},
        };
      };
      globalThis.Response = class extends NativeResponse {
        constructor(body: BodyInit | null, init: ResponseInit) {
          super(body, {
            ...init,
            status: init.status === 101 ? 200 : init.status,
          });
        }
      } as typeof Response;
      try {
        await room.fetch(
          new Request('https://fixture.invalid', {
            headers: {
              Upgrade: 'websocket',
              'x-channel-ticket': JSON.stringify({
                kind: 'join',
                topic: 'meeting-document-fixture',
                userId: 'owner',
                ownerId: 'owner',
                documentId: 'document',
                role,
                exp: Math.floor(now / 1000) + 300,
              }),
            },
          })
        );
        await Promise.all(pending.splice(0));
      } finally {
        (globalThis as any).WebSocketPair = nativePair;
        globalThis.Response = NativeResponse;
      }
    },
    counts,
    values,
    sockets,
    room: () =>
      new ChannelRoomDurableObject(
        state as never,
        { MEET_REALTIME_TOKEN_SECRET: 'disposable-fixture-secret' } as never
      ),
    advance: (ms: number) => {
      now += ms;
    },
    reservationFailure: () => {
      failReservation = true;
    },
    completionFailure: () => {
      failCompletion = true;
    },
    succeed: () => {
      succeeds = true;
    },
    delay: (ms: number) => {
      delay = ms;
    },
    socket: (role: string, expired = false) => ({
      deserializeAttachment: () => ({
        ticket: {
          userId: 'owner',
          role,
          exp: Math.floor(now / 1000) + (expired ? -1 : 300),
        },
      }),
      send() {},
      close() {},
    }),
    close: () => {
      Date.now = nativeNow;
      globalThis.fetch = nativeFetch;
    },
  };
}

test('offline attempts survive restarts and terminal duplicates perform no additional storage or provider work', async () => {
  const f = fixture();
  try {
    for (let i = 0; i < 3; i++) {
      await f.room().alarm();
      f.advance(40_000);
    }
    assert.equal(f.counts.provider, 3);
    assert.equal(f.counts.reservations, 3);
    assert.equal(f.counts.completions, 3);
    assert.equal(f.counts.alarms, 2);
    const terminal = f.room();
    await terminal.alarm();
    const before = { ...f.counts };
    for (let i = 0; i < 100; i++) await terminal.alarm();
    assert.deepEqual(f.counts, before);
    assert.equal(f.values.get('metadata').checkpointRetry.attempts, 3);
    assert.ok(f.values.has('document'));
  } finally {
    f.close();
  }
});

test('failed reservations perform zero provider work even after repeated restarts', async () => {
  const f = fixture();
  try {
    f.reservationFailure();
    for (let i = 0; i < 8; i++)
      await assert.rejects(f.room().alarm(), /reservation failed/);
    assert.equal(f.counts.provider, 0);
    assert.equal(f.counts.reservations, 8);
    assert.equal(f.counts.completions, 0);
    assert.equal(f.counts.alarms, 0);
  } finally {
    f.close();
  }
});

test('post-provider write failures cannot replenish durable reservations', async () => {
  const f = fixture();
  try {
    f.completionFailure();
    for (let i = 0; i < 3; i++) {
      await assert.rejects(f.room().alarm(), /completion failed/);
      f.advance(40_000);
    }
    for (let i = 0; i < 8; i++) await f.room().alarm();
    assert.equal(f.counts.provider, 3);
    assert.equal(f.counts.reservations, 3);
    assert.equal(f.counts.completions, 3);
    assert.equal(f.values.get('metadata').checkpointRetry.attempts, 3);
  } finally {
    f.close();
  }
});

test('duplicate concurrent alarms share a reservation and respect its future deadline', async () => {
  const f = fixture();
  try {
    const room = f.room();
    await Promise.all([room.alarm(), room.alarm(), room.alarm()]);
    await f.room().alarm();
    assert.equal(f.counts.provider, 1);
    assert.equal(f.counts.reservations, 1);
    f.advance(29_999);
    await f.room().alarm();
    assert.equal(f.counts.provider, 1);
    f.advance(1);
    await f.room().alarm();
    assert.equal(f.counts.provider, 2);
  } finally {
    f.close();
  }
});

test('job age expires at the exact boundary and slow downstream work cannot reschedule it', async () => {
  for (const slow of [false, true]) {
    const f = fixture();
    try {
      if (slow) f.delay(120_000);
      await f.room().alarm();
      if (!slow) f.advance(120_000);
      const alarms = f.counts.alarms;
      await f.room().alarm();
      assert.equal(f.counts.provider, 1);
      assert.equal(f.counts.alarms, alarms);
      if (slow) assert.equal(alarms, 0);
    } finally {
      f.close();
    }
  }
});

test('viewers and expired editors cannot turn offline retries into a recurring lease', async () => {
  for (const role of ['viewer', 'expired-editor']) {
    const f = fixture();
    try {
      f.sockets.push(
        f.socket(role === 'viewer' ? 'viewer' : 'editor', role !== 'viewer')
      );
      for (let i = 0; i < 3; i++) {
        await f.room().alarm();
        f.advance(40_000);
      }
      assert.equal(f.counts.provider, 3);
      await f.room().alarm();
      assert.equal(f.counts.provider, 3);
    } finally {
      f.close();
    }
  }
});

test('confirmed success clears budget and unchanged content spends no extra provider call', async () => {
  const f = fixture();
  try {
    f.succeed();
    await f.room().alarm();
    assert.equal(f.values.get('metadata').checkpointRetry, undefined);
    f.advance(40_000);
    await f.room().alarm();
    assert.equal(f.counts.provider, 1);
  } finally {
    f.close();
  }
});

test('viewer rejoin cannot recover a stopped job; authorized editor rejoin can save it', async () => {
  const f = fixture();
  try {
    for (let i = 0; i < 3; i++) {
      await f.room().alarm();
      f.advance(40_000);
    }
    const viewerRoom = f.room();
    await f.rejoin(viewerRoom, 'viewer');
    await viewerRoom.alarm();
    assert.equal(f.counts.provider, 3);
    assert.equal(f.values.get('metadata').checkpointRetry.attempts, 3);
    const editorRoom = f.room();
    await f.rejoin(editorRoom, 'editor');
    f.succeed();
    await editorRoom.alarm();
    assert.equal(f.counts.provider, 4);
    assert.equal(f.values.get('metadata').checkpointRetry, undefined);
    const doc = new Y.Doc();
    Y.applyUpdate(doc, f.values.get('document'));
    assert.equal(doc.getText('content').toString(), 'retained draft');
    doc.destroy();
  } finally {
    f.close();
  }
});

test('successful provider response followed by failed completion still retains a finite job', async () => {
  const f = fixture();
  try {
    const retained = Array.from(f.values.get('document'));
    f.succeed();
    f.completionFailure();
    for (let i = 0; i < 3; i++) {
      await assert.rejects(f.room().alarm(), /completion failed/);
      f.advance(40_000);
    }
    await f.room().alarm();
    assert.equal(f.counts.provider, 3);
    assert.equal(f.values.get('metadata').checkpointRetry.attempts, 3);
    assert.deepEqual(Array.from(f.values.get('document')), retained);
  } finally {
    f.close();
  }
});
