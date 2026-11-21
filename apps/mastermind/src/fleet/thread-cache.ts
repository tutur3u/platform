/**
 * The last thread lists the owner saw, kept in this browser only, so a list
 * renders at once and still shows, with its age, while the machine is
 * offline. Thread titles never rest in the cloud; here they rest sealed with
 * AES-256-GCM under a key the browser holds as non-extractable: the stored
 * bytes cannot be read back by script, only used here, and a copy of the
 * database opens nowhere else. Each owner has their own key and their own
 * record, bound together as associated data.
 */
import {
  type FleetThreadPage,
  type FleetThreadState,
  fleetThreadPageSchema,
} from '@tuturuuu/internal-api/mastermind-threads';

export type CachedThreads = { page: FleetThreadPage; savedAt: string };

/** Where keys and sealed lists are kept; IndexedDB in a browser. */
export interface ThreadCacheStorage {
  get(id: string): Promise<unknown>;
  set(id: string, value: unknown): Promise<void>;
  delete(id: string): Promise<void>;
}

export const THREAD_CACHE_LIMITS = {
  /** Lists kept: the ones saved last. */
  lists: 6,
  /** Threads kept per list: the first screenful. */
  threads: 50,
  maxBytes: 1024 * 1024,
} as const;

const VERSION = 1;

/**
 * Names one cached list: a machine, with at most one project and one state.
 * Searches are not cached.
 */
export function threadListKey(list: {
  machineId: string;
  environmentId?: string;
  projectId?: string;
  state?: FleetThreadState;
}) {
  return [
    list.machineId,
    list.environmentId ?? '',
    list.projectId ?? '',
    list.state ?? '',
  ].join('|');
}

const DATABASE = 'mastermind-fleet';
const STORE = 'thread-cache';

function request<T>(pending: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    pending.onsuccess = () => resolve(pending.result);
    pending.onerror = () => reject(pending.error);
  });
}

/** Structured clone keeps a `CryptoKey` usable without exposing its bytes. */
export function indexedDbThreadCacheStorage(
  factory: IDBFactory = indexedDB
): ThreadCacheStorage {
  const open = () => {
    const pending = factory.open(DATABASE, 1);
    pending.onupgradeneeded = () => pending.result.createObjectStore(STORE);
    return request(pending);
  };
  const run = async <T>(
    mode: IDBTransactionMode,
    action: (store: IDBObjectStore) => IDBRequest<T>
  ) => {
    const database = await open();
    try {
      return await request(
        action(database.transaction(STORE, mode).objectStore(STORE))
      );
    } finally {
      database.close();
    }
  };
  return {
    get: (id) => run('readonly', (store) => store.get(id)),
    set: async (id, value) => {
      await run('readwrite', (store) => store.put(value, id));
    },
    delete: async (id) => {
      await run('readwrite', (store) => store.delete(id));
    },
  };
}

const encoder = new TextEncoder();

async function digest(value: string) {
  const bytes = await crypto.subtle.digest('SHA-256', encoder.encode(value));
  return Array.from(new Uint8Array(bytes), (byte) =>
    byte.toString(16).padStart(2, '0')
  ).join('');
}

/** Bytes WebCrypto accepts: never backed by a shared buffer. */
type Bytes = Uint8Array<ArrayBuffer>;
type Sealed = { v: number; iv: Bytes; data: ArrayBuffer };

/**
 * What a value is, whichever realm made it: a value read back from storage
 * need not be an instance of this realm's constructors.
 */
const kind = (value: unknown) => Object.prototype.toString.call(value);

const isSealed = (value: unknown): value is Sealed => {
  const sealed = value as Partial<Sealed> | null;
  return (
    !!sealed &&
    sealed.v === VERSION &&
    kind(sealed.iv) === '[object Uint8Array]' &&
    sealed.iv?.byteLength === 12 &&
    kind(sealed.data) === '[object ArrayBuffer]' &&
    (sealed.data as ArrayBuffer).byteLength <= THREAD_CACHE_LIMITS.maxBytes
  );
};

/**
 * The cache of one owner. `ownerId` is any stable identifier of the
 * signed-in owner; only its digest is stored. No call throws. While storage
 * is unavailable or blocked a read finds nothing cached and a write saves
 * nothing, so what is stored stays as it is. A record that does not open
 * under this owner's key is removed, and a list that does not fit the
 * contract is left out.
 */
