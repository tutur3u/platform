import { expect, it, vi } from 'vitest';
import { miraShareContextKey } from './room-mira-share';
import {
  MiraShareStorage,
  readSharedTutorChat,
} from './room-mira-share-storage';
import type { RoomServiceState } from './room-service';

const account = '00000000-0000-4000-8000-000000000001';
const meetingId = '00000000-0000-4000-8000-000000000002';
const sessionId = '00000000-0000-4000-8000-000000000004';
const key = miraShareContextKey(account);
const tutor = [{ assistant: true, body: 'Plants turn light into sugar.' }];
const now = Date.now();
const grant = {
  enabled: true,
  revision: 3,
  choiceRevision: 1,
  meetingId,
  updatedAt: now - 2000,
  context: { updatedAt: now - 1000, bytes: 100 },
};
const state = {
  presence: {},
  miraPrivate: {
    choices: {
      [account]: {
        choice: 'continue',
        version: '2026-11-13-private-v1',
        meetingId,
        accountId: account,
        recordedAt: 1,
        revision: 1,
      },
    },
    sessions: { [account]: [sessionId] },
  },
  miraShares: { [account]: grant },
} as unknown as RoomServiceState;
const token = {
  userId: account,
  accountId: account,
  meetingId,
  role: 'speaker',
  scopes: ['meet:server', 'meet:live-server', 'meet:private-mira'],
} as unknown as Parameters<typeof readSharedTutorChat>[2];
const read = { action: 'mira.share.private.read', sessionId };

function store(values: Record<string, unknown>) {
  const map = new Map(Object.entries(values));
  return {
    map,
    get: async <T>(name: string) => map.get(name) as T | undefined,
    put: vi.fn(async (name: string, value: unknown) => map.set(name, value)),
    delete: vi.fn(async (names: string[]) => {
      for (const name of names) map.delete(name);
    }),
  };
}

it('serves stored text only for the grant revision and share time', async () => {
  const current = { tutor, updatedAt: now - 1000, revision: 3 };
  for (const [text, expected] of [
    [current, tutor],
    [{ ...current, revision: 2 }, []],
    [{ ...current, updatedAt: now - 5000 }, []],
  ] as const) {
    const storage = store({ [key]: text });
    const result = await readSharedTutorChat(storage, state, token, read, now);
    expect(result?.body).toEqual({
      tutor: expected,
      sharedAt: grant.updatedAt,
    });
  }
});

it('deletes a stored key once the snapshot stops referencing it', () => {
  const storage = store({ [key]: { tutor, updatedAt: now, revision: 3 } });
  const shares = new MiraShareStorage(() => storage);
  shares.seed(state);
  const revoked = {
    ...state,
    miraShares: { [account]: { ...grant, enabled: false, context: undefined } },
  } as RoomServiceState;
  shares.flush(revoked);
  expect(storage.delete).toHaveBeenCalledWith([key]);
  expect(storage.map.has(key)).toBe(false);
});

it('writes queued text only while the snapshot still references it', () => {
  const storage = store({});
  const pending = { tutor, updatedAt: now - 1000, revision: 3 };
  const shares = new MiraShareStorage(() => storage);
  const flushed = shares.flush({
    ...state,
    miraSharePending: { [account]: pending },
  });
  expect(flushed.miraSharePending).toBeUndefined();
  expect(storage.put).toHaveBeenCalledWith(key, pending);
  storage.put.mockClear();
  shares.flush({
    ...state,
    miraShares: {},
    miraSharePending: { [account]: pending },
  } as RoomServiceState);
  expect(storage.put).not.toHaveBeenCalled();
  expect(storage.delete).toHaveBeenCalledWith([key]);
});
