import {
  assertChatGPTUserId,
  type ChatGPTStorageAdapter,
  type ChatGPTStore,
  emptyChatGPTStore,
  storeSchema,
} from './storage-schema';

/** The R2 bucket surface the credential store uses (an `R2Bucket` binding). */
export interface ChatGPTBucketObject {
  etag: string;
  uploaded: Date;
  customMetadata?: Record<string, string>;
}
export interface ChatGPTBucket {
  get(
    key: string
  ): Promise<(ChatGPTBucketObject & { text(): Promise<string> }) | null>;
  head(key: string): Promise<ChatGPTBucketObject | null>;
  put(
    key: string,
    value: string,
    options?: {
      onlyIf?: { etagMatches?: string } | Headers;
      customMetadata?: Record<string, string>;
      httpMetadata?: { contentType?: string };
    }
  ): Promise<ChatGPTBucketObject | null>;
  delete(key: string): Promise<void>;
}

/** RFC 7232 `If-None-Match: *`: the put succeeds only when no object exists. */
const createOnly = () => new Headers({ 'If-None-Match': '*' });

const OBJECTS = { store: 'store.json', lock: 'store.lock' } as const;

/**
 * `chatgpt/<userId>/<object>`. The user ID is the session user's UUID and the
 * object name is a fixed constant, so no client input reaches a key.
 */
export function chatGPTObjectKey(
  userId: string,
  object: keyof typeof OBJECTS = 'store'
) {
  assertChatGPTUserId(userId);
  const name = OBJECTS[object];
  if (!name) throw new Error('Invalid ChatGPT storage object');
  return `chatgpt/${userId}/${name}`;
}

export interface R2ChatGPTStorageOptions {
  /** A lock older than this belongs to a request that died holding it. */
  lockTtlMs?: number;
  /** How long a request waits for the lock; it outlasts one lock TTL. */
  maxWaitMs?: number;
  /** First wait between lock attempts; it doubles up to `maxDelayMs`. */
  retryDelayMs?: number;
  maxDelayMs?: number;
  /** Attempts for each store write. */
  writeAttempts?: number;
}

class ChatGPTLockLostError extends Error {
  constructor() {
    super('ChatGPT credentials changed after this request lost its lock');
  }
}

const sleep = (ms: number) =>
  new Promise((resolveWait) => setTimeout(resolveWait, ms));

/**
 * Private R2 objects for Worker deployments. Each store records its owner in
 * custom metadata and a read rejects a mismatch. A create-only lock object
 * serializes rotating refresh tokens across isolates; an expired lock is
 * taken over with an ETag-conditional write so only one waiter wins it. The
 * closing write is fenced on the ETag of the opening write, so a holder that
 * outlived its lock cannot overwrite the next holder's rotated tokens.
 */
export function createR2ChatGPTStorage(
  bucket: ChatGPTBucket,
  {
    lockTtlMs = 45_000,
    maxWaitMs = lockTtlMs + 5_000,
    retryDelayMs = 50,
    maxDelayMs = 4_000,
    writeAttempts = 3,
  }: R2ChatGPTStorageOptions = {}
): ChatGPTStorageAdapter {
  async function read(userId: string): Promise<ChatGPTStore> {
    const object = await bucket.get(chatGPTObjectKey(userId));
    if (!object) return emptyChatGPTStore();
    if (object.customMetadata?.owner !== userId)
      throw new Error('ChatGPT credential object belongs to another user');
    return storeSchema.parse(JSON.parse(await object.text()));
  }

  /** Writes the store and returns its ETag; `fence` must be the current one. */
  async function write(userId: string, store: ChatGPTStore, fence?: string) {
    const key = chatGPTObjectKey(userId);
    const body = JSON.stringify(storeSchema.parse(store));
    let failure: unknown;
    for (let attempt = 0; attempt < writeAttempts; attempt++) {
      try {
        const written = await bucket.put(key, body, {
          ...(fence ? { onlyIf: { etagMatches: fence } } : {}),
          customMetadata: { owner: userId },
          httpMetadata: { contentType: 'application/json' },
        });
        if (written) return written.etag;
        // A failed precondition after a failed attempt may be that attempt's
        // own committed write.
        const current = failure ? await bucket.get(key) : null;
        if (current && (await current.text()) === body) return current.etag;
        throw new ChatGPTLockLostError();
      } catch (error) {
        if (error instanceof ChatGPTLockLostError) throw error;
        failure = error;
        if (attempt + 1 < writeAttempts) await sleep(retryDelayMs);
      }
    }
    throw failure;
  }

  async function acquire(userId: string) {
    const key = chatGPTObjectKey(userId, 'lock');
    const token = crypto.randomUUID();
    const customMetadata = { owner: userId, token };
    const deadline = Date.now() + maxWaitMs;
    for (let delay = retryDelayMs; ; delay = Math.min(delay * 2, maxDelayMs)) {
      if (
        await bucket.put(key, token, { onlyIf: createOnly(), customMetadata })
      )
        return token;
      const held = await bucket.head(key);
      if (
        held &&
        Date.now() - held.uploaded.getTime() > lockTtlMs &&
        (await bucket.put(key, token, {
          onlyIf: { etagMatches: held.etag },
          customMetadata,
        }))
      )
        return token;
      if (Date.now() + delay > deadline) break;
      await sleep(delay);
    }
    throw new Error('ChatGPT connection is busy; retry shortly');
  }

  /** Best effort: an unreleased lock expires after `lockTtlMs`. */
  async function release(userId: string, token: string) {
    try {
      const key = chatGPTObjectKey(userId, 'lock');
      const held = await bucket.head(key);
      if (held?.customMetadata?.token === token) await bucket.delete(key);
    } catch (error) {
      console.warn('Unable to release the ChatGPT credential lock', error);
    }
  }

  return {
    read,
    async withStore(userId, operation) {
      const token = await acquire(userId);
      try {
        const store = await read(userId);
        const fence = await write(userId, store);
        const result = await operation(store);
        await write(userId, store, fence);
        return result;
      } finally {
        await release(userId, token);
      }
    },
  };
}
