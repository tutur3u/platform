const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const {
  getChangedPublishablePackages,
  getLatestCommitChangedFiles,
} = require('./package-release-readiness.js');

const {
  waitForPackageVisibility,
} = require('./wait-production-package-visibility');

const PLANNER = 'vercel-production.yaml';
const RESUME_TITLE = 'Production package resume ';
const INTENT_ENVIRONMENT = 'production-package-resume';

const DEADLINE_MS = 240_000;
const CALL_TIMEOUT_MS = 15_000;

function createApi(
  env,
  fetchImpl = globalThis.fetch,
  {
    now = Date.now,
    totalTimeoutMs = DEADLINE_MS,
    requestTimeoutMs = CALL_TIMEOUT_MS,
  } = {}
) {
  const deadline = now() + totalTimeoutMs;
  const base = `${env.GITHUB_API_URL || 'https://api.github.com'}/repos/${env.GITHUB_REPOSITORY}`;
  return async (route, options = {}) => {
    const remaining = deadline - now();
    if (remaining <= 0) throw new Error('Production resume deadline exceeded');
    const controller = new AbortController();
    let timer;
    try {
      return await Promise.race([
        (async () => {
          const response = await fetchImpl(`${base}/${route}`, {
            ...options,
            signal: controller.signal,
            headers: {
              Authorization: `Bearer ${env.GH_TOKEN || env.GITHUB_TOKEN}`,
              'Content-Type': 'application/json',
              'X-GitHub-Api-Version': '2022-11-28',
            },
          });
          if (!response.ok)
            throw new Error(`GitHub ${route}: ${response.status}`);
          return response.status === 204 ? null : await response.json();
        })(),
        new Promise((_, reject) => {
          timer = setTimeout(
            () => {
              controller.abort();
              reject(new Error('GitHub request timeout; no recovery retry'));
            },
            Math.min(requestTimeoutMs, remaining)
          );
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  };
}

function boundedVersionExists({ packageName, packageVersion, deadline }) {
  const remaining = deadline - Date.now();
  if (remaining <= 0) throw new Error('Production resume deadline exceeded');
  return (
    spawnSync(
      'npm',
      [
        'view',
        `${packageName}@${packageVersion}`,
        'version',
        '--registry',
        'https://registry.npmjs.org',
      ],
      {
        encoding: 'utf8',
        stdio: 'pipe',
        timeout: Math.min(CALL_TIMEOUT_MS, remaining),
      }
    ).status === 0
  );
}

async function listPages(api, route, key) {
  const rows = [];
  for (let page = 1; page <= 10; page++) {
    const payload = await api(
      `${route}${route.includes('?') ? '&' : '?'}per_page=100&page=${page}`
    );
    const pageRows = key == null ? payload : payload[key];
    if (!Array.isArray(pageRows))
      throw new Error(`Unreadable ${key ?? 'deployments'}`);
    rows.push(...pageRows);
    if (pageRows.length < 100) return rows;
  }
  throw new Error(`Incomplete ${key} pagination; no deployment dispatched`);
}

function wasPackageDeferred(jobs) {
  const platform = jobs.find(
    (job) => job.name === 'deploy-platform / Deploy-Production'
  );
  return (
    platform?.conclusion === 'success' &&
    platform.steps?.some(
      (step) =>
        step.name === 'Skip build while package releases publish' &&
        step.conclusion === 'success'
    ) &&
    !platform.steps?.some(
      (step) =>
        step.name === 'Promote verified production deployment' &&
        step.conclusion === 'success'
    )
  );
}

async function completedIntentRuns({ api, intents, runs, sha, repository }) {
  for (const intent of intents) {
    if (
      !Number.isSafeInteger(intent.id) ||
      intent.id <= 0 ||
      intent.payload?.purpose !== 'production-package-resume' ||
      intent.payload?.sha !== sha
    )
      return false;
    const title = `${RESUME_TITLE}${sha} intent ${intent.id}`;
    const matches = runs.filter((run) => run.display_title === title);
    if (matches.length !== 1) return false;
    const run = matches[0];
    if (
      run.status !== 'completed' ||
      run.conclusion !== 'success' ||
      !Number.isSafeInteger(run.run_attempt) ||
      run.run_attempt < 1
    )
      return false;
    const live = await api(`actions/runs/${run.id}`);
    if (
      live.head_sha !== sha ||
      live.head_branch !== 'production' ||
      live.head_repository?.full_name !== repository ||
      live.name !== 'Production Deployment Planner' ||
      live.event !== 'workflow_dispatch' ||
      live.display_title !== title ||
      live.status !== 'completed' ||
      live.conclusion !== 'success' ||
      live.run_attempt !== run.run_attempt
    )
      return false;
    const jobs = await listPages(
      api,
      `actions/runs/${run.id}/jobs?filter=latest`,
      'jobs'
    );
    if (!wasPackageDeferred(jobs)) return false;
  }
  // Legacy, unbound, or extra resumed runs cannot establish dispatch ownership.
  return runs.every(
    (run) =>
      !run.display_title?.startsWith(RESUME_TITLE) ||
      intents.some(
        (intent) =>
          run.display_title === `${RESUME_TITLE}${sha} intent ${intent.id}`
      )
  );
}

async function resumeProductionDeployment({
  event,
  env = process.env,
  repoRoot = process.cwd(),
  api = createApi(env),
  changedPackages,
  versionExists = boundedVersionExists,
  now = Date.now,
  totalTimeoutMs = DEADLINE_MS,
  sleep,
  logger = console,
}) {
  const deadline = now() + totalTimeoutMs;
  const trigger = event.workflow_run;
  const sha = trigger?.head_sha;
  const skip = (reason) => {
    logger.log(`Production package resume skipped: ${reason}.`);
    return { dispatched: false, reason };
  };
  if (
    !/^[a-f0-9]{40}$/u.test(sha || '') ||
    trigger?.head_branch !== 'production' ||
    trigger?.head_repository?.full_name !== env.GITHUB_REPOSITORY ||
    typeof trigger?.conclusion !== 'string' ||
    (trigger.name === 'Production Deployment Planner' &&
      trigger.conclusion !== 'success') ||
    !['push', 'workflow_dispatch'].includes(trigger?.event)
  ) {
    return skip('untrusted completion');
  }
  const live = await api(`actions/runs/${trigger.id}`);
  if (
    live.status !== 'completed' ||
    live.conclusion !== trigger.conclusion ||
    live.head_sha !== sha ||
    live.run_attempt !== trigger.run_attempt ||
    live.head_branch !== 'production' ||
    live.head_repository?.full_name !== env.GITHUB_REPOSITORY ||
    live.name !== trigger.name ||
    live.event !== trigger.event
  ) {
    return skip('completion changed');
  }
  const allowed =
    trigger.name === 'Production Deployment Planner' ||
    /^Release (?:@tuturuuu\/[^ ]+|tuturuuu) package$/u.test(trigger.name || '');
  if (!allowed) return skip('unrecognized workflow');
  const current = await api('git/ref/heads/production');
  if (current.object?.sha !== sha) return skip('production moved');
  const intents = await listPages(
    api,
    `deployments?sha=${sha}&environment=${INTENT_ENVIRONMENT}`,
    null
  );
  const exactIntents = intents.filter(
    (intent) => intent.sha === sha && intent.environment === INTENT_ENVIRONMENT
  );
  const runs = await listPages(
    api,
    `actions/workflows/${PLANNER}/runs?head_sha=${sha}&branch=production`,
    'workflow_runs'
  );
  const exact = runs.filter(
    (run) => run.head_sha === sha && run.head_branch === 'production'
  );
  if (exact.some((run) => run.status !== 'completed'))
    return skip('planner active');
  if (
    !(await completedIntentRuns({
      api,
      intents: exactIntents,
      runs: exact,
      sha,
      repository: env.GITHUB_REPOSITORY,
    }))
  ) {
    return skip(
      exactIntents.length
        ? 'durable dispatch intent already exists'
        : 'resume already requested'
    );
  }
  if (
    exact.some(
      (run) => !Number.isSafeInteger(run.run_attempt) || run.run_attempt < 1
    )
  ) {
    return skip('planner attempt unreadable');
  }
  const latest = exact.sort((a, b) => Number(b.id) - Number(a.id))[0];
  if (latest?.conclusion !== 'success') return skip('no successful planner');
  const jobs = await listPages(
    api,
    `actions/runs/${latest.id}/jobs?filter=latest`,
    'jobs'
  );
  const platform = jobs.find(
    (job) => job.name === 'deploy-platform / Deploy-Production'
  );
  const deferred =
    platform?.conclusion === 'success' &&
    platform.steps?.some(
      (step) =>
        step.name === 'Skip build while package releases publish' &&
        step.conclusion === 'success'
    );
  const promoted = platform?.steps?.some(
    (step) =>
      step.name === 'Promote verified production deployment' &&
      step.conclusion === 'success'
  );
  if (!deferred || promoted) return skip('planner was not package-deferred');
  const packages =
    changedPackages ??
    getChangedPublishablePackages({
      changedFiles: getLatestCommitChangedFiles({ headRef: sha, repoRoot }),
      repoRoot,
    });
  if (packages.length === 0) return skip('no changed package versions');
  await waitForPackageVisibility({
    packages,
    versionExists,
    deadline,
    now,
    sleep,
  });
  // Recheck after registry/API reads. The planner checks this pinned SHA too,
  // so a branch movement between this read and dispatch cannot deploy old work.
  if ((await api('git/ref/heads/production')).object?.sha !== sha) {
    return skip('production moved before dispatch');
  }
  const freshRuns = await listPages(
    api,
    `actions/workflows/${PLANNER}/runs?head_sha=${sha}&branch=production`,
    'workflow_runs'
  );
  const freshExact = freshRuns.filter(
    (run) => run.head_sha === sha && run.head_branch === 'production'
  );
  if (
    freshExact.some((run) => run.status !== 'completed') ||
    freshExact.length !== exact.length ||
    freshExact.some((run) => {
      const before = exact.find((previous) => previous.id === run.id);
      return (
        !before ||
        before.run_attempt !== run.run_attempt ||
        before.status !== run.status ||
        before.conclusion !== run.conclusion ||
        before.display_title !== run.display_title
      );
    })
  ) {
    return skip('planner changed before dispatch');
  }
  const freshJobs = await listPages(
    api,
    `actions/runs/${latest.id}/jobs?filter=latest`,
    'jobs'
  );
  const freshPlatform = freshJobs.find(
    (job) => job.name === 'deploy-platform / Deploy-Production'
  );
  if (
    freshPlatform?.conclusion !== 'success' ||
    !freshPlatform.steps?.some(
      (step) =>
        step.name === 'Skip build while package releases publish' &&
        step.conclusion === 'success'
    ) ||
    freshPlatform.steps?.some(
      (step) =>
        step.name === 'Promote verified production deployment' &&
        step.conclusion === 'success'
    )
  ) {
    return skip('planner jobs changed before dispatch');
  }
  const finalRun = await api(`actions/runs/${latest.id}`);
  if (
    finalRun.head_sha !== sha ||
    finalRun.head_branch !== 'production' ||
    finalRun.head_repository?.full_name !== env.GITHUB_REPOSITORY ||
    finalRun.name !== 'Production Deployment Planner' ||
    finalRun.event !== latest.event ||
    finalRun.display_title !== latest.display_title ||
    finalRun.run_attempt !== latest.run_attempt ||
    finalRun.status !== latest.status ||
    finalRun.conclusion !== latest.conclusion
  ) {
    return skip('planner attempt changed before dispatch');
  }
  const freshIntents = (
    await listPages(
      api,
      `deployments?sha=${sha}&environment=${INTENT_ENVIRONMENT}`,
      null
    )
  ).filter(
    (intent) => intent.sha === sha && intent.environment === INTENT_ENVIRONMENT
  );
  if (
    freshIntents.length !== exactIntents.length ||
    freshIntents.some((intent) => {
      const before = exactIntents.find((previous) => previous.id === intent.id);
      return (
        !before ||
        JSON.stringify(before.payload) !== JSON.stringify(intent.payload)
      );
    }) ||
    !(await completedIntentRuns({
      api,
      intents: freshIntents,
      runs: freshExact,
      sha,
      repository: env.GITHUB_REPOSITORY,
    }))
  ) {
    return skip('dispatch intent changed before reservation');
  }
  if ((await api('git/ref/heads/production')).object?.sha !== sha)
    return skip('production moved before reservation');
  if (now() >= deadline) throw new Error('Production resume deadline exceeded');
  // Reserve before POST, even though the planner run may not yet be listed.
  // Never delete an intent. Retry only a bound completed deferred planner;
  // uncertain, failed, and legacy dispatches remain blocked.
  const intent = await api('deployments', {
    method: 'POST',
    body: JSON.stringify({
      ref: sha,
      environment: INTENT_ENVIRONMENT,
      task: 'resume:production-package-deployment',
      auto_merge: false,
      required_contexts: [],
      production_environment: false,
      transient_environment: true,
      description:
        'Durable planner dispatch intent; not a production deployment',
      payload: {
        purpose: 'production-package-resume',
        sha,
        plannerRunId: latest.id,
      },
    }),
  });
  if (
    !Number.isSafeInteger(intent?.id) ||
    intent.id <= 0 ||
    intent.sha !== sha ||
    intent.environment !== INTENT_ENVIRONMENT
  ) {
    throw new Error('Unreadable dispatch intent; manual inspection required');
  }
  if (now() >= deadline) throw new Error('Production resume deadline exceeded');
  await api(`actions/workflows/${PLANNER}/dispatches`, {
    method: 'POST',
    body: JSON.stringify({
      ref: 'production',
      inputs: {
        expected_sha: sha,
        package_resume: 'true',
        resume_intent: String(intent.id),
      },
    }),
  });
  logger.log(`Requested one production planner resume for ${sha}.`);
  return { dispatched: true, sha };
}

if (require.main === module) {
  const event = JSON.parse(
    fs.readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8')
  );
  import(require('node:url').pathToFileURL(path.resolve('tuturuuu.ci.ts')).href)
    .then(({ ci }) =>
      ci['production-package-resume.yaml'] === false
        ? console.log('Production package resume disabled in CI configuration.')
        : resumeProductionDeployment({ event })
    )
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
}
module.exports = { createApi, listPages, resumeProductionDeployment };
