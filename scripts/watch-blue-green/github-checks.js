const crypto = require('node:crypto');
const fs = require('node:fs');
const https = require('node:https');
const path = require('node:path');

const { gitStdout } = require('./deploy-watcher-git.js');
const { getWatchPaths } = require('./paths.js');
const {
  GITHUB_CHECKS_TOKEN_CLIENT_TOKEN_ENV,
  GITHUB_CHECKS_TOKEN_ENV,
  GITHUB_CHECKS_TOKEN_URL_ENV,
  createGitHubChecksTokenProvider,
  getGitHubChecksToken,
  getGitHubChecksTokenSource,
} = require('./github-token-provider.js');

const GITHUB_CHECKS_STATE_KIND = 'tuturuuu-github-check-runs';
const GITHUB_CHECKS_ENABLED_ENV = 'TUTURUUU_CI_CHECKS_ENABLED';
const GITHUB_CHECKS_NAME_ENV = 'TUTURUUU_CI_CHECK_NAME';
const GITHUB_CHECKS_DETAILS_URL_ENV = 'TUTURUUU_CI_CHECK_DETAILS_URL';
const DEFAULT_GITHUB_CHECK_NAME = 'Tuturuuu CI';
const MAX_CHECK_STATE_ENTRIES = 200;
const REDACTED_VALUE = '[REDACTED]';
const REDACTED_EMAIL = '[REDACTED_EMAIL]';
const REDACTED_HOST = '[REDACTED_HOST]';
const REDACTED_PATH = '[REDACTED_PATH]';
const REDACTED_URL = '[REDACTED_URL]';

const SENSITIVE_QUERY_PARAM_PATTERN =
  /([?&](?:access[_-]?token|api[_-]?key|authorization|code|cookie|key|password|refresh[_-]?token|secret|session|token)=)[^&\s]+/giu;
const SENSITIVE_KEY_VALUE_PATTERN =
  /(?<![?&])\b(access[_-]?token|api[_-]?key|authorization|client[_-]?secret|cookie|password|refresh[_-]?token|secret|session|token)\b\s*[:=]\s*("[^"]*"|'[^']*'|Bearer\s+[A-Za-z0-9._~+/=-]+|[^\s,;}\]]+)/giu;
const BEARER_TOKEN_PATTERN = /\bBearer\s+[A-Za-z0-9._~+/=-]+/giu;
const JWT_PATTERN = /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/gu;
const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/giu;
const URL_PATTERN = /\bhttps?:\/\/[^\s)]+/giu;
const LOCAL_PATH_PATTERN =
  /(?:\/Users\/[^\s)]+|\/home\/[^\s)]+|\/private\/[^\s)]+|[A-Za-z]:\\[^\s)]+)/gu;
const HOSTNAME_PATTERN =
  /\b(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:com|dev|internal|io|local|localhost|net|org|test)\b/giu;
const COMMIT_HASH_PATTERN = /^[a-f0-9]{7,40}$/iu;
const FAILED_WORKFLOW_CONCLUSIONS = new Set([
  'action_required',
  'cancelled',
  'failure',
  'startup_failure',
  'timed_out',
]);
const SUCCESSFUL_WORKFLOW_CONCLUSIONS = new Set([
  'neutral',
  'skipped',
  'success',
]);

const STAGE_LABELS = new Map([
  ['deploy', 'Deploy'],
  ['hive-migrate', 'Hive migration'],
  ['hive-promote', 'Hive promotion'],
  ['proxy-reload', 'Proxy reload'],
  ['support-refresh', 'Support refresh'],
  ['watcher', 'Watcher'],
  ['web-build', 'Web build'],
  ['web-promote', 'Web promotion'],
]);

const SUCCESS_WATCHER_STATUSES = new Set([
  'deployed',
  'instant-reverted',
  'pinned-deployed',
  'recovered',
  'standby-refreshed',
]);
const FAILURE_WATCHER_STATUSES = new Set([
  'deploy-failed',
  'instant-revert-failed',
  'pin-deploy-failed',
  'retry-limited',
  'standby-refresh-failed',
]);
const ACTION_REQUIRED_WATCHER_STATUSES = new Set([
  'ahead',
  'blocked',
  'dirty',
  'diverged',
  'validation-blocked',
  'watcher-branch-mismatch',
  'watcher-dirty',
]);
const QUEUED_WATCHER_STATUSES = new Set([
  'cached',
  'pinned',
  'queued',
  'waiting',
]);
const IN_PROGRESS_WATCHER_STATUSES = new Set([
  'building',
  'deployment-active',
  'deploying',
  'restarting',
]);
const NEUTRAL_WATCHER_STATUSES = new Set([
  'completed',
  'missing',
  'skipped',
  'source-absent',
  'up-to-date',
]);

