import { execFileSync } from 'node:child_process';
import {
  type DevboxFleetRunner,
  type DevboxFleetSnapshot,
  type DevboxRunnerBlocker,
  evaluateTrustedRunner,
} from '../devbox-fleet-types';
import type { TuturuuuUserClient } from '../platform';

export type OffloadBlocker =
  | 'local_saturated'
  | 'no_eligible_runner'
  | DevboxRunnerBlocker;
export const defaultOffloadTimeoutSeconds = 30 * 60;
const POLL_MS = 2000;

// Same wire format the runner decodes (devbox-commit-run.ts); the runner
// re-validates every field before any git or process work.
const COMMIT_RUN_ENVELOPE = '__ttr_commit_run_v1__';
export function commitRunCommand(sha: string, prefix: string, argv: string[]) {
  return [
    COMMIT_RUN_ENVELOPE,
    Buffer.from(
      JSON.stringify({
        v: 1,
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
  if (!git(['branch', '-r', '--contains', sha], cwd))
    throw new Error(
      `Offload requires a pushed commit: no remote-tracking branch contains ${sha.slice(0, 12)}. Push it first.`
    );
  return { sha, prefix: git(['rev-parse', '--show-prefix'], cwd) };
}

const blockerOrder: DevboxRunnerBlocker[] = [
  'trust_cap',
  'capability_missing',
  'draining',
  'stale_heartbeat',
  'offline',
];
// Picks the least busy eligible trusted runner, or explains the closest
// blocker so operators know what to fix.
export function selectOffloadRunner(
  snapshot: DevboxFleetSnapshot,
  requested: string,
  now = Date.now()
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
// remotely on timeout or interruption, and returns its exit code. No local
// environment values are sent.
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
}) {
  // The bound covers queueing, execution and log drain from this moment.
  const deadline = Date.now() + (timeoutSeconds + 60) * 1000;
  const created = await client.devboxes.createRun({
    command: commitRunCommand(sha, prefix, argv),
    leaseMode: 'auto',
    runnerId,
    timeoutSeconds,
    workload: 'run',
  });
  const runId = created.run.id;
  log(`offloaded to runner ${runnerId} as run ${runId} at ${sha.slice(0, 12)}`);
  let interrupted: number | undefined;
  const handlers = (['SIGINT', 'SIGTERM'] as const).map((signal) => {
    const handler = () => {
      interrupted = signal === 'SIGINT' ? 130 : 143;
    };
    process.on(signal, handler);
    return [signal, handler] as const;
  });
  let printed = 0;
  let status = created.run.status;
  let exitCode = created.run.exitCode;
  try {
    for (;;) {
      const logs = (await client.devboxes.getRunLogs(runId)).logs;
      for (const line of logs.slice(printed)) write(`${line}\n`);
      printed = Math.max(printed, logs.length);
      if (['succeeded', 'failed', 'cancelled'].includes(status)) break;
      if (interrupted || Date.now() >= deadline) {
        await client.devboxes.stopRun(runId).catch(() => undefined);
        log(
          interrupted
            ? `interrupted; stop requested for run ${runId}`
            : `timed out; stop requested for run ${runId}`
        );
        return interrupted ?? 124;
      }
      await new Promise((resolve) => setTimeout(resolve, pollMs));
      const latest = await client.devboxes.getRun(runId);
      status = latest.run.status;
      exitCode = latest.run.exitCode;
    }
  } finally {
    for (const [signal, handler] of handlers)
      process.removeListener(signal, handler);
  }
  if (typeof exitCode === 'number') return exitCode;
  return status === 'succeeded' ? 0 : status === 'cancelled' ? 143 : 1;
}

export async function createSessionClient() {
  const [{ readCliConfig, resolveCliTasksBaseUrl, writeCliConfig }, platform] =
    await Promise.all([import('./config'), import('../platform')]);
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
