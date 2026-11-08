import { test } from 'bun:test';
import assert from 'node:assert/strict';
import { Y } from '../../../packages/realtime/src/collaboration';
import { REALTIME_SERVICE_USER_AGENT } from '../../../packages/realtime/src/core/service-request';
import { ChannelRoomDurableObject } from './channel-room-do';

/** One quiet room with unsaved edits; the alarm attempts exactly one checkpoint. */
function fixture(status: number) {
  const now = 1_900_000_000_000;
  const values = new Map<string, unknown>([
    [
      'metadata',
      {
        topic: 'meeting-document-fixture',
        ownerId: 'owner',
        documentId: 'document',
        checkpointAt: 0,
        version: 4,
      },
    ],
  ]);
  const doc = new Y.Doc();
  doc.getText('content').insert(0, 'unsaved draft');
  values.set('document', Y.encodeStateAsUpdate(doc));
  doc.destroy();
  const requests: { url: string; init: RequestInit }[] = [];
  const sent: unknown[] = [];
  const socket = {
    deserializeAttachment: () => ({
      ticket: { userId: 'owner', role: 'editor', exp: now / 1000 + 300 },
    }),
    send: (message: string) => sent.push(JSON.parse(message)),
    close() {},
  };
  const state = {
    storage: {
      async get(key: string) {
        return structuredClone(values.get(key));
      },
      async put(key: string | Record<string, unknown>, value?: unknown) {
        if (typeof key === 'string') values.set(key, structuredClone(value));
        else
          for (const [name, entry] of Object.entries(key))
            values.set(name, structuredClone(entry));
      },
      async getAlarm() {
        return null;
      },
      async setAlarm() {},
    },
    getWebSockets: () => [socket],
    waitUntil() {},
    blockConcurrencyWhile: (run: () => Promise<void>) => run(),
  };
  const nativeNow = Date.now;
  const nativeFetch = globalThis.fetch;
  Date.now = () => now;
  globalThis.fetch = (async (url: URL | string, init: RequestInit) => {
    requests.push({ url: String(url), init });
    return new Response(null, { status });
  }) as typeof fetch;
  return {
    requests,
    sent,
    metadata: () => values.get('metadata') as { checkpointStatus?: string },
    room: () =>
      new ChannelRoomDurableObject(
        state as never,
        {
          MEET_REALTIME_TOKEN_SECRET: 'disposable-fixture-secret',
          PLATFORM_API_BASE_URL: 'https://platform.invalid',
        } as never
      ),
    close() {
      Date.now = nativeNow;
      globalThis.fetch = nativeFetch;
    },
  };
}

test('checkpoint requests identify the service so the API proxy does not reject them as anonymous scanners', async () => {
  const f = fixture(200);
  try {
    await f.room().alarm();
    assert.equal(f.requests.length, 1);
    const [{ url, init }] = f.requests;
    assert.equal(
      url,
      'https://platform.invalid/api/v1/realtime/documents/checkpoint'
    );
    const headers = new Headers(init.headers);
    assert.equal(headers.get('user-agent'), REALTIME_SERVICE_USER_AGENT);
    assert.match(headers.get('authorization') ?? '', /^Bearer \S+\.\S+$/);
    assert.equal(headers.get('content-type'), 'application/json');
    assert.equal(f.metadata().checkpointStatus, 'saved');
    assert.deepEqual(
      f.sent.filter((m: any) => m.event === 'document-checkpoint').at(-1),
      {
        type: 'broadcast',
        event: 'document-checkpoint',
        payload: { status: 'saved', version: 4 },
      }
    );
  } finally {
    f.close();
  }
});

test('a rejected checkpoint reports deferred and a 409 reports conflict', async () => {
  for (const [status, expected] of [
    [400, 'deferred'],
    [503, 'deferred'],
    [409, 'conflict'],
  ] as const) {
    const f = fixture(status);
    try {
      await f.room().alarm();
      assert.equal(f.requests.length, 1, `status ${status}`);
      assert.equal(f.metadata().checkpointStatus, expected, `status ${status}`);
    } finally {
      f.close();
    }
  }
});
