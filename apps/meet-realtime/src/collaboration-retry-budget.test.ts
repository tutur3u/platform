import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createProgrammingDocument,
  Y,
} from '../../../packages/realtime/src/collaboration';
import { CollaborationRoomDurableObject } from './collaboration-room-do';

const metadata = {
  ownerId: 'owner',
  resourceId: 'project',
  resource: 'playground',
  roomId: 'room',
  revision: 0,
  checkpointHash: null,
  fileHashes: {},
};
function fixture() {
  const doc = createProgrammingDocument(
    [{ path: 'main.ts', content: 'retained' }],
    'bun main.ts'
  );
  const values = new Map<string, unknown>([
    ['metadata', structuredClone(metadata)],
    ['programming-document', Y.encodeStateAsUpdate(doc)],
  ]);
  doc.destroy();
  const operations = { reads: 0, writes: 0, alarms: 0, provider: 0 };
  let failReservation = false;
  let now = 1_800_000_000_000;
  const storage = {
    get: async (key: string) => {
      operations.reads++;
      return structuredClone(values.get(key));
    },
    put: async (key: string, value: unknown) => {
      operations.writes++;
      if (failReservation && key === 'metadata')
        throw new Error('storage unavailable');
      values.set(key, structuredClone(value));
    },
    setAlarm: async (deadline: number) => {
      assert.ok(deadline > now);
      operations.alarms++;
    },
  };
  const sockets: WebSocket[] = [];
  let connectOnProvider = false;
  let disconnectOnProvider = false;
  let providerDelay = 0;
  const state = {
    storage,
    getWebSockets: () => sockets,
    blockConcurrencyWhile: (run: () => Promise<void>) => run(),
  } as unknown as DurableObjectState;
  const originalNow = Date.now;
  const originalFetch = globalThis.fetch;
  Date.now = () => now;
  let succeeds = false;
  globalThis.fetch = (async () => {
    operations.provider++;
    now += providerDelay;
    if (disconnectOnProvider) sockets.splice(0);
    if (connectOnProvider)
      sockets.push({
        deserializeAttachment: () => ({
          ticket: { exp: Math.floor(now / 1000) + 60 },
        }),
        send: () => {},
        close: () => {},
      } as unknown as WebSocket);
    return succeeds
      ? Response.json({ revision: 1 })
      : new Response(null, { status: 503 });
  }) as typeof fetch;
  return {
    values,
    operations,
    room: () =>
      new CollaborationRoomDurableObject(state, {
        COLLABORATION_ROOM: {} as DurableObjectNamespace,
        MEET_REALTIME_TOKEN_SECRET: 'disposable-fixture-secret',
        PLATFORM_API_BASE_URL: 'https://checkpoint.example.invalid',
      }),
    advance: (ms: number) => {
      now += ms;
    },
    failReservation: () => {
      failReservation = true;
    },
    delayProvider: (ms: number) => {
      providerDelay = ms;
    },
    disconnectOnProvider: () => {
      sockets.push({
        deserializeAttachment: () => ({
          ticket: { exp: Math.floor(now / 1000) + 60 },
        }),
        send: () => {},
        close: () => {},
      } as unknown as WebSocket);
      disconnectOnProvider = true;
    },
    connectOnProvider: () => {
      connectOnProvider = true;
    },
    succeed: () => {
      succeeds = true;
    },
    restore: () => {
      Date.now = originalNow;
      globalThis.fetch = originalFetch;
    },
  };
}
test('offline retries stop after three durable reservations across restarts and duplicates', async () => {
  const f = fixture();
  try {
    for (let attempt = 0; attempt < 3; attempt++) {
      await f.room().alarm();
      f.advance(30_000);
    }
    assert.equal(f.operations.provider, 3);
    assert.equal(f.operations.writes, 6); // one reservation + one document per attempt
    assert.equal(f.operations.alarms, 2);
    const baseline = { ...f.operations };
    const restarted = f.room();
    for (let i = 0; i < 100; i++) await restarted.alarm();
    assert.equal(f.operations.provider, baseline.provider);
    assert.equal(f.operations.writes, baseline.writes);
    assert.equal(f.operations.alarms, baseline.alarms);
    assert.equal(f.operations.reads, baseline.reads + 2);
    assert.ok(f.values.get('programming-document'));
    assert.equal((f.values.get('metadata') as typeof metadata).revision, 0);
  } finally {
    f.restore();
  }
});
test('early duplicate wakes do not spend another provider attempt', async () => {
  const f = fixture();
  try {
    const room = f.room();
    await Promise.all(Array.from({ length: 20 }, () => room.alarm()));
    await room.alarm();
    assert.equal(f.operations.provider, 1);
    assert.equal(f.operations.writes, 2);
    f.advance(29_999);
    await f.room().alarm();
    assert.equal(f.operations.provider, 1);
    f.advance(1);
    await f.room().alarm();
    assert.equal(f.operations.provider, 2);
  } finally {
    f.restore();
  }
});
test('age deadline stops retrying while retaining unsaved state', async () => {
  const f = fixture();
  try {
    await f.room().alarm();
    f.advance(120_000);
    await f.room().alarm();
    assert.equal(f.operations.provider, 1);
    assert.equal(f.operations.writes, 2);
    assert.equal(f.operations.alarms, 1);
  } finally {
    f.restore();
  }
});
test('failed reservation never reaches the provider or writes document state', async () => {
  const f = fixture();
  try {
    f.failReservation();
    await assert.rejects(f.room().alarm(), /storage unavailable/);
    assert.equal(f.operations.provider, 0);
    assert.equal(f.operations.writes, 1);
    assert.equal(f.operations.alarms, 0);
  } finally {
    f.restore();
  }
});
test('an explicit owner checkpoint can recover a stopped document; viewers cannot', async () => {
  const f = fixture();
  try {
    await f.room().alarm();
    f.advance(120_000);
    const room = f.room();
    const request = (role: string) =>
      new Request('https://room.example.invalid', {
        method: 'POST',
        headers: {
          'x-collaboration-ticket': JSON.stringify({
            ...metadata,
            kind: 'checkpoint',
            role,
            exp: Math.floor(Date.now() / 1000) + 60,
          }),
        },
      });
    assert.equal((await room.fetch(request('viewer'))).status, 403);
    assert.equal(f.operations.provider, 1);
    f.succeed();
    assert.equal((await room.fetch(request('owner'))).status, 200);
    assert.equal(f.operations.provider, 2);
    const saved = f.values.get('metadata') as typeof metadata & {
      checkpointRetry?: unknown;
    };
    assert.equal(saved.revision, 1);
    assert.equal(saved.checkpointRetry, undefined);
    await room.alarm();
    assert.equal(f.operations.provider, 2);
  } finally {
    f.restore();
  }
});

