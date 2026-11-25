// Shadow registration of a main push with the deployment coordinator's CI
// registry (apps/docs/build/devops/coordinator-ci-orchestration.mdx, slice 1).
//
// Computes, for every workflow a push to main starts, whether it would run:
// GitHub's push path filter (the parser in pr-blast-radius.mjs) and then the
// workflow's own tuturuuu.ts decision (getWorkflowDecision, the gate
// check-workflow-config.ts applies in CI). Posts that plan with the job's
// OIDC token. Observe only: every failure after the module loads is logged
// and the script exits 0; the workflow step continues on error regardless.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { appendFileSync, readFileSync, realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { AUDIENCE } from './deploy-coordinator-client.mjs';
import { lockfileWorkspaceDelta } from './lockfile-workspace-delta.ts';
import {
  fileSelectsWorkflow,
  loadMainPushWorkflows,
} from './pr-blast-radius.mjs';
import {
  readExtraWorkspaceEdges,
  readWorkspaceManifests,
} from './workflow-config-core.ts';

// Mirrors CI_LIMITS in apps/deploy-coordinator/src/ci-registry.ts.
export const LIMITS = {
  attempts: 3,
  maxPlanEntries: 120,
  maxBodyBytes: 16_384,
  reasonLength: 120,
  // 128 bits identify a closure; half a SHA-256 keeps the body small.
  closureKeyLength: 32,
};

const SHA = /^[0-9a-f]{40}$/u;
const ZERO = /^0{40}$/u;

// Real CI diffs these workflows from another commit than the push's
// `before` (scripts/ci/resolve-changed-files-core.ts): the Cloudflare
// production publishers from their last deployment marker, and the
// superseding checks from their last green main run. The shadow plan does
// not compute those ranges, so it marks the entry and never counts it as a
// saved or missed run.
export const RANGE_NOT_COMPUTED = 'range not computed: ';
const DEPLOYMENT_MARKER_WORKFLOW =
  /^(colab|coordination|cron-control|devbox-control|lettin|mastermind|meet|parley|tasks)-cloudflare\.yaml$/u;

export function uncomputedRange(file, superseding) {
  if (DEPLOYMENT_MARKER_WORKFLOW.test(file)) return 'deployment marker';
  if (superseding.includes(file)) return 'last green main run';
  return null;
}

// Answers the coordinator gives deliberately; retrying cannot change them.
const FINAL_ERRORS = new Set(['CI_OFF', 'COORDINATOR_OFF', 'STOPPED']);
const NO_PATH_MATCH = 'no changed path matches the push filter';

export function defaultGit(rootDir) {
  return (args) =>
    execFileSync('git', ['-C', rootDir, ...args], {
      encoding: 'utf8',
      maxBuffer: 256 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 60_000,
    });
}

// Files the push changed, or null when the range is unknown (a new branch,
// a force push whose `before` is gone, or any git failure).
export function changedFiles(git, before, sha) {
  if (!before || ZERO.test(before) || !SHA.test(before) || !SHA.test(sha))
    return null;
  try {
    return git(['diff', '--name-only', '-z', '--no-renames', before, sha])
      .split('\0')
      .filter(Boolean);
  } catch {
    return null;
  }
}

// The bun.lock narrowing check-workflow-config.ts applies: the workspaces
// whose resolution changed, or null (global) when it cannot be shown.
export function lockfileWorkspaces(git, files, before, sha) {
  if (!files?.includes('bun.lock')) return null;
  try {
    const show = (commit) => git(['show', `${commit}:bun.lock`]);
    const delta = lockfileWorkspaceDelta(show(before), show(sha));
    return delta.global ? null : delta.workspaces;
  } catch {
    return null;
  }
}

