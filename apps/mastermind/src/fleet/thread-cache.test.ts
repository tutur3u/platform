import type { FleetThreadPage } from '@tuturuuu/internal-api/mastermind-threads';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import {
  createThreadCache,
  THREAD_CACHE_LIMITS,
  type ThreadCacheStorage,
  threadListKey,
} from './thread-cache';

/** What IndexedDB keeps: values as given, including key objects. */
function memoryStorage() {
  const records = new Map<string, unknown>();
  const storage: ThreadCacheStorage = {
    get: async (id) => records.get(id),
    set: async (id, value) => void records.set(id, value),
    delete: async (id) => void records.delete(id),
  };
  return { records, storage };
}

const page = (title: string, threads = 1): FleetThreadPage => ({
  machineId: 'skr-m4',
  threads: Array.from({ length: threads }, (_, n) => ({
    threadId: `thread:${n}`,
    title,
    projectId: 'p1',
    project: 'Platform',
    state: 'waiting' as const,
    updatedAt: '2026-11-21T05:00:00.000Z',
    itemCount: 12,
    seenItemCount: 10,
  })),
  nextCursor: 50,
  total: 76,
});

const LIST = threadListKey({ machineId: 'skr-m4' });
const sealedOf = (records: Map<string, unknown>) =>
  [...records].find(([id]) => id.startsWith('lists:'))![1] as {
    iv: Uint8Array;
    data: ArrayBuffer;
  };