function trimString(value) {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : null;
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

async function getGitHubRepository({ env, rootDir, runCommand } = {}) {
  const remoteUrl = (
    await gitStdout(['config', '--get', 'remote.origin.url'], {
      cwd: rootDir,
      env,
      runCommand,
    })
  ).trim();

  return parseGitHubRepositoryFromRemote(remoteUrl);
}

function isGitHubChecksEnabled(env = process.env, tokenSource = null) {
  if (env?.[GITHUB_CHECKS_ENABLED_ENV] === '1') {
    return true;
  }

  return tokenSource?.type === 'generated' && tokenSource.source === 'runtime';
}

function sanitizePublicText(value, maxLength = 120) {
  if (value == null) {
    return null;
  }

  const sanitized = String(value)
    .replace(
      SENSITIVE_QUERY_PARAM_PATTERN,
      (_match, prefix) => `${prefix}${REDACTED_VALUE}`
    )
    .replace(
      SENSITIVE_KEY_VALUE_PATTERN,
      (_match, key) => `${key}: ${REDACTED_VALUE}`
    )
    .replace(BEARER_TOKEN_PATTERN, `Bearer ${REDACTED_VALUE}`)
    .replace(JWT_PATTERN, REDACTED_VALUE)
    .replace(EMAIL_PATTERN, REDACTED_EMAIL)
    .replace(LOCAL_PATH_PATTERN, REDACTED_PATH)
    .replace(URL_PATTERN, REDACTED_URL)
    .replace(HOSTNAME_PATTERN, REDACTED_HOST)
    .replace(/\s+/gu, ' ')
    .trim();

  if (!sanitized) {
    return null;
  }

  return sanitized.length > maxLength
    ? `${sanitized.slice(0, Math.max(0, maxLength - 3))}...`
    : sanitized;
}

function getGitHubCheckName(env = process.env) {
  return (
    sanitizePublicText(env?.[GITHUB_CHECKS_NAME_ENV], 100) ??
    DEFAULT_GITHUB_CHECK_NAME
  );
}

function getGitHubCheckDetailsUrl(env = process.env) {
  const value = trimString(env?.[GITHUB_CHECKS_DETAILS_URL_ENV]);

  if (!value) {
    return null;
  }

  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? value : null;
  } catch {
    return null;
  }
}

function normalizeCommitHash(value) {
  const text = trimString(value);

  return text && COMMIT_HASH_PATTERN.test(text) ? text : null;
}

function getShortHash(commitHash, fallback = null) {
  const fallbackHash = normalizeCommitHash(fallback);

  if (fallbackHash) {
    return fallbackHash.slice(0, 12);
  }

  return commitHash ? commitHash.slice(0, 12) : null;
}

function toIsoTimestamp(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return new Date(value).toISOString();
  }

  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
  }

  return null;
}

function formatDurationMs(value) {
  if (!Number.isFinite(value) || value < 0) {
    return null;
  }

  if (value < 1000) {
    return '<1s';
  }

  const units = [
    ['d', 86_400_000],
    ['h', 3_600_000],
    ['m', 60_000],
    ['s', 1_000],
  ];
  const parts = [];
  let remaining = value;

  for (const [label, size] of units) {
    const count = Math.floor(remaining / size);

    if (count <= 0 && parts.length === 0) {
      continue;
    }

    if (count > 0) {
      parts.push(`${count}${label}`);
      remaining -= count * size;
    }

    if (parts.length === 2) {
      break;
    }
  }

  return parts.join(' ') || '<1s';
}

function titleizeStageId(id) {
  return sanitizePublicText(
    String(id ?? 'watcher')
      .split(/[-_\s]+/u)
      .filter(Boolean)
      .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
      .join(' '),
    80
  );
}

