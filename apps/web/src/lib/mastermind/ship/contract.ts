import { z } from 'zod';

/**
 * The Mastermind ship snapshot: what is live per app and environment, its CI
 * state, the pending release on the branch, and per-source freshness. The
 * Cron Control collector (apps/cron-control/src/processors/mastermind-ship)
 * writes it to the Mastermind store; Web validates every read with this
 * schema, so a drifted or tampered value never reaches a client.
 * Framework-free (zod only): Mastermind web and the tests import it.
 * See apps/docs/build/devops/mastermind-ship-collector.mdx.
 */

export const SHIP_SNAPSHOT_KEY = 'mastermind:ship:v1:snapshot';

export const shipAppIds = [
  'web',
  'calendar',
  'contacts',
  'meet',
  'mail',
  'mastermind',
  'mobile',
  'upskii',
  'mastery-ai',
  'pktm',
] as const;

const iso = z.iso.datetime({ offset: true });
const sha = z.string().regex(/^[0-9a-f]{40}$/);
const label = z.string().min(1).max(100);
// `github:<owner>/<name>` per repository, or `cloudflare`.
const sourceId = z
  .string()
  .regex(/^(?:github:[A-Za-z0-9-]{1,39}\/[A-Za-z0-9._-]{1,100}|cloudflare)$/);

export const shipSourceSchema = z.object({
  id: sourceId,
  name: label,
  state: z.enum(['ok', 'error', 'backoff', 'unconfigured']),
  checkedAt: iso.nullable(),
  okAt: iso.nullable(),
  retryAt: iso.nullable(),
  problem: z
    .enum([
      'auth',
      'http',
      'invalid',
      'not-configured',
      'rate-limited',
      'timeout',
    ])
    .nullable(),
});

export const shipReleaseSchema = z.object({
  sha,
  deployedAt: iso,
  environment: label,
  ci: z.enum(['success', 'failure', 'pending', 'none']),
  /** The newest deployment attempt for the environment, after the live one. */
  deploy: z.enum(['ok', 'failed', 'running']),
});

export const shipWorkerSchema = z.object({
  script: z.string().regex(/^[a-z0-9][a-z0-9-]{0,62}$/),
  versionId: z.string().regex(/^[0-9a-f-]{8,64}$/),
  percentage: z.number().min(0).max(100),
  deployedAt: iso,
  sha: sha.nullable(),
});

const environmentSchema = z.object({
  release: shipReleaseSchema.nullable(),
  worker: shipWorkerSchema.nullable(),
});

export const shipAppSchema = z.object({
  id: z.enum(shipAppIds),
  name: label,
  repository: z
    .string()
    .regex(/^[A-Za-z0-9-]{1,39}\/[A-Za-z0-9._-]{1,100}$/)
    .nullable(),
  production: environmentSchema,
  staging: environmentSchema.nullable(),
  pending: z
    .object({
      commits: z.number().int().min(0).max(10_000),
      capped: z.boolean(),
      oldestAt: iso.nullable(),
      headSha: sha,
    })
    .nullable(),
  sources: z.array(sourceId).max(4),
});

export const shipSnapshotSchema = z.object({
  version: z.literal(1),
  collectedAt: iso,
  trigger: z.enum(['schedule', 'check']),
  sources: z.array(shipSourceSchema).max(16),
  apps: z.array(shipAppSchema).max(32),
});

export type ShipSnapshot = z.infer<typeof shipSnapshotSchema>;
export type ShipApp = z.infer<typeof shipAppSchema>;
export type ShipSource = z.infer<typeof shipSourceSchema>;
export type ShipRelease = z.infer<typeof shipReleaseSchema>;
export type ShipWorker = z.infer<typeof shipWorkerSchema>;

/** What `POST /api/v1/mastermind/fleet/ship/check` answers. */
export const shipCheckStates = [
  'checked',
  'rate_limited',
  'stopped',
  'disabled',
  'unconfigured',
  'failed',
] as const;
export const shipCheckResultSchema = z.object({
  state: z.enum(shipCheckStates),
  retryAfterMs: z.number().int().min(0).max(120_000).optional(),
});
export type ShipCheckResult = z.infer<typeof shipCheckResultSchema>;

/** Collector cadence; a source older than three slots reads as stale. */
export const SHIP_INTERVAL_MS = 2 * 60_000;
export const SHIP_STALE_MS = 3 * SHIP_INTERVAL_MS;
export const SHIP_CHECK_INTERVAL_MS = 30_000;
