/**
 * Wire protocol of the Mastermind store Worker: a small, budgeted key-value
 * Durable Object that holds the fleet snapshot, owner answers and push-event
 * claims. Framework-free; the Worker and the Web client both import it.
 * See apps/docs/build/devops/mastermind-store.mdx.
 */
import { z } from 'zod';

export const MASTERMIND_STORE_PROTOCOL_VERSION = 1;

export const MASTERMIND_STORE_LIMITS = {
  /** Largest request body the Worker reads. */
  maxBodyBytes: 320 * 1024,
  /** Largest stored value: the 256 KiB fleet snapshot plus its envelope. */
  maxValueBytes: 300 * 1024,
  maxKeyLength: 160,
  maxOpsPerRequest: 8,
  maxKeysPerMget: 64,
  minTtlMs: 1000,
  maxTtlMs: 30 * 24 * 60 * 60 * 1000,
  /** Live rows; a write that would create one more is refused. */
  maxRows: 5000,
  /** Expired rows deleted per write, so cleanup needs no alarm. */
  cleanupPerWrite: 20,
} as const;

const key = z
  .string()
  .min(1)
  .max(MASTERMIND_STORE_LIMITS.maxKeyLength)
  .regex(/^[A-Za-z0-9:._-]+$/u);
const value = z
  .string()
  .refine(
    (text) =>
      new TextEncoder().encode(text).byteLength <=
      MASTERMIND_STORE_LIMITS.maxValueBytes,
    'value too large'
  );
const ttlMs = z
  .number()
  .int()
  .min(MASTERMIND_STORE_LIMITS.minTtlMs)
  .max(MASTERMIND_STORE_LIMITS.maxTtlMs);

export const storeOpSchema = z.discriminatedUnion('op', [
  /**
   * `cacheMs` (only in a single-op request) lets the Worker answer from its
   * per-colo Cache API copy for that long; used for the polled snapshot.
   */
  z.object({
    op: z.literal('get'),
    k: key,
    cacheMs: z.number().int().min(0).max(5000).optional(),
    /** With `cacheMs`: skip the cached copy and replace it with this read. */
    refresh: z.boolean().optional(),
  }),
  z.object({
    op: z.literal('mget'),
    ks: z.array(key).min(1).max(MASTERMIND_STORE_LIMITS.maxKeysPerMget),
  }),
  /** `nx` writes only when the key is absent (or expired). */
  z.object({
    op: z.literal('set'),
    k: key,
    v: value,
    ttlMs,
    mode: z.enum(['always', 'nx']).default('always'),
  }),
  /** Compare-and-set: writes only when the current value equals `expect` (null = absent). */
  z.object({
    op: z.literal('cas'),
    k: key,
    expect: z.string().nullable(),
    v: value,
    ttlMs,
  }),
  /** Compare-and-delete: deletes only when the current value equals `expect`. */
  z.object({ op: z.literal('cad'), k: key, expect: z.string() }),
  z.object({ op: z.literal('del'), k: key }),
]);

export type StoreOp = z.input<typeof storeOpSchema>;
export type ParsedStoreOp = z.output<typeof storeOpSchema>;

export const storeRpcSchema = z.object({
  v: z.literal(MASTERMIND_STORE_PROTOCOL_VERSION),
  ops: z
    .array(storeOpSchema)
    .min(1)
    .max(MASTERMIND_STORE_LIMITS.maxOpsPerRequest),
});

/** `get`: value or null; `mget`: values; writes: whether they applied. */
export type StoreResult = string | null | (string | null)[] | boolean;

export const storeErrorCodes = [
  'bad_request',
  'unauthorized',
  'stopped',
  'budget',
  'full',
  'unavailable',
] as const;
export type StoreErrorCode = (typeof storeErrorCodes)[number];

export const storeRpcResponseSchema = z.union([
  z.object({
    ok: z.literal(true),
    results: z.array(
      z.union([
        z.string(),
        z.null(),
        z.boolean(),
        z.array(z.string().nullable()),
      ])
    ),
  }),
  z.object({ ok: z.literal(false), error: z.enum(storeErrorCodes) }),
]);
export type StoreRpcResponse = z.infer<typeof storeRpcResponseSchema>;

export const storeFenceSchema = z.object({ stopped: z.boolean() });