function normalizeStageStatus(status) {
  const value = String(status ?? '').toLowerCase();

  if (
    ['completed', 'passed', 'success', 'successful', 'succeeded'].includes(
      value
    )
  ) {
    return 'succeeded';
  }

  if (
    ['cancelled', 'error', 'failed', 'failure', 'timed_out'].includes(value)
  ) {
    return 'failed';
  }

  if (['neutral', 'skipped'].includes(value)) {
    return 'skipped';
  }

  if (['building', 'deploying', 'in_progress', 'running'].includes(value)) {
    return 'running';
  }

  return 'pending';
}

function normalizeStage(stage) {
  const id = sanitizePublicText(stage?.id, 80);

  if (!id) {
    return null;
  }

  return {
    id,
    label:
      STAGE_LABELS.get(id) ??
      sanitizePublicText(stage?.label, 80) ??
      titleizeStageId(id),
    status: normalizeStageStatus(stage?.status),
  };
}

function normalizeStages(value) {
  return Array.isArray(value)
    ? value.map((stage) => normalizeStage(stage)).filter(Boolean)
    : [];
}

function getStageCounts(stages) {
  return stages.reduce(
    (counts, stage) => {
      counts.total += 1;
      if (stage.status === 'failed') counts.failed += 1;
      if (stage.status === 'pending') counts.pending += 1;
      if (stage.status === 'running') counts.running += 1;
      if (stage.status === 'skipped') counts.skipped += 1;
      if (stage.status === 'succeeded') counts.succeeded += 1;
      return counts;
    },
    {
      failed: 0,
      pending: 0,
      running: 0,
      skipped: 0,
      succeeded: 0,
      total: 0,
    }
  );
}

function getLatestDeployment(state) {
  const deployments = Array.isArray(state?.deployments)
    ? state.deployments
    : [];

  return (
    deployments.find((deployment) =>
      ['building', 'deploying'].includes(String(deployment?.status ?? ''))
    ) ??
    deployments[0] ??
    null
  );
}

function resolveCommit(state, latestDeployment) {
  const hash =
    normalizeCommitHash(latestDeployment?.commitHash) ??
    normalizeCommitHash(state?.latestCommit?.hash) ??
    normalizeCommitHash(state?.lastResult?.latestCommit?.hash);

  return hash
    ? {
        hash,
        shortHash: getShortHash(
          hash,
          latestDeployment?.commitShortHash ??
            state?.latestCommit?.shortHash ??
            state?.lastResult?.latestCommit?.shortHash
        ),
      }
    : null;
}

function getWatcherStatus(state, latestDeployment) {
  if (
    latestDeployment &&
    ['building', 'deploying'].includes(String(latestDeployment.status ?? ''))
  ) {
    return String(latestDeployment.status);
  }

  return (
    trimString(state?.lastResult?.status) ??
    trimString(state?.lastDeployStatus) ??
    trimString(latestDeployment?.status) ??
    'unknown'
  );
}

function createSyntheticStage(watcherStatus, checkState) {
  const status =
    checkState.status === 'completed'
      ? checkState.conclusion === 'failure'
        ? 'failed'
        : checkState.conclusion === 'success'
          ? 'succeeded'
          : 'pending'
      : checkState.status === 'in_progress'
        ? 'running'
        : 'pending';
  const normalizedStatus = String(watcherStatus ?? '');
  const id =
    normalizedStatus === 'building'
      ? 'web-build'
      : normalizedStatus === 'deploying' || normalizedStatus === 'restarting'
        ? 'deploy'
        : 'watcher';

  return {
    id,
    label: STAGE_LABELS.get(id) ?? titleizeStageId(id),
    status,
  };
}

function getCurrentStage(stages, watcherStatus, checkState) {
  const running = stages.find((stage) => stage.status === 'running');
  if (running) return running;

  const failed = stages.find((stage) => stage.status === 'failed');
  if (failed) return failed;

  if (stages.length > 0) {
    return stages[stages.length - 1];
  }

  return createSyntheticStage(watcherStatus, checkState);
}

