const fs = require('node:fs');
const https = require('node:https');

const { runChecked } = require('../docker-web/compose.js');
const {
  getCommitMetadata,
  gitStdout,
  isAncestor,
} = require('./deploy-watcher-git.js');
const { getWatchPaths } = require('./paths.js');

const DEFAULT_AUTO_PRODUCTION_PROMOTION_DELAY_MS = 10 * 60_000;
const DEFAULT_AUTO_PRODUCTION_PROMOTION_POLL_MS = 5_000;
const PRODUCTION_PROMOTION_STATE_KIND = 'production-promotion-state';
const PASSING_CHECK_RUN_CONCLUSIONS = new Set([
  'neutral',
  'skipped',
  'success',
]);

function toIsoTime(value) {
  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return new Date(value).toISOString();
  }

  return null;
}

function toFiniteTimestamp(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function normalizeCommit(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const committedAt = toIsoTime(value.committedAt);

  return {
    committedAt,
    hash: typeof value.hash === 'string' ? value.hash : null,
    shortHash: typeof value.shortHash === 'string' ? value.shortHash : null,
    subject: typeof value.subject === 'string' ? value.subject : null,
  };
}

function normalizeState(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  return {
    ...value,
    kind: PRODUCTION_PROMOTION_STATE_KIND,
    main: normalizeCommit(value.main),
    production: normalizeCommit(value.production),
  };
}

function readProductionPromotionState(paths = getWatchPaths(), fsImpl = fs) {
  if (!fsImpl.existsSync(paths.productionPromotionStateFile)) {
    return null;
  }

  try {
    return normalizeState(
      JSON.parse(
        fsImpl.readFileSync(paths.productionPromotionStateFile, 'utf8')
      )
    );
  } catch {
    return null;
  }
}

function writeProductionPromotionState(
  state,
  { fsImpl = fs, paths = getWatchPaths() } = {}
) {
  fsImpl.mkdirSync(paths.runtimeDir, { recursive: true });
  fsImpl.writeFileSync(
    paths.productionPromotionStateFile,
    JSON.stringify(
      {
        ...state,
        kind: PRODUCTION_PROMOTION_STATE_KIND,
      },
      null,
      2
    ),
    'utf8'
  );
}

function getCommitAgeMs(commit, now = Date.now()) {
  const committedAt = toFiniteTimestamp(commit?.committedAt);

  return committedAt == null ? null : Math.max(0, now - committedAt);
}

function createCiSummary({
  checkRuns = [],
  error = null,
  statuses = [],
  tokenConfigured = true,
} = {}) {
  if (!tokenConfigured) {
    return {
      completed: 0,
      failing: 0,
      pending: 0,
      state: 'unavailable',
      total: 0,
      unavailableReason: 'missing-token',
    };
  }

  if (error) {
    return {
      completed: 0,
      failing: 0,
      pending: 0,
      state: 'unavailable',
      total: 0,
      unavailableReason: error instanceof Error ? error.message : String(error),
    };
  }

  const normalizedCheckRuns = Array.isArray(checkRuns) ? checkRuns : [];
  const normalizedStatuses = Array.isArray(statuses) ? statuses : [];
  const pendingCheckRuns = normalizedCheckRuns.filter(
    (check) => check?.status !== 'completed'
  );
  const failingCheckRuns = normalizedCheckRuns.filter(
    (check) =>
      check?.status === 'completed' &&
      !PASSING_CHECK_RUN_CONCLUSIONS.has(String(check?.conclusion ?? ''))
  );
  const failingStatuses = normalizedStatuses.filter(
    (status) => status?.state !== 'success'
  );
  const total = normalizedCheckRuns.length + normalizedStatuses.length;
  const pending = pendingCheckRuns.length;
  const failing = failingCheckRuns.length + failingStatuses.length;
  const completed =
    normalizedCheckRuns.length -
    pendingCheckRuns.length +
    normalizedStatuses.length;

  if (total === 0) {
    return {
      completed,
      failing,
      pending,
      state: 'missing',
      total,
      unavailableReason: null,
    };
  }

  return {
    completed,
    failing,
    pending,
    state: pending > 0 ? 'pending' : failing > 0 ? 'failing' : 'passing',
    total,
    unavailableReason: null,
  };
}

function evaluateProductionPromotion({
  ci,
  isFastForward,
  main,
  now = Date.now(),
  prebuild = null,
  production,
  request = null,
  requiredDelayMs = DEFAULT_AUTO_PRODUCTION_PROMOTION_DELAY_MS,
} = {}) {
  const commitAgeMs = getCommitAgeMs(main, now);
  const waitRemainingMs =
    commitAgeMs == null
      ? requiredDelayMs
      : Math.max(0, requiredDelayMs - commitAgeMs);
  const hasCandidate =
    Boolean(main?.hash) &&
    Boolean(production?.hash) &&
    main.hash !== production.hash;
  const bypassed = Boolean(request);
  const blockedReasons = [];

  if (!hasCandidate) {
    blockedReasons.push('up-to-date');
  }

  if (hasCandidate && !isFastForward) {
    blockedReasons.push('not-fast-forward');
  }

  if (!bypassed && waitRemainingMs > 0) {
    blockedReasons.push('waiting-for-age');
  }

  if (!bypassed && ci?.state !== 'passing') {
    blockedReasons.push('ci-not-green');
  }

  const ready =
    hasCandidate &&
    isFastForward === true &&
    (bypassed || waitRemainingMs === 0) &&
    (bypassed || ci?.state === 'passing');

  return {
    blockedReasons,
    bypassed,
    commitAgeMs,
    prebuild,
    ready,
    waitRemainingMs,
  };
}

function parseGitHubRepositoryFromRemote(remoteUrl) {
  const value = String(remoteUrl ?? '').trim();
  const sshMatch = value.match(/^git@github\.com:([^/]+)\/(.+?)(?:\.git)?$/u);

  if (sshMatch) {
    return {
      owner: sshMatch[1],
      repo: sshMatch[2],
    };
  }

  try {
    const url = new URL(value);

    if (url.hostname !== 'github.com') {
      return null;
    }

    const [owner, repo] = url.pathname
      .replace(/^\/+/u, '')
      .replace(/\.git$/u, '')
      .split('/');

    return owner && repo ? { owner, repo } : null;
  } catch {
    return null;
  }
}

function githubJsonRequest(
  requestPath,
  { body = null, env = process.env, method = 'GET' } = {}
) {
  const token = env?.GITHUB_TOKEN;

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          'User-Agent': 'tuturuuu-blue-green-watcher',
          'X-GitHub-Api-Version': '2022-11-28',
        },
        hostname: 'api.github.com',
        method,
        path: requestPath,
      },
      (res) => {
        let responseBody = '';

        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          responseBody += chunk;
        });
        res.on('end', () => {
          let parsed = null;

          try {
            parsed = responseBody ? JSON.parse(responseBody) : null;
          } catch {
            parsed = null;
          }

          if ((res.statusCode ?? 500) >= 400) {
            reject(
              new Error(
                `GitHub API ${method} ${requestPath} failed with ${res.statusCode}`
              )
            );
            return;
          }

          resolve(parsed);
        });
      }
    );

    req.on('error', reject);

    if (body) {
      req.write(JSON.stringify(body));
    }

    req.end();
  });
}

