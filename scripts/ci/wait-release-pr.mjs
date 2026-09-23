import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import {
  DEFAULT_QUIET_MINUTES,
  evaluatePrState,
  getPr,
  getThreadCounts,
} from '../../plugins/tuturuuu/skills/tuturuuu-pr-merge-sync/scripts/watch_pr_ready.mjs';

export function releasePrReady(pr, counts, head, committedAt, now) {
  if (pr.headRefOid !== head || pr.state !== 'OPEN')
    throw new Error('Generated release PR changed; retry with a fresh plan');
  const quietWindowMs = DEFAULT_QUIET_MINUTES * 60_000;
  const state = evaluatePrState(pr, counts, now, quietWindowMs);
  if (state.failures.length || state.activeThreads)
    throw new Error(
      'Release PR has failed checks or unresolved review threads'
    );
  const lastActivity = Math.max(
    Date.parse(pr.updatedAt),
    Date.parse(committedAt)
  );
  return (
    state.ready &&
    pr.statusCheckRollup?.length > 0 &&
    pr.mergeable === 'MERGEABLE' &&
    now - lastActivity >= quietWindowMs
  );
}

async function main() {
  const repo = process.env.GITHUB_REPOSITORY;
  // biome-ignore lint/suspicious/noUndeclaredEnvVars: direct CI orchestration input, never a cached Turbo task
  const branch = process.env.MERGED_BRANCH;
  if (!repo || !branch?.startsWith('origin/release-please--branches--'))
    throw new Error('Expected a generated release branch');
  const run = (command, args) =>
    execFileSync(command, args, {
      encoding: 'utf8',
      timeout: 30_000,
    }).trim();
  const head = run('git', ['rev-parse', branch]);
  const committedAt = run('git', ['show', '-s', '--format=%cI', head]);
  const prs = JSON.parse(
    run('gh', [
      'pr',
      'list',
      '--repo',
      repo,
      '--head',
      branch.slice('origin/'.length),
      '--base',
      'production',
      '--state',
      'open',
      '--json',
      'number',
    ])
  );
  if (prs.length !== 1) throw new Error('Expected exactly one open release PR');
  const options = { repo, pr: String(prs[0].number) };
  const deadline = Date.now() + 90 * 60_000;
  while (Date.now() < deadline) {
    if (
      releasePrReady(
        getPr(run, options),
        getThreadCounts(run, options),
        head,
        committedAt,
        Date.now()
      )
    )
      return;
    console.log(
      `Waiting for release PR checks and a ${DEFAULT_QUIET_MINUTES}-minute quiet window`
    );
    await new Promise((resolve) => setTimeout(resolve, 60_000));
  }
  throw new Error('Release PR readiness timed out; nothing was merged');
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await main();
}
