import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import {
  COMMIT_RUN_PROTOCOL_VERSION,
  type DevboxFleetRunner,
  type DevboxFleetSnapshot,
  type DevboxRunnerBlocker,
  evaluateTrustedRunner,
  fleetSnapshotNow,
} from '../devbox-fleet-types';
import type { TuturuuuUserClient } from '../platform';
import {
  OFFLOAD_REQUEST_TIMEOUT_MS,
  offloadLogsSchema,
  offloadPause,
  offloadRequest,
  offloadRunIdSchema,
  offloadRunSchema,
  offloadStopByKeySchema,
} from './resources-offload-control';

export { offloadRequest } from './resources-offload-control';

export type OffloadBlocker =
  | 'local_saturated'
  | 'no_eligible_runner'
  | DevboxRunnerBlocker;
export const defaultOffloadTimeoutSeconds = 30 * 60;
const POLL_MS = 2000;
// Must match the server's run-log page size (DEVBOX_RUN_LOG_PAGE_SIZE).
const LOG_PAGE_SIZE = 1000;
// Consecutive control-plane failures tolerated while following a run before
// it is stopped remotely.
const MAX_FOLLOW_FAILURES = 5;
// Overall bound for cancelling an unacknowledged create by its operation key.
const STOP_BY_KEY_BUDGET_MS = 10_000;
const STOP_BY_KEY_ATTEMPTS = 3;

function errorStatus(error: unknown) {
  return error && typeof error === 'object' && 'status' in error
    ? error.status
    : undefined;
}

/**
 * The run was never confirmed created. `rejected` means the server refused it
 * (a definite client rejection), so no remote run exists and `--offload auto` may queue locally; any
 * other failure is ambiguous and must not fall back, or the command could run
 * twice.
 */
export class OffloadNotCreatedError extends Error {
  constructor(
    readonly cause: unknown,
    readonly rejected: boolean
  ) {
    super(
      `offload run was not created: ${cause instanceof Error ? cause.message : String(cause)}`
    );
    this.name = 'OffloadNotCreatedError';
  }
}

// Same wire format the runner decodes (devbox-commit-run.ts); the runner
// re-validates every field before any git or process work.
const COMMIT_RUN_ENVELOPE = '__ttr_commit_run_v1__';
export function commitRunCommand(sha: string, prefix: string, argv: string[]) {
  return [
    COMMIT_RUN_ENVELOPE,
    Buffer.from(
      JSON.stringify({
        v: COMMIT_RUN_PROTOCOL_VERSION,
        sha,
        prefix: prefix.replace(/\/+$/u, ''),
        command: argv,
      })
    ).toString('base64url'),
  ];
}

type Git = (args: string[], cwd: string) => string;
const realGit: Git = (args, cwd) =>
  execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    timeout: 15_000,
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
// Offload runs the exact pushed HEAD; local edits never leave this machine.
export function offloadCommitPlan(cwd: string, git: Git = realGit) {
  let sha: string;
  try {
    sha = git(['rev-parse', '--verify', 'HEAD^{commit}'], cwd);
  } catch {
    throw new Error('Offload requires a Git checkout with a commit.');
  }
  if (git(['status', '--porcelain', '--untracked-files=no'], cwd))
    throw new Error(
      'Offload refuses a dirty tree: commit and push tracked changes first (untracked files are never sent).'
    );
  // Only origin is the canonical repository the runner fetches from; another
  // remote (for example a fork) would let an unreviewed commit through.
  if (
    !git(
      [
        'for-each-ref',
        '--contains',
        sha,
        '--format=%(refname)',
        'refs/remotes/origin/',
      ],
      cwd
    )
  )
    throw new Error(
      `Offload requires a pushed commit: no origin/* branch contains ${sha.slice(0, 12)}. Push it to origin first.`
    );
  return { sha, prefix: git(['rev-parse', '--show-prefix'], cwd) };
}

