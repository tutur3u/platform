/**
 * Wire protocol for the Durable Object abuse-guard store (`apps/abuse-guard`).
 *
 * Shared by the Worker and every client. Portable: no Next.js, React or
 * Cloudflare runtime imports. Every partition and key on the wire is an opaque
 * HMAC digest computed by the client, so no raw IP, email, user, session or
 * token value reaches Cloudflare object names or storage keys.
 */
import { z } from 'zod';

export const ABUSE_GUARD_PROTOCOL_VERSION = 1;

/** Caller families. Each one is default-off until named in ABUSE_GUARD_FAMILIES. */
export const ABUSE_GUARD_FAMILIES = [
  'offline',
  'password',
  'proxy',
  'replay',
  'meet',
] as const;
export type AbuseGuardFamily = (typeof ABUSE_GUARD_FAMILIES)[number];

/** Per-request bounds enforced by both the client and the Worker. */
export const ABUSE_GUARD_LIMITS = {
  maxBodyBytes: 16 * 1024,
  maxSteps: 16,
  maxCommandsPerStep: 8,
  maxCommands: 32,
  maxWindowsPerHit: 4,
  maxValueBytes: 2 * 1024,
  minTtlMs: 1000,
  /** Replay fences must outlive the longest refresh token (CLI: 90 days). */
  maxTtlMs: 120 * 24 * 60 * 60 * 1000,
  maxWindowMs: 24 * 60 * 60 * 1000,
  maxLimit: 1_000_000,
} as const;

/** base64url SHA-256 HMAC digest without padding. */
export const GUARD_DIGEST_PATTERN = /^[A-Za-z0-9_-]{43}$/u;
/** Random per-operation id (a UUID or other 22-64 character token). */
export const GUARD_OPERATION_ID_PATTERN = /^[A-Za-z0-9_-]{22,64}$/u;
/**
 * How long the Worker remembers an operation id. Must exceed the window in
 * which a signed request is replayable: the signature skew in both directions
 * (2 × 60 s, covering future timestamps) plus margin.
 */
export const GUARD_OPERATION_RETENTION_MS = 180_000;

const digest = z.string().regex(GUARD_DIGEST_PATTERN);
const ttlMs = z
  .number()
  .int()
  .min(ABUSE_GUARD_LIMITS.minTtlMs)
  .max(ABUSE_GUARD_LIMITS.maxTtlMs);
const limit = z.number().int().min(1).max(ABUSE_GUARD_LIMITS.maxLimit);
const value = z
  .string()
  .max(ABUSE_GUARD_LIMITS.maxValueBytes)
  .refine(
    (input) =>
      new TextEncoder().encode(input).byteLength <=
      ABUSE_GUARD_LIMITS.maxValueBytes,
    'value too large'
  );

export const guardWindowSchema = z.object({
  k: digest,
  limit,
  windowMs: z.number().int().min(1000).max(ABUSE_GUARD_LIMITS.maxWindowMs),
  algo: z.enum(['fixed', 'sliding']),
  /** Units this hit charges (e.g. audio seconds); absent charges one. */
  cost: limit.optional(),
});

export const guardCommandSchema = z.discriminatedUnion('op', [
  /** All-or-nothing over the listed windows; a denial charges nothing. */
  z.object({
    op: z.literal('win.hit'),
    windows: z
      .array(guardWindowSchema)
      .min(1)
      .max(ABUSE_GUARD_LIMITS.maxWindowsPerHit),
  }),
  z.object({ op: z.literal('kv.get'), k: digest }),
  /** `nx` sets only when absent; `xx` only when present. */
  z.object({
    op: z.literal('kv.set'),
    k: digest,
    v: value,
    ttlMs,
    mode: z.enum(['always', 'nx', 'xx']).default('always'),
    keepTtl: z.boolean().optional(),
  }),
  z.object({ op: z.literal('kv.del'), k: digest }),
  /** Integer add; the TTL applies only when the counter is created. */
  z.object({
    op: z.literal('kv.incr'),
    k: digest,
    by: z
      .number()
      .int()
      .min(-ABUSE_GUARD_LIMITS.maxLimit)
      .max(ABUSE_GUARD_LIMITS.maxLimit),
    ttlMsOnCreate: ttlMs,
  }),
  z.object({ op: z.literal('kv.expire'), k: digest, ttlMs }),
  z.object({ op: z.literal('kv.ttl'), k: digest }),
  /**
   * Port of the password-attempt reservation script: check every budget, then
   * increment all of them, and store a receipt expiring with the last budget.
   */
  z.object({
    op: z.literal('res.reserve'),
    budgets: z
      .array(z.object({ k: digest, limit, ttlMs }))
      .min(1)
      .max(2),
    receipt: digest,
  }),
  /** Refunds one unit of `target` at most once, when `receipt` still owns it. */
  z.object({ op: z.literal('res.refund'), receipt: digest, target: digest }),
]);

