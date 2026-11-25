// Main-push supersession for pure CI workflows.
//
// The workflows in main-supersession.json cancel an older main push run when a
// newer one starts. A push run's own before..after range covers only its push,
// so a superseding run must diff from the newest commit this workflow already
// validated green on main instead; otherwise the cancelled pushes' changes
// would go unchecked. Every failure to establish that base fails open: the
// caller treats the range as unknown and runs every check.
import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync, realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const SUPERSEDING_MAIN_WORKFLOWS = Object.freeze(
  JSON.parse(
    readFileSync(new URL('./main-supersession.json', import.meta.url), 'utf8')
  )
);

const SHA = /^[0-9a-f]{40}$/u;
// Runs inspected per lookup: one REST call, newest first.
export const LOOKUP_PAGE_SIZE = 20;

// The top-level workflow file of this run. In a reusable workflow,
// GITHUB_WORKFLOW_REF still names the caller that the run started from.
export function topLevelWorkflowFile(workflowRef = '') {
  const match = /\/\.github\/workflows\/([^/@]+)@/u.exec(workflowRef);
  return match ? match[1] : '';
}

// True when this run is a main push of a superseding workflow. Only the CI
// steps that resolve a change range set MAIN_SUPERSESSION_CHECK, so scripts
// and tests that inherit a main push environment keep their own ranges.
export function supersedesOnMain(env = process.env) {
  return (
    env.MAIN_SUPERSESSION_CHECK === 'true' &&
    env.GITHUB_EVENT_NAME === 'push' &&
    env.GITHUB_REF === 'refs/heads/main' &&
    SUPERSEDING_MAIN_WORKFLOWS.includes(
      topLevelWorkflowFile(env.GITHUB_WORKFLOW_REF)
    )
  );
}

function defaultIsAncestor(rootDir, base, head) {
  try {
    execFileSync(
      'git',
      ['-C', rootDir, 'merge-base', '--is-ancestor', base, head],
      { stdio: 'ignore' }
    );
    return true;
  } catch {
    return false;
  }
}

const failOpen = (reason) => ({ base: null, reason });

function runsUrl(env, repository, file) {
  const api = env.GITHUB_API_URL || 'https://api.github.com';
  const workflow = encodeURIComponent(file);
  return `${api}/repos/${repository}/actions/workflows/${workflow}/runs?branch=main&status=success&per_page=${LOOKUP_PAGE_SIZE}`;
}

// Returns { base } with the newest green main run's commit that is an
// ancestor of headSha, or { base: null, reason } to fail open.
export async function lastGreenMainBase({
  env = process.env,
  fetch: fetchImpl = globalThis.fetch,
  headSha = env.GITHUB_SHA,
  rootDir = process.cwd(),
  isAncestor = defaultIsAncestor,
} = {}) {
  const file = topLevelWorkflowFile(env.GITHUB_WORKFLOW_REF);
  const repository = env.GITHUB_REPOSITORY;
  const token = env.GITHUB_TOKEN || env.GH_TOKEN;
  if (!file || !repository || !SHA.test(headSha ?? ''))
    return failOpen('workflow, repository or head is unknown');
  if (!token) return failOpen('no token to read workflow runs');
  let runs;
  try {
    const response = await fetchImpl(runsUrl(env, repository, file), {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
      },
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok)
      return failOpen(`workflow runs lookup answered ${response.status}`);
    runs = (await response.json())?.workflow_runs;
  } catch (error) {
    return failOpen(`workflow runs lookup failed: ${String(error)}`);
  }
  if (!Array.isArray(runs))
    return failOpen('workflow runs lookup returned no list');
  for (const run of runs) {
    if (
      run?.conclusion !== 'success' ||
      run.head_branch !== 'main' ||
      // A dispatch can skip push-only jobs, so only a push run proves the
      // range it covered.
      run.event !== 'push' ||
      !SHA.test(run.head_sha ?? '') ||
      run.head_repository?.full_name !== repository
    )
      continue;
    if (run.head_sha === headSha || isAncestor(rootDir, run.head_sha, headSha))
      return { base: run.head_sha, runId: run.id };
  }
  return failOpen('no green main run is an ancestor of this commit');
}

function invokedDirectly() {
  try {
    return (
      import.meta.url ===
      pathToFileURL(realpathSync(process.argv[1] ?? '')).href
    );
  } catch {
    return false;
  }
}

// CLI: print the base SHA, or nothing when the range must fail open. With
// --github-output <file>, append `active` (whether this run supersedes) and
// `base` to that step output file instead.
if (invokedDirectly()) {
  const active = supersedesOnMain();
  const result = active
    ? await lastGreenMainBase()
    : failOpen('not a superseding main push');
  if (result.reason) console.error(`main supersession: ${result.reason}`);
  const outputIndex = process.argv.indexOf('--github-output');
  if (outputIndex !== -1)
    appendFileSync(
      process.argv[outputIndex + 1],
      `active=${active}\nbase=${result.base ?? ''}\n`
    );
  else if (result.base) process.stdout.write(`${result.base}\n`);
}