function mapWatcherStatusToCheckState(watcherStatus, latestDeployment) {
  if (
    latestDeployment &&
    ['building', 'deploying'].includes(String(latestDeployment.status ?? ''))
  ) {
    return { conclusion: null, status: 'in_progress' };
  }

  const normalizedStatus = String(watcherStatus ?? 'unknown');

  if (SUCCESS_WATCHER_STATUSES.has(normalizedStatus)) {
    return { conclusion: 'success', status: 'completed' };
  }

  if (FAILURE_WATCHER_STATUSES.has(normalizedStatus)) {
    return { conclusion: 'failure', status: 'completed' };
  }

  if (ACTION_REQUIRED_WATCHER_STATUSES.has(normalizedStatus)) {
    return { conclusion: 'action_required', status: 'completed' };
  }

  if (IN_PROGRESS_WATCHER_STATUSES.has(normalizedStatus)) {
    return { conclusion: null, status: 'in_progress' };
  }

  if (QUEUED_WATCHER_STATUSES.has(normalizedStatus)) {
    return { conclusion: null, status: 'queued' };
  }

  if (NEUTRAL_WATCHER_STATUSES.has(normalizedStatus)) {
    return { conclusion: 'neutral', status: 'completed' };
  }

  if (normalizedStatus.endsWith('-failed')) {
    return { conclusion: 'failure', status: 'completed' };
  }

  return { conclusion: 'neutral', status: 'completed' };
}

function createStageTable(stages) {
  if (stages.length === 0) {
    return null;
  }

  return [
    '| Stage | Status |',
    '| --- | --- |',
    ...stages.map(
      (stage) =>
        `| ${sanitizePublicText(stage.label, 80) ?? stage.id} | ${stage.status} |`
    ),
  ].join('\n');
}

function getCheckRunTitle(checkState, watcherStatus, commit) {
  const stateLabel =
    checkState.status === 'completed'
      ? checkState.conclusion
      : checkState.status;
  const title = `Tuturuuu CI: ${stateLabel} ${commit.shortHash ?? commit.hash.slice(0, 12)} (${watcherStatus})`;

  return sanitizePublicText(title, 255);
}

function createCheckRunOutput({
  branch,
  buildDuration,
  checkState,
  commit,
  currentStage,
  deploymentKind,
  stageCounts,
  stages,
  upstream,
  watcherStatus,
}) {
  const lines = [
    `Watcher status: ${sanitizePublicText(watcherStatus, 80) ?? 'unknown'}`,
    `Commit: ${commit.shortHash ?? commit.hash.slice(0, 12)}`,
  ];

  if (branch) {
    lines.push(`Branch: ${branch}${upstream ? ` (${upstream})` : ''}`);
  }

  if (deploymentKind) {
    lines.push(`Deployment kind: ${deploymentKind}`);
  }

  lines.push(
    `Current stage: ${currentStage.label ?? currentStage.id} (${currentStage.status})`
  );
  lines.push(
    `Stages: ${stageCounts.succeeded} succeeded, ${stageCounts.failed} failed, ${stageCounts.running} running, ${stageCounts.pending} pending, ${stageCounts.skipped} skipped`
  );

  if (buildDuration) {
    lines.push(`Build duration: ${buildDuration}`);
  }

  const stageTable = createStageTable(stages);

  return {
    summary: lines.join('\n'),
    text: stageTable ?? undefined,
    title: getCheckRunTitle(checkState, watcherStatus, commit),
  };
}

function createPayloadFingerprint(payload) {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify(payload))
    .digest('hex');
}