// Actionable blockers first: an operator can restart a stale or offline
// agent, undrain it or enable `run`, but a Judge/playground identity (trust
// cap) is never a fix target.
const blockerOrder: DevboxRunnerBlocker[] = [
  'stale_heartbeat',
  'offline',
  'draining',
  'capability_missing',
  'trust_cap',
];
// Picks the least busy eligible trusted runner, or explains the closest
// blocker so operators know what to fix.
export function selectOffloadRunner(
  snapshot: DevboxFleetSnapshot,
  requested: string,
  now = fleetSnapshotNow(snapshot)
):
  | { runner: DevboxFleetRunner }
  | { blockedBy: OffloadBlocker; reason: string } {
  const candidates = snapshot.runners.filter(
    (runner) =>
      runner.status !== 'revoked' &&
      (requested === 'auto' || runner.id === requested)
  );
  if (requested !== 'auto' && !candidates.length)
    return {
      blockedBy: 'no_eligible_runner',
      reason: `runner ${requested} is not in the fleet`,
    };
  const evaluated = candidates.map((runner) => ({
    runner,
    verdict: evaluateTrustedRunner(runner, now),
  }));
  const load = (runner: DevboxFleetRunner) =>
    runner.activity
      ? runner.activity.running_runs + runner.activity.queued_runs
      : snapshot.runs.filter(
          (run) =>
            run.runner_id === runner.id &&
            ['queued', 'claimed', 'running'].includes(run.status)
        ).length;
  const eligible = evaluated
    .filter((entry) => entry.verdict.eligible)
    .sort((a, b) => load(a.runner) - load(b.runner));
  if (eligible[0]) return { runner: eligible[0].runner };
  for (const blocker of blockerOrder) {
    const match = evaluated.find(
      (entry) => entry.verdict.blockedBy === blocker
    );
    if (match)
      return {
        blockedBy: blocker,
        reason: `${match.runner.name} (${match.runner.id}): ${match.verdict.reason}`,
      };
  }
  return {
    blockedBy: 'no_eligible_runner',
    reason: 'no trusted-development runners are registered',
  };
}