async function getGitHubRepository({ env, runCommand, rootDir } = {}) {
  const remoteUrl = (
    await gitStdout(['config', '--get', 'remote.origin.url'], {
      cwd: rootDir,
      env,
      runCommand,
    })
  ).trim();

  return parseGitHubRepositoryFromRemote(remoteUrl);
}

async function getGitHubCiSummary({
  env,
  mainHash,
  owner,
  repo,
  requestJson = githubJsonRequest,
} = {}) {
  if (!env?.GITHUB_TOKEN) {
    return createCiSummary({ tokenConfigured: false });
  }

  if (!owner || !repo || !mainHash) {
    return createCiSummary({ error: 'missing-repository' });
  }

  try {
    const [checkRunsResponse, statusResponse] = await Promise.all([
      requestJson(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/commits/${encodeURIComponent(mainHash)}/check-runs?filter=latest&per_page=100`,
        { env }
      ),
      requestJson(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/commits/${encodeURIComponent(mainHash)}/status`,
        { env }
      ),
    ]);

    return createCiSummary({
      checkRuns: checkRunsResponse?.check_runs,
      statuses: statusResponse?.statuses,
      tokenConfigured: true,
    });
  } catch (error) {
    return createCiSummary({ error, tokenConfigured: true });
  }
}