function buildGitHubCheckRunContext(
  state,
  {
    env = process.env,
    fsImpl = fs,
    now = Date.now(),
    paths = getWatchPaths(),
  } = {}
) {
  const tokenSource = getGitHubChecksTokenSource(env, {
    fsImpl,
    now: () => now,
    paths,
  });

  if (!isGitHubChecksEnabled(env, tokenSource)) {
    return {
      publishable: false,
      reason: 'disabled',
    };
  }

  if (!tokenSource) {
    return {
      publishable: false,
      reason: 'missing-token',
    };
  }

  const latestDeployment = getLatestDeployment(state);
  const commit = resolveCommit(state, latestDeployment);

  if (!commit?.hash) {
    return {
      publishable: false,
      reason: 'missing-commit',
    };
  }

  const watcherStatus = getWatcherStatus(state, latestDeployment);
  const checkState = mapWatcherStatusToCheckState(
    watcherStatus,
    latestDeployment
  );
  const stages = normalizeStages(latestDeployment?.stages);
  const deploymentKind = sanitizePublicText(
    latestDeployment?.deploymentKind ?? state?.lastResult?.deploymentKind,
    80
  );
  const currentStage = getCurrentStage(stages, watcherStatus, checkState);
  const stageCounts = getStageCounts(
    stages.length > 0 ? stages : [currentStage]
  );
  const branch = sanitizePublicText(state?.target?.branch, 120);
  const upstream = sanitizePublicText(state?.target?.upstreamRef, 120);
  const buildDuration = formatDurationMs(latestDeployment?.buildDurationMs);
  const output = createCheckRunOutput({
    branch,
    buildDuration,
    checkState,
    commit,
    currentStage,
    deploymentKind,
    stageCounts,
    stages,
    upstream,
    watcherStatus,
  });
  const detailsUrl = getGitHubCheckDetailsUrl(env);
  const startedAt =
    toIsoTimestamp(latestDeployment?.startedAt) ??
    toIsoTimestamp(state?.startedAt) ??
    toIsoTimestamp(now);
  const completedAt =
    checkState.status === 'completed'
      ? (toIsoTimestamp(latestDeployment?.finishedAt) ??
        toIsoTimestamp(latestDeployment?.activatedAt) ??
        toIsoTimestamp(state?.lastDeployAt))
      : null;
  const createBody = {
    head_sha: commit.hash,
    name: getGitHubCheckName(env),
    output,
    status: checkState.status,
    ...(startedAt ? { started_at: startedAt } : {}),
    ...(detailsUrl ? { details_url: detailsUrl } : {}),
    ...(checkState.status === 'completed' && checkState.conclusion
      ? { conclusion: checkState.conclusion }
      : {}),
    ...(completedAt ? { completed_at: completedAt } : {}),
  };
  const updateBody = {
    output,
    status: checkState.status,
    ...(detailsUrl ? { details_url: detailsUrl } : {}),
    ...(checkState.status === 'completed' && checkState.conclusion
      ? { conclusion: checkState.conclusion }
      : {}),
    ...(completedAt ? { completed_at: completedAt } : {}),
  };

  return {
    checkName: createBody.name,
    checkState,
    commit,
    createBody,
    fingerprint: createPayloadFingerprint({
      commit: commit.hash,
      name: createBody.name,
      output,
      status: checkState.status,
      conclusion: checkState.conclusion,
      detailsUrl,
      completedAt,
      startedAt,
    }),
    publishable: true,
    token: tokenSource.type === 'static' ? tokenSource.token : null,
    tokenSource:
      tokenSource.type === 'static'
        ? { envName: tokenSource.envName, type: tokenSource.type }
        : { source: tokenSource.source, type: tokenSource.type },
    updateBody,
  };
}

function createEmptyGitHubChecksState() {
  return {
    checkRuns: {},
    kind: GITHUB_CHECKS_STATE_KIND,
  };
}

function readGitHubChecksState(filePath, fsImpl = fs) {
  if (!filePath || !fsImpl.existsSync(filePath)) {
    return createEmptyGitHubChecksState();
  }

  try {
    const parsed = JSON.parse(fsImpl.readFileSync(filePath, 'utf8'));

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return createEmptyGitHubChecksState();
    }

    return {
      checkRuns:
        parsed.checkRuns && typeof parsed.checkRuns === 'object'
          ? parsed.checkRuns
          : {},
      kind: GITHUB_CHECKS_STATE_KIND,
    };
  } catch {
    return createEmptyGitHubChecksState();
  }
}

function pruneGitHubChecksState(state) {
  const entries = Object.entries(state.checkRuns ?? {}).sort((left, right) => {
    const leftTime = Date.parse(left[1]?.updatedAt ?? '') || 0;
    const rightTime = Date.parse(right[1]?.updatedAt ?? '') || 0;
    return rightTime - leftTime;
  });

  return {
    checkRuns: Object.fromEntries(entries.slice(0, MAX_CHECK_STATE_ENTRIES)),
    kind: GITHUB_CHECKS_STATE_KIND,
  };
}

function writeGitHubChecksState(filePath, state, fsImpl = fs) {
  if (!filePath) {
    return;
  }

  fsImpl.mkdirSync(path.dirname(filePath), { recursive: true });
  fsImpl.writeFileSync(
    filePath,
    JSON.stringify(pruneGitHubChecksState(state), null, 2),
    'utf8'
  );
}

function getCheckRunStateKey(checkName, commitHash) {
  return `${checkName}:${commitHash}`;
}

