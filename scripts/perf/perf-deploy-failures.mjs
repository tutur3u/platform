import { execFileSync } from 'node:child_process';

const REPO = 'tutur3u/platform';
const WORKFLOWS = ['vercel-production.yaml', 'vercel-production-platform.yaml'];

export function deploymentFailureRecords(runs, { since, until }) {
  return runs
    .filter(
      (run) =>
        run.conclusion === 'failure' &&
        Date.parse(run.updatedAt) >= Date.parse(since) &&
        Date.parse(run.updatedAt) <= Date.parse(until)
    )
    .map((run) => ({
      id: `perf-deploy-failure-${run.databaseId}`,
      type: 'production_deploy_failure',
      workflow: run.workflowName,
      sha: run.headSha,
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
          'conclusion,databaseId,headSha,updatedAt,url,workflowName',
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
