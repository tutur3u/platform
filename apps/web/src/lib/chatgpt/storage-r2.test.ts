// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  type ChatGPTBucket,
  type ChatGPTBucketObject,
  chatGPTObjectKey,
  createR2ChatGPTStorage,
} from './storage-r2';

const context = vi.hoisted(() => ({
  env: null as Record<string, unknown> | null,
}));
vi.mock('@opennextjs/cloudflare/cloudflare-context', () => ({
  getCloudflareContext: () => {
    if (!context.env) throw new Error('no Cloudflare context');
    return { env: context.env, ctx: {} };
  },
}));

interface Stored extends ChatGPTBucketObject {
  value: string;
}

/** In-memory R2 bucket with the conditional-put semantics the store uses. */
function createFakeBucket() {
  const objects = new Map<string, Stored>();
  let version = 0;
  const bucket: ChatGPTBucket = {
    async get(key) {
      const object = objects.get(key);
      return object ? { ...object, text: async () => object.value } : null;
    },
    async head(key) {
      const object = objects.get(key);
      return object ? { ...object } : null;
    },
    async put(key, value, options) {
      const current = objects.get(key);
      const onlyIf = options?.onlyIf;
      const createOnly =
        onlyIf instanceof Headers && onlyIf.get('If-None-Match') === '*';
      const etagMatches =
        onlyIf instanceof Headers ? undefined : onlyIf?.etagMatches;
      if (createOnly && current) return null;
      if (etagMatches !== undefined && current?.etag !== etagMatches)
        return null;
      const stored: Stored = {
        value,
        etag: `etag-${++version}`,
        uploaded: new Date(),
        customMetadata: options?.customMetadata,
      };
      objects.set(key, stored);
      return { ...stored };
    },
    async delete(key) {
      objects.delete(key);
    },
  };
  return { bucket, objects };
}

const userA = '11111111-1111-4111-8111-111111111111';
const userB = '22222222-2222-4222-8222-222222222222';
const registration = {
  clientId: 'oaiapp_test',
  subject: 'synthetic-subject',
  refreshToken: 'synthetic-refresh',
  scopes: ['chatgpt.tokens.use.direct'],
};

afterEach(() => {
  context.env = null;
});

