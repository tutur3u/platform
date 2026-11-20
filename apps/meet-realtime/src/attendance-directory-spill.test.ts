import assert from 'node:assert/strict';
import { test } from 'bun:test';
import {
  ATTENDANCE_DIRECTORY_OVERFLOW_CAP,
  ATTENDANCE_DIRECTORY_PAGE,
  ATTENDANCE_DIRECTORY_ROOM,
  ATTENDANCE_DIRECTORY_ROOM_CAP,
  ATTENDANCE_SPILL_PREFIX,
  type AttendanceDirectory,
} from '../../../packages/realtime/src/meet';
import { signMeetServiceCredential } from '../../../packages/realtime/src/meet/service-credential';
import { handleAttendanceDirectoryRequest } from './attendance-directory-request';

const secret = 'disposable-directory-secret-0123456789';
const DIRECTORY_KEY = 'attendance-directory';

// Ordered keys with prefix, startAfter and limit, like Durable Object storage.
function storage() {
  const data = new Map<string, unknown>();
  let largestValue = 0;
  return {
    data,
    largestValue: () => largestValue,
    async get<T>(key: string) {
      return data.get(key) as T | undefined;
    },
    async put(key: string, value: unknown) {
      largestValue = Math.max(largestValue, JSON.stringify(value).length);
      data.set(key, structuredClone(value));
    },
    async delete(keys: string[]) {
      assert.ok(keys.length <= 128);
      for (const key of keys) data.delete(key);
    },
    async list(options: {
      prefix: string;
      startAfter?: string;
      limit: number;
    }) {
      const keys = [...data.keys()]
        .filter(
          (key) =>
            key.startsWith(options.prefix) &&
            (!options.startAfter || key > options.startAfter)
        )
        .sort()
        .slice(0, options.limit);
      return new Map(keys.map((key) => [key, data.get(key)]));
    },
  };
}

async function send(store: ReturnType<typeof storage>, body: unknown) {
  const response = await handleAttendanceDirectoryRequest({
    storage: store,
    secret,
    request: new Request('https://meet.internal/attendance-index', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${signMeetServiceCredential(
          {
            aud: 'meet-service',
            purpose: 'attendance-index',
            roomId: ATTENDANCE_DIRECTORY_ROOM,
            exp: Math.floor(Date.now() / 1000) + 60,
          },
          secret
        )}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    }),
  });
  assert.equal(response.status, 200);
  return response.json() as Promise<{
    ok?: boolean;
    roomIds?: string[];
    cursor?: number | string | null;
  }>;
}

async function listAll(
  store: ReturnType<typeof storage>,
  query: Record<string, string> = {}
) {
  const ids: string[] = [];
  let pages = 0;
  for (let cursor: number | string = 0; ; pages += 1) {
    const page = await send(store, { op: 'list', ...query, cursor });
    assert.ok((page.roomIds ?? []).length <= ATTENDANCE_DIRECTORY_PAGE);
    ids.push(...(page.roomIds ?? []));
    if (page.cursor === null || page.cursor === undefined)
      return { ids, pages };
    cursor = page.cursor;
  }
}

const room = (index: number, ws = 'ws-a') =>
  `${ws}:meeting-${String(index).padStart(5, '0')}`;

test('spilled rooms live in their own keys and page past one listing', async () => {
  const store = storage();
  const total =
    ATTENDANCE_DIRECTORY_ROOM_CAP + ATTENDANCE_DIRECTORY_OVERFLOW_CAP + 450;
  for (let index = 0; index < total; index += 1)
    assert.deepEqual(
      await send(store, {
        op: 'remember',
        roomId: room(index, index % 2 ? 'ws-b' : 'ws-a'),
        meetingId: `meeting-${String(index).padStart(5, '0')}`,
        users: ['user-1'],
        guests: [],
      }),
      { ok: true }
    );
  const directory = store.data.get(DIRECTORY_KEY) as AttendanceDirectory;
  assert.equal(directory.spill, undefined);
  const spilled = [...store.data.keys()].filter((key) =>
    key.startsWith(ATTENDANCE_SPILL_PREFIX)
  );
  assert.equal(spilled.length, 450);

  const all = await listAll(store);
  assert.equal(new Set(all.ids).size, total);
  assert.ok(all.pages > 3);

  const onlyB = await listAll(store, { wsId: 'ws-b' });
  assert.ok(onlyB.ids.every((id) => id.startsWith('ws-b:')));
  assert.equal(new Set(onlyB.ids).size, total / 2);

  // The stored directory value does not grow with spilled rooms.
  const withoutSpill = storage();
  for (
    let index = 0;
    index < ATTENDANCE_DIRECTORY_ROOM_CAP + ATTENDANCE_DIRECTORY_OVERFLOW_CAP;
    index += 1
  )
    await send(withoutSpill, {
      op: 'remember',
      roomId: room(index, index % 2 ? 'ws-b' : 'ws-a'),
      meetingId: `meeting-${String(index).padStart(5, '0')}`,
      users: ['user-1'],
      guests: [],
    });
  assert.equal(
    JSON.stringify(store.data.get(DIRECTORY_KEY)).length,
    JSON.stringify(withoutSpill.data.get(DIRECTORY_KEY)).length
  );
});

test('forgetting rooms removes their spilled keys in bounded batches', async () => {
  const store = storage();
  const ids = Array.from({ length: 300 }, (_, index) => room(index));
  for (const id of ids)
    await store.put(`${ATTENDANCE_SPILL_PREFIX}${id}`, true);
  await send(store, { op: 'forget', roomIds: ids.slice(0, 290) });
  const left = [...store.data.keys()].filter((key) =>
    key.startsWith(ATTENDANCE_SPILL_PREFIX)
  );
  assert.equal(left.length, 10);
});

test('ids held in a stored value move into keys a chunk at a time', async () => {
  const store = storage();
  const legacy = Array.from({ length: 300 }, (_, index) => room(index));
  await store.put(DIRECTORY_KEY, { rooms: {}, spill: legacy });
  const before = await listAll(store);
  assert.equal(new Set(before.ids).size, 300);
  const unchanged = await listAll(store);
  assert.deepEqual(unchanged.ids, before.ids);
  assert.deepEqual(
    (store.data.get(DIRECTORY_KEY) as AttendanceDirectory).spill,
    legacy
  );
  for (let request = 0; request < 3; request += 1)
    await send(store, { op: 'forget', roomIds: [] });
  const directory = store.data.get(DIRECTORY_KEY) as AttendanceDirectory;
  assert.equal(directory.spill, undefined);
  const after = await listAll(store);
  assert.deepEqual(new Set(after.ids), new Set(legacy));
});
