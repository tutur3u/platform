import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import {
  evaluateRunState,
  getRuns,
} from '../../plugins/tuturuuu/skills/tuturuuu-pr-merge-sync/scripts/watch_branch_runs.mjs';

export async function waitReleaseMain({
  repository,
  currentRun,
  run = (command, args) =>
    execFileSync(command, args, { encoding: 'utf8', timeout: 30_000 }).trim(),
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  now = Date.now,
  log = console.log,
  timeoutMs = 90 * 60_000,
}) {
  const commit = run('git', ['rev-parse', 'HEAD']);
  const options = { repo: repository, branch: 'main', commit };
  const deadline = now() + timeoutMs;
  let previousReadyIds = '';
  while (now() < deadline) {
    const remote = run('git', ['ls-remote', 'origin', 'refs/heads/main']).split(
      /\s+/
    )[0];
    if (remote !== commit)
      throw new Error(
        'Main changed after release validation; production was not promoted'
      );
    // A retry/no-op can run on the same SHA it is checking. Waiting for this
    // orchestration run itself would deadlock; all other runs remain required.
    const runs = getRuns(run, options).filter(
      (entry) => String(entry.databaseId) !== String(currentRun)
    );
    const state = evaluateRunState(runs, options);
    log(state.summary);
    if (state.failures.length)
      throw new Error('Main CI failed; production was not promoted');
    const ids = state.ready
      ? runs
          .map((entry) => entry.databaseId)
          .sort()
          .join(',')
      : '';
    // Require a second settled observation so late push workflows can register.
    if (ids && ids === previousReadyIds) return commit;
    previousReadyIds = ids;
    await sleep(30_000);
  }
  throw new Error('Timed out waiting for main CI; production was not promoted');
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await waitReleaseMain({
    repository: process.env.GITHUB_REPOSITORY,
    currentRun: process.env.GITHUB_RUN_ID,
  });
}