// Creates a pinned box run of the exact commit, streams its logs, stops it
// remotely on timeout, interruption or lost control-plane contact, and returns
// its exit code. Once the run exists this never throws: callers must not fall
// back to a local run. No local environment values are sent.
export async function runBoxOffload({
  client,
  runnerId,
  sha,
  prefix,
  argv,
  timeoutSeconds,
  write = (text: string) => process.stdout.write(text),
  log = (text: string) => process.stderr.write(`[ttr resources] ${text}\n`),
  pollMs = POLL_MS,
  stopRetryMs = 1000,
  operationId = randomUUID(),
}: {
  client: Pick<TuturuuuUserClient, 'devboxes'>;
  runnerId: string;
  sha: string;
  prefix: string;
  argv: string[];
  timeoutSeconds: number;
  write?: (text: string) => void;
  log?: (text: string) => void;
  pollMs?: number;
  stopRetryMs?: number;
  /** Idempotency key for the create; generated per offload. */
  operationId?: string;
}) {
  const deadline = Date.now() + (timeoutSeconds + 60) * 1000;
  let interrupted: number | undefined;
  const cancellation = new AbortController();
  const handlers = (['SIGINT', 'SIGTERM'] as const).map((signal) => {
    const handler = () => {
      interrupted ??= signal === 'SIGINT' ? 130 : 143;
      cancellation.abort(new Error('offload interrupted'));
    };
    process.on(signal, handler);
    return [signal, handler] as const;
  });
  const terminalCode = () =>
    interrupted ?? (Date.now() >= deadline ? 124 : undefined);
  const request = <T>(operation: (signal: AbortSignal) => Promise<T>) =>
    offloadRequest(operation, {
      signal: cancellation.signal,
      timeoutMs: Math.min(
        OFFLOAD_REQUEST_TIMEOUT_MS,
        Math.max(1, deadline - Date.now())
      ),
    });
  let runId: string | undefined;
  const stop = async (reason: string) => {
    if (!runId) return;
    const id = runId;
    try {
      await offloadRequest((signal) => client.devboxes.stopRun(id, { signal }));
      log(`${reason}; stop requested for run ${id}`);
    } catch {
      log(
        `${reason}; stop could not be confirmed for run ${id}; check ttr box list`
      );
    }
  };
  // The create may have succeeded remotely even though its acknowledgement was
  // lost (Ctrl-C, timeout, dropped connection). The server dedupes on the
  // operation key, so cancel by key; a 404 can mean the create is still in
  // flight, so retry briefly before reporting that cancellation is unconfirmed.
  const stopByKey = async (reason: string) => {
    const budgetEnd = Date.now() + STOP_BY_KEY_BUDGET_MS;
    for (let attempt = 1; attempt <= STOP_BY_KEY_ATTEMPTS; attempt += 1) {
      try {
        const stopped = offloadStopByKeySchema.safeParse(
          await offloadRequest(
            (signal) => client.devboxes.stopRunByKey(operationId, { signal }),
            {
              timeoutMs: Math.min(
                OFFLOAD_REQUEST_TIMEOUT_MS,
                Math.max(1, budgetEnd - Date.now())
              ),
            }
          )
        );
        log(
          `${reason}; stop requested for run ${stopped.success ? stopped.data.runId : '(id not returned)'} (operation ${operationId})`
        );
        return;
      } catch (error) {
        if (
          errorStatus(error) !== 404 ||
          attempt === STOP_BY_KEY_ATTEMPTS ||
          budgetEnd - Date.now() <= stopRetryMs
        )
          break;
        await new Promise((resolve) => setTimeout(resolve, stopRetryMs));
      }
    }
    log(
      `${reason}; the run may exist remotely and its cancellation was not confirmed. Operation key ${operationId}: find the run with \`ttr box list\` and stop it with \`ttr box stop <run-id>\`.`
    );
  };
  try {
    let created: unknown;
    try {
      // Keep creation bounded, but allow it to acknowledge an id after Ctrl-C
      // so that cancellation can stop the original run instead of orphaning it.
      created = await offloadRequest(
        (signal) =>
          client.devboxes.createRun(
            {
              command: commitRunCommand(sha, prefix, argv),
              idempotencyKey: operationId,
              leaseMode: 'auto',
              runnerId,
              timeoutSeconds,
              workload: 'run',
            },
            { signal }
          ),
        {
          timeoutMs: Math.min(
            OFFLOAD_REQUEST_TIMEOUT_MS,
            Math.max(1, deadline - Date.now())
          ),
        }
      );
    } catch (error) {
      const status = errorStatus(error);
      const rejected =
        typeof status === 'number' &&
        [400, 401, 403, 404, 405, 409, 413, 415, 422, 429].includes(status);
      const code = terminalCode();
      // Only a definite rejection proves no run exists; anything else may have
      // created one that nobody will follow.
      if (!rejected)
        await stopByKey(
          code === undefined
            ? 'creation was not acknowledged'
            : code === 124
              ? 'timed out before creation was acknowledged'
              : 'interrupted before creation was acknowledged'
        );
      if (code !== undefined) return code;
      throw new OffloadNotCreatedError(error, rejected);
    }
    try {
      const identity = offloadRunIdSchema.safeParse(created);
      if (identity.success) runId = identity.data.run.id;
      else
        log(
          'Remote creation has no usable run ID; check ttr box list before retrying.'
        );
      const initial = offloadRunSchema.parse(created);
      runId = initial.run.id;
      log(
        `offloaded to runner ${runnerId} as run ${runId} at ${sha.slice(0, 12)}`
      );
      let offset = 0;
      let legacyPrinted = 0;
      const checkTerminal = () => {
        if (terminalCode() !== undefined)
          throw new Error('offload interrupted or timed out');
      };
      const drainLogs = async () => {
        for (;;) {
          checkTerminal();
          const page = offloadLogsSchema.parse(
            await request((signal) =>
              client.devboxes.getRunLogs(initial.run.id, { offset, signal })
            )
          );
          checkTerminal();
          if (typeof page.next !== 'number' || page.next < offset) {
            for (const line of page.logs.slice(legacyPrinted))
              write(`${line}\n`);
            legacyPrinted = Math.max(legacyPrinted, page.logs.length);
            return;
          }
          for (const line of page.logs) write(`${line}\n`);
          const rows = page.next - offset;
          offset = page.next;
          if (rows < LOG_PAGE_SIZE) return;
        }
      };
      let { status, exitCode } = initial.run;
      let failures = 0;
      for (;;) {
        try {
          checkTerminal();
          await drainLogs();
          checkTerminal();
          if (['succeeded', 'failed', 'cancelled'].includes(status)) break;
          await offloadPause(pollMs, cancellation.signal);
          checkTerminal();
          const latest = offloadRunSchema.parse(
            await request((signal) =>
              client.devboxes.getRun(initial.run.id, { signal })
            )
          );
          if (latest.run.id !== runId)
            throw new Error('offload run identity changed');
          ({ status, exitCode } = latest.run);
          failures = 0;
        } catch (error) {
          failures += 1;
          const code = terminalCode();
          if (failures >= MAX_FOLLOW_FAILURES || code !== undefined) {
            await stop(
              `lost contact (${error instanceof Error ? error.message : String(error)})`
            );
            return interrupted ?? code ?? 1;
          }
          await offloadPause(pollMs, cancellation.signal);
        }
      }
      return (
        interrupted ??
        (typeof exitCode === 'number'
          ? exitCode
          : status === 'succeeded'
            ? 0
            : status === 'cancelled'
              ? 143
              : 1)
      );
    } catch (error) {
      await stop(
        `invalid acknowledgement or follow failure (${error instanceof Error ? error.message : String(error)})`
      );
      return terminalCode() ?? 1;
    }
  } finally {
    for (const [signal, handler] of handlers)
      process.removeListener(signal, handler);
  }
}

export async function createSessionClient() {
  const [{ readCliConfig, resolveCliTasksBaseUrl, writeCliConfig }, platform] =
    await Promise.all([import('./config.js'), import('../platform.js')]);
  const config = await readCliConfig();
  if (!config.session?.accessToken || !config.session.refreshToken)
    throw new Error('Offload needs a devbox session. Run `ttr login` first.');
  return new platform.TuturuuuUserClient({
    accessToken: config.session.accessToken,
    baseUrl: config.baseUrl,
    expiresAt: config.session.expiresAt,
    onSessionRefresh: async (session) => {
      await writeCliConfig({ ...config, session });
    },
    refreshToken: config.session.refreshToken,
    tasksBaseUrl: config.tasksBaseUrl ?? resolveCliTasksBaseUrl(config.baseUrl),
  });
}