export function createThreadCache(
  ownerId: string,
  options: { storage?: ThreadCacheStorage; now?: () => Date } = {}
) {
  const now = options.now ?? (() => new Date());
  let scope:
    | Promise<{ keyId: string; listsId: string; aad: Bytes }>
    | undefined;
  const names = () =>
    (scope ??= digest(ownerId)
      .then((owner) => ({
        keyId: `key:${owner}`,
        listsId: `lists:${owner}`,
        aad: new Uint8Array(
          encoder.encode(`mastermind-fleet-threads-v${VERSION}\n${owner}`)
        ),
      }))
      .catch((error: unknown) => {
        // One failed digest must not fail every later call.
        scope = undefined;
        throw error;
      }));
  const storage = () => options.storage ?? indexedDbThreadCacheStorage();

  async function key(create: boolean) {
    const { keyId } = await names();
    const stored = await storage().get(keyId);
    if (kind(stored) === '[object CryptoKey]') return stored as CryptoKey;
    if (!create) return null;
    const made = await crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      // Not extractable: script can use the key, never read it.
      false,
      ['encrypt', 'decrypt']
    );
    await storage().set(keyId, made);
    return made;
  }

  async function load(): Promise<Record<string, CachedThreads>> {
    const { listsId, aad } = await names();
    // A failure to read either record ends the operation here: nothing is
    // known about what is stored, so nothing is removed or replaced.
    const sealed = await storage().get(listsId);
    if (sealed === undefined || sealed === null) return {};
    const secret = await key(false);
    try {
      if (!secret || !isSealed(sealed)) throw new Error('unreadable');
      const plain = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: sealed.iv, additionalData: aad },
        secret,
        sealed.data
      );
      const lists: unknown = JSON.parse(new TextDecoder().decode(plain));
      if (!lists || typeof lists !== 'object' || Array.isArray(lists))
        throw new Error('unreadable');
      const kept: Record<string, CachedThreads> = {};
      for (const [name, entry] of Object.entries(lists)) {
        const { page, savedAt } = (entry ?? {}) as Partial<CachedThreads>;
        const parsed = fleetThreadPageSchema.safeParse(page);
        if (
          parsed.success &&
          typeof savedAt === 'string' &&
          Date.parse(savedAt)
        )
          kept[name] = { page: parsed.data, savedAt };
      }
      return kept;
    } catch {
      // Not ours, damaged, or sealed under a key that is gone.
      await storage().delete(listsId);
      return {};
    }
  }

  let tail: Promise<unknown> = Promise.resolve();
  /** One operation at a time, so a write never works from a stale read. */
  const serial = <T>(operation: () => Promise<T>, fallback: T) => {
    const result = tail.then(operation).catch(() => fallback);
    tail = result;
    return result;
  };

  return {
    read: (listKey: string) =>
      serial<CachedThreads | null>(
        async () => (await load())[listKey] ?? null,
        null
      ),

    /** Keeps the first page of a list. Later pages are not cached. */
    write: (listKey: string, page: FleetThreadPage) =>
      serial(async () => {
        const { listsId, aad } = await names();
        const lists = await load();
        lists[listKey] = {
          page: {
            ...page,
            threads: page.threads.slice(0, THREAD_CACHE_LIMITS.threads),
          },
          savedAt: now().toISOString(),
        };
        const newest = Object.entries(lists)
          .sort(([, a], [, b]) => b.savedAt.localeCompare(a.savedAt))
          .slice(0, THREAD_CACHE_LIMITS.lists);
        const secret = await key(true);
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const data = await crypto.subtle.encrypt(
          { name: 'AES-GCM', iv, additionalData: aad },
          secret as CryptoKey,
          encoder.encode(JSON.stringify(Object.fromEntries(newest)))
        );
        await storage().set(listsId, { v: VERSION, iv, data } satisfies Sealed);
        return true;
      }, false),

    /** Erases every cached list of this owner and the key that opens them. */
    clear: () =>
      serial(async () => {
        const { keyId, listsId } = await names();
        await storage().delete(listsId);
        await storage().delete(keyId);
        return true;
      }, false),
  };
}

export type ThreadCache = ReturnType<typeof createThreadCache>;