// Per workflow, a hash of the workflow file and of every file its push path
// filter selects at this commit: equal keys mean those inputs are identical.
// Files the workflow reads outside its filter are not covered.
export function closureKeys(git, sha, workflows) {
  const entries = git(['ls-tree', '-r', '-z', '--full-tree', sha])
    .split('\0')
    .filter(Boolean)
    .map((line) => {
      const tab = line.indexOf('\t');
      return {
        oid: line.slice(0, tab).split(' ')[2],
        path: line.slice(tab + 1),
      };
    });
  const keys = new Map();
  for (const workflow of workflows) {
    const own = `.github/workflows/${workflow.file}`;
    const hash = createHash('sha256');
    for (const entry of entries)
      if (entry.path === own || fileSelectsWorkflow(workflow, entry.path))
        hash.update(`${entry.path}\0${entry.oid}\n`);
    keys.set(
      workflow.file,
      hash.digest('hex').slice(0, LIMITS.closureKeyLength)
    );
  }
  return keys;
}

const clip = (text) =>
  text.length <= LIMITS.reasonLength
    ? text
    : `${text.slice(0, LIMITS.reasonLength - 3)}...`;

// One entry per main push workflow. A workflow the path filter does not
// select would not start; one it selects runs when its decision says so.
export function buildPlan({
  workflows,
  files,
  decide,
  keys = new Map(),
  superseding = [],
}) {
  return workflows.map((workflow) => {
    const range = uncomputedRange(workflow.file, superseding);
    if (range) {
      const entry = {
        workflow: workflow.file,
        run: true,
        reason: `${RANGE_NOT_COMPUTED}${range}`,
      };
      const key = keys.get(workflow.file);
      return key ? { ...entry, closureKey: key } : entry;
    }
    const selected =
      files === null ||
      files.some((file) => fileSelectsWorkflow(workflow, file));
    const decision = selected
      ? decide(workflow.file)
      : { shouldRun: false, reason: NO_PATH_MATCH };
    const entry = {
      workflow: workflow.file,
      run: decision.shouldRun,
      reason: clip(decision.reason.replace(/[\u0000-\u001f\u007f]/gu, ' ')),
    };
    const key = keys.get(workflow.file);
    return key ? { ...entry, closureKey: key } : entry;
  });
}

// The request body within the coordinator's bounds, or null when even the
// compact form does not fit. Closure keys go first, then reason detail.
export function fitBody(body) {
  const size = (value) => Buffer.byteLength(JSON.stringify(value));
  if (body.plan.length > LIMITS.maxPlanEntries) return null;
  if (size(body) <= LIMITS.maxBodyBytes) return body;
  const keyless = {
    ...body,
    plan: body.plan.map(({ closureKey: _key, ...entry }) => entry),
  };
  if (size(keyless) <= LIMITS.maxBodyBytes) return keyless;
  const short = {
    ...keyless,
    plan: keyless.plan.map((entry) => ({
      ...entry,
      reason: entry.reason.slice(0, 40),
    })),
  };
  return size(short) <= LIMITS.maxBodyBytes ? short : null;
}

// Retries network failures and 5xx only, a bounded number of times.
export async function request(fetchImpl, sleep, url, init) {
  let last = { ok: false, status: 0, body: null };
  for (let attempt = 1; attempt <= LIMITS.attempts; attempt += 1) {
    try {
      const response = await fetchImpl(url, {
        ...init,
        signal: AbortSignal.timeout(15_000),
      });
      const text = await response.text();
      let body = null;
      try {
        body = text ? JSON.parse(text) : null;
      } catch {
        body = null;
      }
      last = { ok: response.ok, status: response.status, body };
      if (response.status < 500 || FINAL_ERRORS.has(body?.error)) return last;
    } catch (error) {
      last = { ok: false, status: 0, body: { error: String(error) } };
    }
    if (attempt < LIMITS.attempts) await sleep(1_000 * 2 ** (attempt - 1));
  }
  return last;
}