describe('R2 ChatGPT credential storage', () => {
  it('round-trips a store under chatgpt/<userId>/ with its owner recorded', async () => {
    const { bucket, objects } = createFakeBucket();
    const storage = createR2ChatGPTStorage(bucket);
    const hostId = await storage.withStore(userA, async (store) => {
      store.registrations.push(registration);
      return store.hostId;
    });
    const stored = await storage.read(userA);
    expect(stored).toEqual({ hostId, registrations: [registration] });
    expect([...objects.keys()]).toEqual([`chatgpt/${userA}/store.json`]);
    expect(objects.get(`chatgpt/${userA}/store.json`)?.customMetadata).toEqual({
      owner: userA,
    });
  });

  it('keeps users apart and rejects a store recorded for another owner', async () => {
    const { bucket, objects } = createFakeBucket();
    const storage = createR2ChatGPTStorage(bucket);
    await storage.withStore(userA, async (store) => {
      store.registrations.push(registration);
    });
    expect((await storage.read(userB)).registrations).toEqual([]);
    const copied = objects.get(`chatgpt/${userA}/store.json`);
    if (!copied) throw new Error('missing store');
    objects.set(`chatgpt/${userB}/store.json`, copied);
    await expect(storage.read(userB)).rejects.toThrow('another user');
    await expect(storage.withStore(userB, async () => null)).rejects.toThrow(
      'another user'
    );
  });

  it('rejects traversal and non-UUID user IDs before touching the bucket', async () => {
    const { bucket, objects } = createFakeBucket();
    const get = vi.spyOn(bucket, 'get');
    const storage = createR2ChatGPTStorage(bucket);
    for (const userId of ['../other-user', `${userA}/../${userB}`, '', '..']) {
      expect(() => chatGPTObjectKey(userId)).toThrow(
        'Invalid Tuturuuu user ID'
      );
      await expect(storage.read(userId)).rejects.toThrow();
      await expect(
        storage.withStore(userId, async () => null)
      ).rejects.toThrow();
    }
    expect(() =>
      chatGPTObjectKey(userA, '../store' as unknown as 'store')
    ).toThrow('Invalid ChatGPT storage object');
    expect(get).not.toHaveBeenCalled();
    expect(objects.size).toBe(0);
  });

  it('serializes concurrent mutations and releases the lock', async () => {
    const { bucket, objects } = createFakeBucket();
    const storage = createR2ChatGPTStorage(bucket, {
      retryDelayMs: 5,
      maxDelayMs: 5,
    });
    await Promise.all(
      [1, 2, 3].map((number) =>
        storage.withStore(userA, async (store) => {
          await new Promise((resolveWait) => setTimeout(resolveWait, 20));
          store.registrations.push({
            clientId: `oaiapp_${number}`,
            subject: `synthetic-${number}`,
            scopes: [],
          });
        })
      )
    );
    expect((await storage.read(userA)).registrations).toHaveLength(3);
    expect(objects.has(`chatgpt/${userA}/store.lock`)).toBe(false);
  });

  it('persists the host before the operation and releases the lock on failure', async () => {
    const { bucket, objects } = createFakeBucket();
    const storage = createR2ChatGPTStorage(bucket);
    let hostId = '';
    await expect(
      storage.withStore(userA, async (store) => {
        hostId = store.hostId;
        throw new Error('authorization failed');
      })
    ).rejects.toThrow('authorization failed');
    expect((await storage.read(userA)).hostId).toBe(hostId);
    expect(objects.has(`chatgpt/${userA}/store.lock`)).toBe(false);
  });

  it('waits on a live lock and takes over an expired one', async () => {
    const { bucket, objects } = createFakeBucket();
    const lockKey = `chatgpt/${userA}/store.lock`;
    await bucket.put(lockKey, 'other', { customMetadata: { token: 'other' } });
    const busy = createR2ChatGPTStorage(bucket, {
      maxWaitMs: 20,
      retryDelayMs: 1,
    });
    await expect(busy.withStore(userA, async () => null)).rejects.toThrow(
      'busy'
    );
    const lock = objects.get(lockKey);
    if (!lock) throw new Error('missing lock');
    lock.uploaded = new Date(Date.now() - 120_000);
    await expect(busy.withStore(userA, async () => 'done')).resolves.toBe(
      'done'
    );
    expect(objects.has(lockKey)).toBe(false);
  });

  it('refuses to overwrite tokens written after its lock expired', async () => {
    const { bucket, objects } = createFakeBucket();
    const storage = createR2ChatGPTStorage(bucket);
    const storeKey = `chatgpt/${userA}/store.json`;
    await expect(
      storage.withStore(userA, async (store) => {
        // Another request took over the expired lock and rotated the token.
        await bucket.put(
          storeKey,
          JSON.stringify({
            hostId: store.hostId,
            registrations: [registration],
          }),
          { customMetadata: { owner: userA } }
        );
        store.registrations.push({ ...registration, refreshToken: 'stale' });
      })
    ).rejects.toThrow('lost its lock');
    expect((await storage.read(userA)).registrations).toEqual([registration]);
    expect(objects.has(`chatgpt/${userA}/store.lock`)).toBe(false);
  });

  it('retries a failed write, accepting its own committed attempt', async () => {
    const { bucket } = createFakeBucket();
    const put = bucket.put.bind(bucket);
    let failures = 0;
    bucket.put = async (key, value, options) => {
      const result = await put(key, value, options);
      // The closing write commits but its response is lost once.
      if (key.endsWith('store.json') && options?.onlyIf && failures++ === 0)
        throw new Error('network');
      return result;
    };
    const storage = createR2ChatGPTStorage(bucket, { retryDelayMs: 1 });
    await expect(
      storage.withStore(userA, async (store) => {
        store.registrations.push(registration);
        return 'ok';
      })
    ).resolves.toBe('ok');
    expect(failures).toBe(2);
    expect((await storage.read(userA)).registrations).toEqual([registration]);
  });

  it('returns the result when releasing the lock fails', async () => {
    const { bucket } = createFakeBucket();
    vi.spyOn(bucket, 'head').mockRejectedValue(new Error('network'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const storage = createR2ChatGPTStorage(bucket);
    await expect(storage.withStore(userA, async () => 'ok')).resolves.toBe(
      'ok'
    );
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('is selected when the Worker binds CHATGPT_FILES', async () => {
    const { bucket, objects } = createFakeBucket();
    context.env = { CHATGPT_FILES: bucket };
    const { readChatGPTStore, withChatGPTStore } = await import('./storage');
    await withChatGPTStore(userA, async (store) => {
      store.registrations.push(registration);
    });
    expect((await readChatGPTStore(userA)).registrations).toEqual([
      registration,
    ]);
    expect(objects.has(`chatgpt/${userA}/store.json`)).toBe(true);
    await expect(readChatGPTStore('../other-user')).rejects.toThrow();
  });
});
