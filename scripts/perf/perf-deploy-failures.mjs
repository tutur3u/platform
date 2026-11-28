import { execFileSync } from 'node:child_process';

const REPO = 'tutur3u/platform';
const WORKFLOWS = ['vercel-production.yaml', 'vercel-production-platform.yaml'];

/**
 * Decision (startedAt vs createdAt vs updatedAt):
 * - `updatedAt` moves whenever GitHub touches a run's metadata (retention
 *   expiry, log purge, annotations), so March runs 23586386392 and 23585501438
 *   updated in November would read as fresh production failures if filtered on
 *   `updatedAt`.
 * - `createdAt` never moves on metadata updates, but it also stays fixed on a
 *   rerun (`attempt > 1`), which would drop a rerun of an older run that fails
 *   inside the current detection window.
 * - `startedAt` (`run_started_at`) stays at March on metadata updates (both
 *   March runs have `startedAt` in 2026-03-26) AND advances to the rerun's
 *   execution time when an older run is re-run.
 * Therefore we filter by `startedAt ?? createdAt`, and fail closed (ignore)
 * when neither timestamp is parseable.
 *
 * Known fetch-horizon limit: `gh run list --limit 100` returns the 100 most
 * recently CREATED failed runs per workflow (GitHub orders by `created_at`
 * descending, which reaches back ~6 weeks for `vercel-production.yaml`). A
 * rerun of a run created earlier than the 100th most recent failure will not
 * be returned by this bounded query.
 */
export function deploymentFailureRecords(runs, { since, until }) {
  const from = Date.parse(since);
  const to = Date.parse(until);
  return runs
    .filter((run) => {
      const runTime = Date.parse(run.startedAt ?? run.createdAt);
      return (
        run.conclusion === 'failure' &&
        Number.isFinite(runTime) &&
        runTime >= from &&
        runTime <= to
      );
    })
    .map((run) => ({
      id: `perf-deploy-failure-${run.databaseId}`,
      type: 'production_deploy_failure',
      workflow: run.workflowName,
      sha: run.headSha,
      createdAt: run.createdAt ?? null,
      ...(run.startedAt ? { startedAt: run.startedAt } : {}),
      ...(Number.isInteger(run.attempt) ? { attempt: run.attempt } : {}),
      failedAt: run.updatedAt,
      runUrl: run.url,
    }));
}

export function fetchProductionFailures(range) {
  const runs = WORKFLOWS.flatMap((workflow) =>
    JSON.parse(
      execFileSync(
        'gh',
        [
          'run',
          'list',
          '--repo',
          REPO,
          '--workflow',
          workflow,
          '--branch',
          'production',
          '--status',
          'failure',
          '--limit',
          '100',
          '--json',
          'attempt,conclusion,createdAt,databaseId,headSha,startedAt,updatedAt,url,workflowName',
        ],
        {
          encoding: 'utf8',
          timeout: 30_000,
          stdio: ['ignore', 'pipe', 'ignore'],
        }
      )
    )
  );
  return deploymentFailureRecords(runs, range);
}
