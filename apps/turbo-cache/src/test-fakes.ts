import { sha256Hex } from './auth';
import { TurboCacheBudget } from './budget-object';
import type {
  Env,
  R2BucketLike,
  R2ObjectBodyLike,
  R2ObjectLike,
  RateLimiterLike,
} from './config';

// In-memory doubles that count every billable operation so tests can pin the
// exact R2 and Durable Object cost of each request.

interface StoredObject {
  bytes: ArrayBuffer;
  uploaded: Date;
  customMetadata: Record<string, string>;
}

export class FakeBucket implements R2BucketLike {
  readonly objects = new Map<string, StoredObject>();
  readonly ops = { get: 0, head: 0, put: 0 };
  readonly controlOps = { get: 0, head: 0, put: 0 };
  constructor(private readonly now: () => Date) {}

  private meta(object: StoredObject): R2ObjectLike {
    return {
      uploaded: object.uploaded,
      size: object.bytes.byteLength,
      customMetadata: object.customMetadata,
    };
  }

  async head(key: string) {
    (key.startsWith('_control/') ? this.controlOps : this.ops).head += 1;
    const object = this.objects.get(key);
    return object ? this.meta(object) : null;
  }

  async get(key: string): Promise<R2ObjectBodyLike | null> {
    (key.startsWith('_control/') ? this.controlOps : this.ops).get += 1;
    const object = this.objects.get(key);
    if (!object) return null;
    return { ...this.meta(object), body: new Response(object.bytes).body! };
  }

  async put(
    key: string,
    value: ReadableStream | ArrayBuffer | string,
    options?: { customMetadata?: Record<string, string> }
  ) {
    (key.startsWith('_control/') ? this.controlOps : this.ops).put += 1;
    const bytes = await new Response(value).arrayBuffer();
    const object = {
      bytes,
      uploaded: this.now(),
      customMetadata: options?.customMetadata ?? {},
    };
    this.objects.set(key, object);
    return this.meta(object);
  }
}

export class FakeStorage {
  readonly values = new Map<string, unknown>();
  async get<T>(key: string) {
    return structuredClone(this.values.get(key)) as T | undefined;
  }
  async put<T>(key: string, value: T) {
    this.values.set(key, structuredClone(value));
  }
}

export class FakeLimiter implements RateLimiterLike {
  calls = 0;
  constructor(private readonly allowed: number) {}
  async limit() {
    this.calls += 1;
    return { success: this.calls <= this.allowed };
  }
}

export function createBudgetNamespace(
  storage: FakeStorage,
  env: () => Env,
  now: () => Date
) {
  const counter = { fetches: 0 };
  const namespace = {
    idFromName: (name: string) => name,
    get: () => ({
      fetch: async (input: Request | string, init?: RequestInit) => {
        counter.fetches += 1;
        // A fresh object per call models eviction/restart: all state must
        // come from durable storage.
        const object = new TurboCacheBudget({ storage }, env(), now);
        return object.fetch(new Request(input, init));
      },
    }),
  };
  return { namespace, counter };
}

export const TOKENS = {
  main: 'main-token-0123456789abcdefghijklmnopqrstuvwxyz',
  branch: 'branch-token-0123456789abcdefghijklmnopqrstuvwxyz',
  readonly: 'readonly-token-0123456789abcdefghijklmnopqrstuvwxyz',
  admin: 'admin-token-0123456789abcdefghijklmnopqrstuvwxyz',
};

export async function tokenRegistry() {
  return JSON.stringify([
    {
      id: 'ci-main',
      sha256: await sha256Hex(TOKENS.main),
      read: ['main'],
      write: 'main',
    },
    {
      id: 'ci-branch',
      sha256: await sha256Hex(TOKENS.branch),
      read: ['branch', 'main'],
      write: 'branch',
    },
    {
      id: 'ci-readonly',
      sha256: await sha256Hex(TOKENS.readonly),
      read: ['main'],
    },
  ]);
}