export function computePlan({
  env,
  git,
  rootDir,
  getWorkflowDecision,
  superseding,
}) {
  const sha = env.GITHUB_SHA ?? '';
  let before = null;
  try {
    before = JSON.parse(readFileSync(env.GITHUB_EVENT_PATH, 'utf8')).before;
  } catch {
    before = null;
  }
  const files = changedFiles(git, before, sha);
  // This workflow registers; it is not part of the plan.
  const workflows = loadMainPushWorkflows(
    `${rootDir}/.github/workflows`
  ).filter((workflow) => workflow.file !== 'ci-register.yaml');
  const shared = {
    changedFiles: files,
    eventName: 'push',
    extraEdges: readExtraWorkspaceEdges(rootDir),
    lockfileWorkspaces: lockfileWorkspaces(git, files, before, sha),
    workspaceManifests: readWorkspaceManifests(rootDir),
  };
  let keys = new Map();
  try {
    keys = closureKeys(git, sha, workflows);
  } catch (error) {
    console.log(`Closure keys unavailable: ${String(error?.message ?? error)}`);
  }
  const plan = buildPlan({
    workflows,
    files,
    keys,
    superseding,
    decide: (workflowName) => getWorkflowDecision({ ...shared, workflowName }),
  });
  return {
    sha,
    before: before && SHA.test(before) && !ZERO.test(before) ? before : null,
    // The last-green base needs an actions: read token this job does not
    // hold; the plan is computed against the push's own range.
    base: null,
    plan,
  };
}

export async function register({
  env = process.env,
  fetch: fetchImpl = globalThis.fetch,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  rootDir = process.cwd(),
  git = defaultGit(rootDir),
  log = console.log,
} = {}) {
  if (env.DEPLOY_COORDINATOR_CI_MODE !== 'observe')
    return log('CI registration is off (DEPLOY_COORDINATOR_CI_MODE).');
  const origin = (env.DEPLOY_COORDINATOR_ORIGIN ?? '').replace(/\/+$/u, '');
  if (!/^https:\/\/[^/]+$/u.test(origin))
    return log('DEPLOY_COORDINATOR_ORIGIN is not an https origin.');
  if (!SHA.test(env.GITHUB_SHA ?? '')) return log('GITHUB_SHA is not a SHA.');
  // Loaded here so a module that fails to load is logged like any other
  // registration error instead of ending the process before main().
  const { getWorkflowDecision } = await import('../../tuturuuu.ts');
  const { SUPERSEDING_MAIN_WORKFLOWS } =
    await import('./main-supersession.mjs');
  const computed = computePlan({
    env,
    git,
    rootDir,
    getWorkflowDecision,
    superseding: SUPERSEDING_MAIN_WORKFLOWS,
  });
  const runs = computed.plan.filter((entry) => entry.run).length;
  log(
    `Shadow plan for ${computed.sha}: ${runs} of ${computed.plan.length} main push workflows would run.`
  );
  const body = fitBody(computed);
  if (!body)
    return log(
      `The plan (${computed.plan.length} workflows) exceeds the registry's bounds; not registered.`
    );

  const tokenUrl = env.ACTIONS_ID_TOKEN_REQUEST_URL;
  const tokenBearer = env.ACTIONS_ID_TOKEN_REQUEST_TOKEN;
  if (!tokenUrl || !tokenBearer)
    return log('No OIDC token is available (id-token: write).');
  const token = await request(
    fetchImpl,
    sleep,
    `${tokenUrl}${tokenUrl.includes('?') ? '&' : '?'}audience=${AUDIENCE}`,
    { method: 'GET', headers: { Authorization: `Bearer ${tokenBearer}` } }
  );
  if (!token.ok || typeof token.body?.value !== 'string')
    return log(`OIDC token request failed: ${token.status}.`);
  const response = await request(
    fetchImpl,
    sleep,
    `${origin}/v1/ci/main/registrations`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token.body.value}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    }
  );
  if (!response.ok)
    return log(
      `Registration answered ${response.status} ${response.body?.error ?? ''} ${response.body?.message ?? ''}`.trim()
    );
  log(
    response.body?.created
      ? 'Registered.'
      : 'Already registered; the stored record stands.'
  );
  if (env.GITHUB_STEP_SUMMARY)
    appendFileSync(
      env.GITHUB_STEP_SUMMARY,
      `CI registry: ${runs} of ${computed.plan.length} main push workflows would run for \`${computed.sha}\`.\n`
    );
  return response.body;
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

if (invokedDirectly()) {
  try {
    await register();
  } catch (error) {
    console.log(`CI registration error: ${String(error?.message ?? error)}`);
  }
  // Shadow mode never fails the job.
  process.exitCode = 0;
}
