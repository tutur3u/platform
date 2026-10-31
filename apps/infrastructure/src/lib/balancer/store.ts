import {
  BALANCER_RUN_STATES,
  type BalancerRunState,
  RUN_ID_PATTERN,
} from '@tuturuuu/devbox/balancer';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { z } from 'zod';

// Published balancer runs are a read model: controllers publish each run's
// newest revision, and the database keeps only newer revisions from the same
// publisher. Nothing here places, admits or retries work.
type PrivateClient = {
  from: (table: string) => {
    select: (columns: string) => {
      order: (
        column: string,
        options: { ascending: boolean }
      ) => {
        limit: (count: number) => Promise<{
          data: unknown[] | null;
          error: { message?: string } | null;
        }>;
      };
    };
  };
  rpc: (
    fn: string,
    args: Record<string, unknown>
  ) => Promise<{ data: unknown; error: { message?: string } | null }>;
};
async function privateClient() {
  const admin = await createAdminClient({ noCookie: true });
  return (
    admin as unknown as { schema: (schema: string) => PrivateClient }
  ).schema('private');
}

const sha = z.string().regex(/^[0-9a-f]{40}$/u);
const transition = z.object({
  at: z.string().max(40),
  from: z.enum(BALANCER_RUN_STATES).nullable(),
  to: z.enum(BALANCER_RUN_STATES),
  reason: z.string().max(500).optional(),
});
const result = z.object({
  resultId: z.string().uuid(),
  runId: z.string().regex(RUN_ID_PATTERN),
  fence: z.number().int().min(1),
  status: z.enum([
    'succeeded',
    'failed',
    'cancelled',
    'setup_failed',
    'rejected',
  ]),
  exitCode: z.number().int().nullable(),
  phase: z.enum(['admission', 'setup', 'command', 'supervisor']),
  startedAt: z.string().max(40).optional(),
  finishedAt: z.string().max(40),
  logBytes: z.number().int().min(0).optional(),
  logSha256: z
    .string()
    .regex(/^[0-9a-f]{64}$/u)
    .optional(),
  reason: z.string().max(500).optional(),
});
export const publishedRunSchema = z.object({
  runId: z.string().regex(RUN_ID_PATTERN),
  requestId: z.string().regex(/^[A-Za-z0-9_-]{16,128}$/u),
  replica: z.number().int().min(1).max(8),
  revision: z.number().int().min(1),
  state: z.enum(BALANCER_RUN_STATES),
  purpose: z.string().max(32),
  source: z.object({ repo: z.string().max(201), baseSha: sha }),
  sourceId: z.string().regex(/^[0-9a-f]{64}$/u),
  command: z.array(z.string().max(8192)).min(1).max(256),
  cwd: z.string().max(512),
  priority: z.number().int().min(0).max(9),
  requester: z.object({
    kind: z.enum(['user', 't3-thread']),
    threadId: z.string().max(256).optional(),
    taskId: z.string().max(256).optional(),
  }),
  deviceId: z.string().max(64).optional(),
  lease: z
    .object({ leaseId: z.string().uuid(), fence: z.number().int().min(1) })
    .passthrough()
    .optional(),
  result: result.optional(),
  blockedBy: z.string().max(2000).optional(),
  history: z.array(transition).max(200),
  consumedBy: z
    .array(
      z.object({
        threadId: z.string().max(256),
        resultId: z.string().uuid(),
        consumedAt: z.string().max(40),
      })
    )
    .max(64),
  queuedAt: z.string().max(40),
});
export const publishRequestSchema = z.object({
  runs: z.array(publishedRunSchema).min(1).max(50),
});
export type PublishedRun = z.infer<typeof publishedRunSchema>;

export async function publishBalancerRuns(
  publisher: string,
  runs: PublishedRun[]
) {
  const client = await privateClient();
  const outcomes: { runId: string; applied: boolean }[] = [];
  for (const run of runs) {
    const { data, error } = await client.rpc('publish_balancer_run', {
      p_publisher: publisher,
      p_run: run,
    });
    if (error) throw new Error('Could not publish the balancer run.');
    outcomes.push({ runId: run.runId, applied: data === true });
  }
  return outcomes;
}

export interface BalancerRunRow {
  run_id: string;
  request_id: string;
  replica: number;
  revision: number;
  state: BalancerRunState;
  purpose: string;
  source_repo: string;
  source_sha: string;
  source_id: string;
  command: string[];
  cwd: string;
  priority: number;
  requester: { kind?: string; threadId?: string; taskId?: string };
  device_id: string | null;
  lease_id: string | null;
  fence: number | null;
  result: z.infer<typeof result> | null;
  blocked_by: string | null;
  history: z.infer<typeof transition>[];
  queued_at: string;
  published_at: string;
}

export async function listBalancerRuns(limit = 100): Promise<BalancerRunRow[]> {
  const client = await privateClient();
  const { data, error } = await client
    .from('balancer_runs')
    .select(
      'run_id, request_id, replica, revision, state, purpose, source_repo, source_sha, source_id, command, cwd, priority, requester, device_id, lease_id, fence, result, blocked_by, history, queued_at, published_at'
    )
    .order('published_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error('Could not load balancer runs.');
  return (data ?? []) as BalancerRunRow[];
}