async function fetchProductionPromotionRefs({
  env,
  remote = 'origin',
  runCommand,
  rootDir,
  targetBranch = 'production',
} = {}) {
  await runChecked(
    'git',
    [
      'fetch',
      remote,
      `refs/heads/main:refs/remotes/${remote}/main`,
      `refs/heads/${targetBranch}:refs/remotes/${remote}/${targetBranch}`,
    ],
    {
      cwd: rootDir,
      env,
      runCommand,
      stdio: 'pipe',
    }
  );

  const main = await getCommitMetadata(`${remote}/main`, {
    cwd: rootDir,
    env,
    runCommand,
  });
  const production = await getCommitMetadata(`${remote}/${targetBranch}`, {
    cwd: rootDir,
    env,
    runCommand,
  });
  const fastForward =
    main.hash && production.hash
      ? await isAncestor(production.hash, main.hash, {
          cwd: rootDir,
          env,
          runCommand,
        })
      : false;

  return {
    fastForward,
    main,
    production,
  };
}

async function updateProductionRefToMain({
  env,
  mainHash,
  owner,
  repo,
  requestJson = githubJsonRequest,
} = {}) {
  if (!env?.GITHUB_TOKEN) {
    throw new Error('GITHUB_TOKEN is required to update production.');
  }

  if (!owner || !repo || !mainHash) {
    throw new Error('GitHub repository and main SHA are required.');
  }

  return requestJson(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/refs/heads/production`,
    {
      body: {
        force: false,
        sha: mainHash,
      },
      env,
      method: 'PATCH',
    }
  );
}

async function fastForwardLocalProduction({
  env,
  remote = 'origin',
  rootDir,
  runCommand,
  targetBranch = 'production',
} = {}) {
  await runChecked(
    'git',
    [
      'fetch',
      remote,
      `refs/heads/${targetBranch}:refs/remotes/${remote}/${targetBranch}`,
    ],
    {
      cwd: rootDir,
      env,
      runCommand,
      stdio: 'pipe',
    }
  );
  await runChecked('git', ['merge', '--ff-only', `${remote}/${targetBranch}`], {
    cwd: rootDir,
    env,
    runCommand,
  });
}

function createProductionPromotionState({
  ci,
  evaluation,
  main,
  now = Date.now(),
  prebuild = null,
  production,
  request = null,
  status,
  target = null,
} = {}) {
  return {
    ci,
    decision: {
      blockedReasons: evaluation?.blockedReasons ?? [],
      bypassed: evaluation?.bypassed ?? false,
      ready: evaluation?.ready ?? false,
      status,
    },
    main: normalizeCommit(main),
    nextCheckAt: now + DEFAULT_AUTO_PRODUCTION_PROMOTION_POLL_MS,
    prebuild,
    production: normalizeCommit(production),
    queuedRequest: request,
    requiredDelayMs: DEFAULT_AUTO_PRODUCTION_PROMOTION_DELAY_MS,
    sourceBranch: 'main',
    targetBranch: 'production',
    target,
    updatedAt: new Date(now).toISOString(),
    waitRemainingMs: evaluation?.waitRemainingMs ?? null,
  };
}

module.exports = {
  DEFAULT_AUTO_PRODUCTION_PROMOTION_DELAY_MS,
  DEFAULT_AUTO_PRODUCTION_PROMOTION_POLL_MS,
  PRODUCTION_PROMOTION_STATE_KIND,
  createCiSummary,
  createProductionPromotionState,
  evaluateProductionPromotion,
  fastForwardLocalProduction,
  fetchProductionPromotionRefs,
  getCommitAgeMs,
  getGitHubCiSummary,
  getGitHubRepository,
  githubJsonRequest,
  parseGitHubRepositoryFromRemote,
  readProductionPromotionState,
  updateProductionRefToMain,
  writeProductionPromotionState,
};