export const guardStepSchema = z.object({
  /** Partition digest; every key in the step lives in this one object. */
  p: digest,
  cmds: z
    .array(guardCommandSchema)
    .min(1)
    .max(ABUSE_GUARD_LIMITS.maxCommandsPerStep),
});

export const guardRpcSchema = z
  .object({
    v: z.literal(ABUSE_GUARD_PROTOCOL_VERSION),
    /**
     * Fresh random id per operation, inside the signed body. The Worker
     * records it with each step's result before returning, so a replayed or
     * concurrent duplicate gets the original result instead of mutating again.
     */
    id: z.string().regex(GUARD_OPERATION_ID_PATTERN),
    family: z.enum(ABUSE_GUARD_FAMILIES),
    /** Trusted caller identities, purpose-hashed independently of scope/keys. */
    fairness: z
      .object({ source: digest, principal: digest.optional() })
      .optional(),
    /** Run steps in order and skip the rest after the first denial. */
    sequential: z.boolean().optional(),
    steps: z.array(guardStepSchema).min(1).max(ABUSE_GUARD_LIMITS.maxSteps),
  })
  .refine(
    (rpc) =>
      rpc.steps.reduce((total, step) => total + step.cmds.length, 0) <=
      ABUSE_GUARD_LIMITS.maxCommands,
    'too many commands'
  );

export type GuardWindow = z.infer<typeof guardWindowSchema>;
export type GuardCommand = z.input<typeof guardCommandSchema>;
export type ParsedGuardCommand = z.infer<typeof guardCommandSchema>;
export type GuardStep = z.input<typeof guardStepSchema>;
export type GuardRpc = z.input<typeof guardRpcSchema>;
export type ParsedGuardRpc = z.infer<typeof guardRpcSchema>;

const windowResultSchema = z.object({
  remaining: z.number().int(),
  resetAt: z.number().int(),
});

export const guardResultSchema = z.union([
  z.object({
    op: z.literal('win.hit'),
    ok: z.boolean(),
    resetAt: z.number().int(),
    windows: z.array(windowResultSchema),
  }),
  z.object({ op: z.literal('kv.get'), v: z.string().nullable() }),
  z.object({ op: z.literal('kv.set'), set: z.boolean() }),
  z.object({ op: z.literal('kv.del'), n: z.number().int() }),
  z.object({
    op: z.literal('kv.incr'),
    n: z.number().int(),
    ttlMs: z.number().int(),
  }),
  z.object({ op: z.literal('kv.expire'), set: z.boolean() }),
  /** Remaining milliseconds, or -2 when the key is absent. */
  z.object({ op: z.literal('kv.ttl'), ttlMs: z.number().int() }),
  z.object({
    op: z.literal('res.reserve'),
    ok: z.boolean(),
    remaining: z.number().int(),
    retryAfterMs: z.number().int(),
  }),
  z.object({ op: z.literal('res.refund'), n: z.number().int() }),
]);

export const guardStepResultSchema = z.union([
  z.object({ results: z.array(guardResultSchema) }),
  z.object({ skipped: z.literal(true) }),
]);

export const guardRpcResponseSchema = z.object({
  v: z.literal(ABUSE_GUARD_PROTOCOL_VERSION),
  steps: z.array(guardStepResultSchema),
});

export type GuardResult = z.infer<typeof guardResultSchema>;
export type GuardStepResult = z.infer<typeof guardStepResultSchema>;
export type GuardRpcResponse = z.infer<typeof guardRpcResponseSchema>;

/** Error codes the Worker returns; every one is a store failure for callers. */
export type GuardErrorCode =
  | 'bad_request'
  | 'unauthorized'
  | 'guard_limited'
  | 'guard_stopped'
  | 'guard_unavailable';

/** A denial in this result stops a sequential RPC. */
export function isGuardDenial(result: GuardResult) {
  return (result.op === 'win.hit' || result.op === 'res.reserve') && !result.ok;
}