test('a join during the last offline attempt retains the live expiry sweep', async () => {
  const f = fixture();
  try {
    const now = Date.now();
    f.values.set('metadata', {
      ...metadata,
      checkpointRetry: { attempts: 2, nextAt: now, expiresAt: now + 120_000 },
    });
    f.connectOnProvider();
    await f.room().alarm();
    assert.equal(f.operations.provider, 1);
    assert.equal(f.operations.alarms, 1);
  } finally {
    f.restore();
  }
});

test('a disconnect during checkpoint I/O starts the finite offline chain', async () => {
  const f = fixture();
  try {
    f.disconnectOnProvider();
    await f.room().alarm();
    assert.equal(f.operations.provider, 1);
    assert.equal(f.operations.alarms, 1);
    f.advance(30_000);
    await f.room().alarm();
    assert.equal(f.operations.provider, 2);
    const saved = f.values.get('metadata') as {
      checkpointRetry: { attempts: number };
    };
    assert.equal(saved.checkpointRetry.attempts, 1);
  } finally {
    f.restore();
  }
});

test('a slow failed provider call never reschedules into the past', async () => {
  const f = fixture();
  try {
    f.delayProvider(31_000);
    await f.room().alarm();
    assert.equal(f.operations.provider, 1);
    assert.equal(f.operations.alarms, 1);
  } finally {
    f.restore();
  }
});
