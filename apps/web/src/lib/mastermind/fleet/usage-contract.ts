import { z } from 'zod';
import { scrubFleetText } from './scrub';

// Storage CAS carries both the old and new value in one RPC.
export const FLEET_USAGE_MAX_BYTES = 96 * 1024;
export const FLEET_USAGE_STALE_MS = 120_000;
// T3 rechecks some providers' limits only every few minutes, so an account's
// own check time is judged on this longer clock.
export const FLEET_USAGE_ACCOUNT_STALE_MS = 15 * 60_000;

const time = z.iso.datetime({ offset: true });
const day = z.iso.date();
const key = z.string().regex(/^[a-z0-9][a-z0-9._-]{0,63}$/);
const text = (length: number) =>
  z
    .string()
    .max(length * 4)
    .transform((value) => scrubFleetText(value, length))
    .pipe(z.string().min(1));
const tokens = z.number().int().nonnegative();

const window = z.strictObject({
  kind: z.enum(['session', 'weekly', 'monthly']),
  usedPercent: z.number().min(0).max(100).nullable(),
  resetsAt: time.nullable(),
});

const account = z.strictObject({
  id: key,
  provider: text(48),
  instance: text(64),
  // Structured provider identity, intentionally exempt from free-text scrubbing.
  email: z.email().max(254).nullable(),
  plan: text(48).nullable(),
  checkedAt: time.nullable(),
  status: z.discriminatedUnion('kind', [
    z.strictObject({ kind: z.literal('available') }),
    z.strictObject({
      kind: z.literal('limited'),
      reason: z.enum(['session', 'weekly', 'monthly', 'provider']),
    }),
    z.strictObject({
      kind: z.literal('unknown'),
      reason: z.enum([
        'unsupported',
        'not_authenticated',
        'disabled',
        'unavailable',
        'not_reported',
      ]),
    }),
  ]),
  windows: z
    .array(window)
    .max(2)
    .refine(
      (rows) => new Set(rows.map((row) => row.kind)).size === rows.length
    ),
});

const bucket = z.strictObject({
  day,
  provider: text(48),
  model: text(96),
  accountId: key.nullable(),
  uncachedInputTokens: tokens,
  cachedInputTokens: tokens,
  cacheCreationTokens: tokens,
  outputTokens: tokens,
  unpricedRecords: tokens,
  costUsd: z.number().nonnegative().nullable(),
});

// Why a machine's quota or accounting was not read, from the publisher's
// closed list. Snapshots written before reasons existed omit it.
const unreadReason = z.enum([
  'not_configured',
  'reader_missing',
  'reader_refused',
  'environment_mismatch',
  'config_invalid',
  'unreachable',
  'not_reported',
  'read_failed',
]);

const source = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('unavailable'),
    reason: unreadReason.optional(),
  }),
  z.strictObject({ kind: z.literal('partial'), observedAt: time }),
  z.strictObject({ kind: z.literal('complete'), observedAt: time }),
]);

const machine = z.strictObject({
  id: key,
  label: text(48),
  quota: source,
  accounting: source,
  accounts: z
    .array(account)
    .max(32)
    .refine((rows) => new Set(rows.map((row) => row.id)).size === rows.length),
  buckets: z.array(bucket).max(384),
});

export const fleetUsageSnapshotSchema = z.strictObject({
  v: z.literal(1),
  generatedAt: time,
  machines: z
    .array(machine)
    .max(12)
    .refine((rows) => new Set(rows.map((row) => row.id)).size === rows.length),
});

export const fleetUsageResponseSchema = z.strictObject({
  snapshot: fleetUsageSnapshotSchema,
  receivedAt: time,
});

export type FleetUsageSnapshot = z.infer<typeof fleetUsageSnapshotSchema>;
export type FleetUsageResponse = z.infer<typeof fleetUsageResponseSchema>;