function githubJsonRequest(
  requestPath,
  { body = null, method = 'GET', token } = {}
) {
  return new Promise((resolve, reject) => {
    const headers = {
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'User-Agent': 'tuturuuu-blue-green-watcher',
      'X-GitHub-Api-Version': '2022-11-28',
    };

    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const req = https.request(
      {
        headers,
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
            const error = new Error(
              `GitHub API ${method} ${requestPath} failed with ${res.statusCode}`
            );
            error.statusCode = res.statusCode;
            reject(error);
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

function parseRepositoryFromEnv(env = process.env) {
  const repository = trimString(env?.GITHUB_REPOSITORY);

  if (!repository?.includes('/')) {
    return null;
  }

  const [owner, repo] = repository.split('/');

  return owner && repo ? { owner, repo } : null;
}

async function resolveGitHubChecksRepository({
  env = process.env,
  rootDir,
  runCommand,
} = {}) {
  return (
    parseRepositoryFromEnv(env) ??
    (await getGitHubRepository({ env, rootDir, runCommand }).catch(() => null))
  );
}

function isCommitValidationLookupEnabled(
  env = process.env,
  tokenSource = null
) {
  if (
    String(env?.DOCKER_WEB_WATCHER_GITHUB_VALIDATION_DISABLED ?? '') === '1'
  ) {
    return false;
  }

  return (
    String(env?.DOCKER_WEB_WATCHER_GITHUB_VALIDATION ?? '') === '1' ||
    isGitHubChecksEnabled(env, tokenSource) ||
    Boolean(parseRepositoryFromEnv(env))
  );
}

function getWorkflowRunKey(run) {
  return String(run?.workflow_id ?? run?.name ?? run?.workflowName ?? '');
}

function getWorkflowRunTime(run) {
  return (
    Date.parse(run?.updated_at ?? '') ||
    Date.parse(run?.created_at ?? '') ||
    Number(run?.id ?? 0) ||
    0
  );
}

function getLatestWorkflowRunsForCommit(runs = [], commitHash) {
  const latestByWorkflow = new Map();

  for (const run of Array.isArray(runs) ? runs : []) {
    if (run?.head_sha && run.head_sha !== commitHash) {
      continue;
    }

    const key = getWorkflowRunKey(run);
    if (!key) {
      continue;
    }

    const previous = latestByWorkflow.get(key);

    if (!previous || getWorkflowRunTime(run) >= getWorkflowRunTime(previous)) {
      latestByWorkflow.set(key, run);
    }
  }

  return [...latestByWorkflow.values()];
}

function normalizeWorkflowRunValidation(runs = [], commitHash) {
  const latestRuns = getLatestWorkflowRunsForCommit(runs, commitHash);
  const failedRuns = [];
  const pendingRuns = [];
  const successfulRuns = [];

  for (const run of latestRuns) {
    const status = String(run?.status ?? '').toLowerCase();
    const conclusion = String(run?.conclusion ?? '').toLowerCase();
    const normalizedRun = {
      conclusion,
      databaseId: run?.database_id ?? run?.id ?? null,
      name: run?.name ?? run?.workflowName ?? 'Workflow',
      status,
      url: run?.html_url ?? run?.url ?? null,
    };

    if (status !== 'completed') {
      pendingRuns.push(normalizedRun);
      continue;
    }

    if (FAILED_WORKFLOW_CONCLUSIONS.has(conclusion)) {
      failedRuns.push(normalizedRun);
      continue;
    }

    if (SUCCESSFUL_WORKFLOW_CONCLUSIONS.has(conclusion)) {
      successfulRuns.push(normalizedRun);
      continue;
    }

    pendingRuns.push(normalizedRun);
  }

  return {
    blocked: failedRuns.length > 0,
    failedRuns,
    inspectable: latestRuns.length > 0,
    pendingRuns,
    status:
      failedRuns.length > 0
        ? 'failed'
        : pendingRuns.length > 0
          ? 'pending'
          : latestRuns.length > 0
            ? 'passed'
            : 'missing',
    successfulRuns,
    totalRuns: latestRuns.length,
  };
}

async function getGitHubWorkflowValidationForCommit({
  commitHash,
  env = process.env,
  fsImpl = fs,
  now = Date.now(),
  paths = getWatchPaths(),
  repository,
  requestJson = githubJsonRequest,
  rootDir,
  runCommand,
  tokenProvider = createGitHubChecksTokenProvider({ env, fsImpl, paths }),
} = {}) {
  const normalizedCommitHash = normalizeCommitHash(commitHash);

  if (!normalizedCommitHash) {
    return {
      inspectable: false,
      reason: 'missing-commit',
      status: 'missing',
    };
  }

  const tokenSource = getGitHubChecksTokenSource(env, {
    fsImpl,
    now: () => now,
    paths,
  });

  if (!isCommitValidationLookupEnabled(env, tokenSource)) {
    return {
      inspectable: false,
      reason: 'disabled',
      status: 'disabled',
    };
  }

  const resolvedRepository =
    repository ??
    (await resolveGitHubChecksRepository({ env, rootDir, runCommand }));

  if (!resolvedRepository?.owner || !resolvedRepository?.repo) {
    return {
      inspectable: false,
      reason: 'missing-repository',
      status: 'missing',
    };
  }

  const token =
    tokenSource?.type === 'static'
      ? tokenSource.token
      : await tokenProvider.getToken().catch(() => null);
  const owner = encodeURIComponent(resolvedRepository.owner);
  const repo = encodeURIComponent(resolvedRepository.repo);
  const response = await requestJson(
    `/repos/${owner}/${repo}/actions/runs?head_sha=${encodeURIComponent(normalizedCommitHash)}&per_page=100`,
    { token }
  );
  const validation = normalizeWorkflowRunValidation(
    response?.workflow_runs ?? [],
    normalizedCommitHash
  );

  return {
    ...validation,
    commitHash: normalizedCommitHash,
    repository: resolvedRepository,
  };
}

async function publishGitHubCheckRunContext(
  context,
  {
    env = process.env,
    fsImpl = fs,
    paths = getWatchPaths(),
    repository,
    requestJson = githubJsonRequest,
    tokenProvider = createGitHubChecksTokenProvider({ env, fsImpl, paths }),
  } = {}
) {
  if (!context?.publishable) {
    return {
      reason: context?.reason ?? 'not-publishable',
      status: 'skipped',
    };
  }

  if (!repository?.owner || !repository?.repo) {
    return {
      reason: 'missing-repository',
      status: 'skipped',
    };
  }

  const stateFile = paths.githubChecksFile;
  const storedState = readGitHubChecksState(stateFile, fsImpl);
  const stateKey = getCheckRunStateKey(context.checkName, context.commit.hash);
  const existing = storedState.checkRuns[stateKey];
  const owner = encodeURIComponent(repository.owner);
  const repo = encodeURIComponent(repository.repo);
  const nowIso = new Date().toISOString();
  const requestWithToken = async (requestPath, options) => {
    const token = context.token ?? (await tokenProvider.getToken());

    if (!token) {
      return {
        reason: 'missing-token',
        status: 'skipped',
      };
    }

    try {
      return await requestJson(requestPath, {
        ...options,
        token,
      });
    } catch (error) {
      if (context.token || error?.statusCode !== 401) {
        throw error;
      }

      const refreshedToken = await tokenProvider.forceRefresh();
      if (!refreshedToken) {
        throw error;
      }

      return requestJson(requestPath, {
        ...options,
        token: refreshedToken,
      });
    }
  };

  if (existing?.checkRunId) {
    try {
      const result = await requestWithToken(
        `/repos/${owner}/${repo}/check-runs/${encodeURIComponent(existing.checkRunId)}`,
        {
          body: context.updateBody,
          env,
          method: 'PATCH',
        }
      );

      if (result?.status === 'skipped') {
        return result;
      }

      storedState.checkRuns[stateKey] = {
        ...existing,
        checkRunId: existing.checkRunId,
        commitHash: context.commit.hash,
        name: context.checkName,
        updatedAt: nowIso,
      };
      writeGitHubChecksState(stateFile, storedState, fsImpl);

      return {
        checkRunId: existing.checkRunId,
        requestBody: context.updateBody,
        status: 'updated',
      };
    } catch (error) {
      if (error?.statusCode !== 404) {
        throw error;
      }
    }
  }

  const created = await requestWithToken(`/repos/${owner}/${repo}/check-runs`, {
    body: context.createBody,
    env,
    method: 'POST',
  });

  if (created?.status === 'skipped') {
    return created;
  }

  const checkRunId = created?.id;

  if (checkRunId) {
    storedState.checkRuns[stateKey] = {
      checkRunId,
      commitHash: context.commit.hash,
      name: context.checkName,
      updatedAt: nowIso,
    };
    writeGitHubChecksState(stateFile, storedState, fsImpl);
  }

  return {
    checkRunId,
    requestBody: context.createBody,
    status: 'created',
  };
}

async function publishGitHubCheckRunForState(
  state,
  {
    env = process.env,
    fsImpl = fs,
    now = Date.now(),
    paths = getWatchPaths(),
    repository,
    requestJson = githubJsonRequest,
    rootDir,
    runCommand,
    tokenProvider = createGitHubChecksTokenProvider({ env, fsImpl, paths }),
  } = {}
) {
  const context = buildGitHubCheckRunContext(state, {
    env,
    fsImpl,
    now,
    paths,
  });

  if (!context.publishable) {
    return {
      reason: context.reason,
      status: 'skipped',
    };
  }

  const resolvedRepository =
    repository ??
    (await resolveGitHubChecksRepository({ env, rootDir, runCommand }));

  return publishGitHubCheckRunContext(context, {
    env,
    fsImpl,
    paths,
    repository: resolvedRepository,
    requestJson,
    tokenProvider,
  });
}

function describePublishError(error) {
  return error instanceof Error ? error.message : String(error);
}

function createGitHubChecksPublisher({
  env = process.env,
  fsImpl = fs,
  log = console,
  now = () => Date.now(),
  paths = getWatchPaths(),
  repository = null,
  requestJson = githubJsonRequest,
  rootDir,
  runCommand,
  tokenProvider = createGitHubChecksTokenProvider({ env, fsImpl, now, paths }),
} = {}) {
  let lastFingerprint = null;
  let pending = Promise.resolve({
    status: 'idle',
  });
  let repositoryPromise = null;

  const resolveRepositoryOnce = () => {
    if (repository) {
      return Promise.resolve(repository);
    }

    repositoryPromise ??= resolveGitHubChecksRepository({
      env,
      rootDir,
      runCommand,
    });

    return repositoryPromise;
  };

  const publisher = {
    flush() {
      return pending;
    },
    publish(state) {
      const context = buildGitHubCheckRunContext(state, {
        env,
        fsImpl,
        now: now(),
        paths,
      });

      if (!context.publishable) {
        return Promise.resolve({
          reason: context.reason,
          status: 'skipped',
        });
      }

      if (context.fingerprint === lastFingerprint) {
        return Promise.resolve({
          status: 'unchanged',
        });
      }

      lastFingerprint = context.fingerprint;
      pending = pending
        .then(async () => {
          const resolvedRepository = await resolveRepositoryOnce();
          return publishGitHubCheckRunContext(context, {
            env,
            fsImpl,
            paths,
            repository: resolvedRepository,
            requestJson,
            tokenProvider,
          });
        })
        .catch((error) => {
          log.warn?.(
            `Unable to publish Tuturuuu CI GitHub Check Run: ${describePublishError(error)}`
          );
          return {
            error,
            status: 'failed',
          };
        });

      return pending;
    },
  };

  return publisher;
}

module.exports = {
  DEFAULT_GITHUB_CHECK_NAME,
  GITHUB_CHECKS_DETAILS_URL_ENV,
  GITHUB_CHECKS_ENABLED_ENV,
  GITHUB_CHECKS_NAME_ENV,
  GITHUB_CHECKS_STATE_KIND,
  GITHUB_CHECKS_TOKEN_CLIENT_TOKEN_ENV,
  GITHUB_CHECKS_TOKEN_ENV,
  GITHUB_CHECKS_TOKEN_URL_ENV,
  buildGitHubCheckRunContext,
  createGitHubChecksTokenProvider,
  createGitHubChecksPublisher,
  getGitHubWorkflowValidationForCommit,
  getGitHubCheckDetailsUrl,
  getGitHubCheckName,
  getGitHubChecksToken,
  getGitHubChecksTokenSource,
  githubJsonRequest,
  isGitHubChecksEnabled,
  normalizeWorkflowRunValidation,
  publishGitHubCheckRunContext,
  publishGitHubCheckRunForState,
  readGitHubChecksState,
  resolveGitHubChecksRepository,
  sanitizePublicText,
  writeGitHubChecksState,
};