describe('thread list cache', () => {
  it('names a list by machine, environment, project and state', () => {
    expect(LIST).toBe('skr-m4|||');
    expect(
      threadListKey({
        machineId: 'skr-m4',
        environmentId: 'env-2',
        projectId: 'p1',
        state: 'failed',
      })
    ).toBe('skr-m4|env-2|p1|failed');
  });

  it('returns the list as it was saved, with when', async () => {
    const { storage } = memoryStorage();
    let now = new Date('2026-11-21T05:00:00.000Z');
    const cache = createThreadCache('owner-a', { storage, now: () => now });
    expect(await cache.read(LIST)).toBeNull();
    expect(await cache.write(LIST, page('Rotate the signing value'))).toBe(
      true
    );
    now = new Date('2026-11-21T08:00:00.000Z');
    // A new page load: a fresh cache object over the same storage.
    const later = createThreadCache('owner-a', { storage, now: () => now });
    expect(await later.read(LIST)).toEqual({
      page: page('Rotate the signing value'),
      savedAt: '2026-11-21T05:00:00.000Z',
    });
    expect(await later.read('skr-m4|||failed')).toBeNull();
  });

  it('stores ciphertext and a key that cannot be read back', async () => {
    const { records, storage } = memoryStorage();
    const cache = createThreadCache('owner-a@example.com', { storage });
    await cache.write(LIST, page('Rotate the signing value'));
    const ids = [...records.keys()].sort();
    expect(ids.map((id) => id.split(':')[0])).toEqual(['key', 'lists']);
    // The owner is stored as a digest only.
    expect(ids.join()).not.toContain('owner-a');
    const key = records.get(ids[0]!) as CryptoKey;
    expect(key.extractable).toBe(false);
    await expect(crypto.subtle.exportKey('raw', key)).rejects.toThrow();
    const stored = new TextDecoder().decode(sealedOf(records).data);
    for (const plain of ['Rotate', 'thread:0', 'Platform', 'skr-m4'])
      expect(stored).not.toContain(plain);
  });

  it('opens for the owner it was saved for only', async () => {
    const { records, storage } = memoryStorage();
    const lists = () =>
      [...records.keys()].filter((id) => id.startsWith('lists:'));
    await createThreadCache('owner-a', { storage }).write(LIST, page('Mine'));
    const [mine] = lists();
    const other = createThreadCache('owner-b', { storage });
    expect(await other.read(LIST)).toBeNull();
    await other.write(LIST, page('Theirs'));
    const theirs = lists().find((id) => id !== mine)!;
    // A record moved under another owner does not open there, and is removed.
    records.set(theirs, records.get(mine!));
    expect(await other.read(LIST)).toBeNull();
    expect(records.has(theirs)).toBe(false);
    expect(
      (await createThreadCache('owner-a', { storage }).read(LIST))?.page
        .threads[0]?.title
    ).toBe('Mine');
  });

  it('reads as empty, and removes the record, when it is damaged or its key is gone', async () => {
    const { records, storage } = memoryStorage();
    const cache = createThreadCache('owner-a', { storage });
    const listsId = async () => {
      await cache.write(LIST, page('One'));
      return [...records.keys()].find((id) => id.startsWith('lists:'))!;
    };

    let id = await listsId();
    const sealed = sealedOf(records);
    const flipped = new Uint8Array(sealed.data.slice(0));
    flipped[0]! ^= 1;
    records.set(id, { ...sealed, data: flipped.buffer });
    expect(await cache.read(LIST)).toBeNull();
    expect(records.has(id)).toBe(false);

    id = await listsId();
    records.set(id, 'not a sealed record');
    expect(await cache.read(LIST)).toBeNull();
    expect(records.has(id)).toBe(false);

    id = await listsId();
    for (const key of [...records.keys()])
      if (key.startsWith('key:')) records.delete(key);
    expect(await cache.read(LIST)).toBeNull();
    expect(records.has(id)).toBe(false);
    // A new key is made for the next write.
    await cache.write(LIST, page('Two'));
    expect((await cache.read(LIST))?.page.threads[0]?.title).toBe('Two');
  });

  it('drops a cached list that does not fit the contract, keeping the others', async () => {
    const { records, storage } = memoryStorage();
    const cache = createThreadCache('owner-a', { storage });
    await cache.write(LIST, page('Good'));
    // Seal a second list in an older shape under the same key and owner.
    const ids = [...records.keys()];
    const key = records.get(
      ids.find((id) => id.startsWith('key:'))!
    ) as CryptoKey;
    const listsId = ids.find((id) => id.startsWith('lists:'))!;
    const owner = listsId.slice('lists:'.length);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const data = await crypto.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv,
        additionalData: new TextEncoder().encode(
          `mastermind-fleet-threads-v1\n${owner}`
        ),
      },
      key,
      new TextEncoder().encode(
        JSON.stringify({
          [LIST]: { page: page('Good'), savedAt: '2026-11-21T05:00:00.000Z' },
          old: {
            page: { threads: 'none' },
            savedAt: '2026-11-21T05:00:00.000Z',
          },
          undated: { page: page('No date') },
        })
      )
    );
    records.set(listsId, { v: 1, iv, data });
    expect((await cache.read(LIST))?.page.threads[0]?.title).toBe('Good');
    expect(await cache.read('old')).toBeNull();
    expect(await cache.read('undated')).toBeNull();
  });

  it('keeps the lists saved last and the first screenful of each', async () => {
    const { storage } = memoryStorage();
    let minute = 0;
    const cache = createThreadCache('owner-a', {
      storage,
      now: () => new Date(Date.UTC(2026, 10, 21, 5, minute++)),
    });
    const total = THREAD_CACHE_LIMITS.lists + 2;
    for (let n = 0; n < total; n++)
      await cache.write(`skr-m4||p${n}|`, page(`List ${n}`, 60));
    expect(await cache.read('skr-m4||p0|')).toBeNull();
    expect(await cache.read('skr-m4||p1|')).toBeNull();
    for (let n = 2; n < total; n++)
      expect((await cache.read(`skr-m4||p${n}|`))?.page.threads).toHaveLength(
        THREAD_CACHE_LIMITS.threads
      );
  });

  it('clears the lists and the key', async () => {
    const { records, storage } = memoryStorage();
    const cache = createThreadCache('owner-a', { storage });
    await cache.write(LIST, page('One'));
    expect(await cache.clear()).toBe(true);
    expect(records.size).toBe(0);
    expect(await cache.read(LIST)).toBeNull();
  });

  it('reads as nothing cached when storage is unavailable', async () => {
    const broken: ThreadCacheStorage = {
      get: async () => {
        throw new Error('blocked');
      },
      set: async () => {
        throw new Error('blocked');
      },
      delete: async () => {
        throw new Error('blocked');
      },
    };
    const cache = createThreadCache('owner-a', { storage: broken });
    expect(await cache.read(LIST)).toBeNull();
    expect(await cache.write(LIST, page('One'))).toBe(false);
    expect(await cache.clear()).toBe(false);
  });

  it('opens what storage hands back as copies, also from another realm', async () => {
    // IndexedDB stores structured clones, never the objects it was given.
    const records = new Map<string, unknown>();
    const storage: ThreadCacheStorage = {
      get: async (id) => structuredClone(records.get(id)),
      set: async (id, value) => void records.set(id, structuredClone(value)),
      delete: async (id) => void records.delete(id),
    };
    const cache = createThreadCache('owner-a', { storage });
    await cache.write(LIST, page('Cloned'));
    expect((await cache.read(LIST))?.page.threads[0]?.title).toBe('Cloned');

    // The same bytes in buffers another realm made: not instances of this
    // realm's ArrayBuffer or Uint8Array, and still the owner's list.
    const listsId = [...records.keys()].find((id) => id.startsWith('lists:'))!;
    const sealed = records.get(listsId) as {
      v: number;
      iv: Uint8Array;
      data: ArrayBuffer;
    };
    const foreign = runInNewContext(
      '({ data: new ArrayBuffer(size), iv: new Uint8Array(12) })',
      { size: sealed.data.byteLength }
    ) as { data: ArrayBuffer; iv: Uint8Array };
    new Uint8Array(foreign.data).set(new Uint8Array(sealed.data));
    foreign.iv.set(sealed.iv);
    expect(foreign.data instanceof ArrayBuffer).toBe(false);
    storage.get = async (id) =>
      id === listsId ? { v: sealed.v, ...foreign } : records.get(id);
    expect((await cache.read(LIST))?.page.threads[0]?.title).toBe('Cloned');
    expect(records.has(listsId)).toBe(true);
  });

  it('recovers after the owner digest fails once', async () => {
    const { storage } = memoryStorage();
    const cache = createThreadCache('owner-a', { storage });
    const digest = vi
      .spyOn(crypto.subtle, 'digest')
      .mockRejectedValueOnce(new Error('not now'));
    expect(await cache.write(LIST, page('One'))).toBe(false);
    expect(await cache.write(LIST, page('Two'))).toBe(true);
    expect((await cache.read(LIST))?.page.threads[0]?.title).toBe('Two');
    expect(await cache.clear()).toBe(true);
    digest.mockRestore();
  });

  it('neither removes nor replaces what is stored when a record cannot be read', async () => {
    const { records, storage } = memoryStorage();
    const cache = createThreadCache('owner-a', { storage });
    await cache.write(LIST, page('Kept'));
    await cache.write('skr-m4|||failed', page('Also kept'));
    const before = sealedOf(records);

    // Reading the key fails once, then reading the lists fails once.
    for (const prefix of ['key:', 'lists:']) {
      let failed = false;
      const flaky: ThreadCacheStorage = {
        ...storage,
        get: async (id) => {
          if (!failed && id.startsWith(prefix)) {
            failed = true;
            throw new Error('blocked');
          }
          return storage.get(id);
        },
      };
      const unlucky = createThreadCache('owner-a', { storage: flaky });
      expect(await unlucky.write('skr-m4|||idle', page('Lost'))).toBe(false);
      expect(sealedOf(records)).toBe(before);
      failed = false;
      expect(await unlucky.read(LIST)).toBeNull();
      expect(sealedOf(records)).toBe(before);
    }
    expect((await cache.read(LIST))?.page.threads[0]?.title).toBe('Kept');
    expect((await cache.read('skr-m4|||failed'))?.page.threads[0]?.title).toBe(
      'Also kept'
    );
    expect(await cache.read('skr-m4|||idle')).toBeNull();
  });
});
