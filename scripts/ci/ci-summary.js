#!/usr/bin/env node
// Posts the "CI summary" check from a dedicated GitHub App installation token.
// The workflow token stays read-only. Workflow triggers are read from the
// default-branch checkout; pull request contents are never checked out or run.
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const CHECK_NAME = 'CI summary';
const API = 'https://api.github.com';
const APP_PERMISSIONS = {
  actions: 'read',
  checks: 'write',
  contents: 'read',
  metadata: 'read',
  pull_requests: 'read',
};
const POSITIVE_TYPES = ['opened', 'synchronize', 'reopened'];
const OK_CHECK_CONCLUSIONS = new Set(['success', 'skipped', 'neutral']);
const FILE_CAP = 3000;

function readAppCredentials(env) {
  const appId = String(env.CI_SUMMARY_APP_ID ?? '').trim();
  const raw = String(env.CI_SUMMARY_APP_PRIVATE_KEY ?? '');
  if (!/^\d+$/.test(appId) || !raw.includes('PRIVATE KEY')) {
    throw new Error(
      'CI_SUMMARY_APP_ID and CI_SUMMARY_APP_PRIVATE_KEY are required. This job does not post checks with the workflow token.'
    );
  }
  return {
    appId,
    privateKey: raw.includes('\\n') ? raw.replace(/\\n/g, '\n') : raw,
  };
}

function createAppJwt(appId, privateKey, now = Math.floor(Date.now() / 1000)) {
  const encode = (value) =>
    Buffer.from(JSON.stringify(value)).toString('base64url');
  const unsigned = `${encode({ alg: 'RS256', typ: 'JWT' })}.${encode({
    iat: now - 60,
    exp: now + 540,
    iss: appId,
  })}`;
  const signature = crypto
    .sign('RSA-SHA256', Buffer.from(unsigned), privateKey)
    .toString('base64url');
  return `${unsigned}.${signature}`;
}

function repoPath(repo) {
  const parts = String(repo ?? '').split('/');
  if (parts.length !== 2 || parts.some((part) => part.length === 0)) {
    throw new Error('REPO must be owner/name');
  }
  return parts.map((part) => encodeURIComponent(part)).join('/');
}

function fnmatch(name, pattern) {
  let expression = '';
  for (let index = 0; index < pattern.length; index += 1) {
    const char = pattern[index];
    if (char === '*') expression += '.*';
    else if (char === '?') expression += '.';
    else if (char === '[') {
      const end = pattern.indexOf(']', index + 1);
      if (end < 0) {
        expression += '\\[';
        continue;
      }
      let body = pattern.slice(index + 1, end);
      if (body.startsWith('!')) body = `^${body.slice(1)}`;
      else if (body.startsWith('^')) body = `\\^${body.slice(1)}`;
      expression += `[${body}]`;
      index = end;
    } else expression += char.replace(/[|\\{}()[\]^$+?.]/g, '\\$&');
  }
  return new RegExp(`^${expression}$`, 's').test(name);
}

// `*` matches across `/`, and a leading `**/` is tried again without that
// prefix. A positive over-match waits for a workflow; it cannot turn the
// summary green early. Patterns that start with `!` are not positive matches.
function patternHits(file, pattern) {
  const text = String(pattern);
  if (text.startsWith('!')) return false;
  const candidates = text.startsWith('**/') ? [text, text.slice(3)] : [text];
  return candidates.some((candidate) => fnmatch(file, candidate));
}

function listHits(file, patterns) {
  return []
    .concat(patterns ?? [])
    .some((pattern) => patternHits(file, pattern));
}

function asList(value) {
  if (value == null) return null;
  return Array.isArray(value) ? value : [value];
}

function normalizeTriggers(triggers) {
  if (typeof triggers === 'string') return { [triggers]: null };
  if (Array.isArray(triggers)) {
    return Object.fromEntries(triggers.map((name) => [name, null]));
  }
  if (triggers && typeof triggers === 'object') return triggers;
  return {};
}

function workflowExpected(
  triggers,
  { baseRef, labels, files, filesTruncated }
) {
  const on = normalizeTriggers(triggers);
  if (!Object.hasOwn(on, 'pull_request')) return false;
  const pull = on.pull_request ?? {};
  const types = new Set(pull.types ?? POSITIVE_TYPES);
  const admits =
    POSITIVE_TYPES.some((type) => types.has(type)) ||
    (types.has('labeled') && labels.size > 0);
  if (!admits) return false;
  const branches = asList(pull.branches);
  const ignoredBranches = asList(pull['branches-ignore']);
  if (branches && !branches.some((pattern) => fnmatch(baseRef, pattern))) {
    return false;
  }
  if (ignoredBranches?.some((pattern) => fnmatch(baseRef, pattern))) {
    return false;
  }
  if (
    !filesTruncated &&
    pull.paths &&
    !files.some((file) => listHits(file, pull.paths))
  ) {
    return false;
  }
  if (
    !filesTruncated &&
    pull['paths-ignore'] &&
    files.every((file) => listHits(file, pull['paths-ignore']))
  ) {
    return false;
  }
  return true;
}

function isPosterPath(filePath) {
  const text = String(filePath ?? '');
  return (
    text.endsWith('/ci-summary-poster.yml') || text.endsWith('/ci-summary.yml')
  );
}

function isSelfRun(run, selfRunId) {
  return (
    String(run.id) === String(selfRunId) ||
    run.name === CHECK_NAME ||
    run.name === 'CI summary poster' ||
    isPosterPath(run.path)
  );
}

function isSelfCheck(check) {
  return String(check.name ?? '').startsWith(`${CHECK_NAME}`);
}

function names(values) {
  return (values ?? []).map((value) =>
    typeof value === 'string' ? value : value?.name
  );
}

function fileNames(files) {
  return (files ?? []).map((file) =>
    typeof file === 'string' ? file : file.filename
  );
}

function latestRuns(runs) {
  const latest = new Map();
  for (const run of runs) {
    const key = Number(run.workflow_id);
    const current = latest.get(key);
    if (
      !current ||
      run.run_attempt > current.run_attempt ||
      (run.run_attempt === current.run_attempt && run.id > current.id)
    ) {
      latest.set(key, run);
    }
  }
  return latest;
}

function evaluateHead({
  draft,
  baseRef,
  labels,
  files,
  filesTruncated,
  definitions,
  runs,
  checks,
  selfRunId,
  headSha,
}) {
  const labelSet = labels instanceof Set ? labels : new Set(names(labels));
  const paths = fileNames(files);
  const expected = [];
  const unknown = [];
  for (const definition of definitions) {
    if (isPosterPath(definition.path)) continue;
    if (definition.unreadable) {
      unknown.push(definition.name);
      expected.push(definition);
      continue;
    }
    if (
      workflowExpected(definition.triggers, {
        baseRef,
        labels: labelSet,
        files: paths,
        filesTruncated,
      })
    ) {
      expected.push(definition);
    }
  }
  const latest = latestRuns(
    (runs ?? []).filter((run) => !isSelfRun(run, selfRunId))
  );
  const relevantChecks = (checks ?? []).filter((check) => !isSelfCheck(check));
  const missing = expected
    .filter((definition) => !latest.has(Number(definition.id)))
    .map((definition) => definition.name);
  const openRuns = [...latest.values()]
    .filter((run) => run.status !== 'completed')
    .map((run) => run.name);
  const notGreen = [...latest.values()]
    .filter((run) => run.status === 'completed' && run.conclusion !== 'success')
    .map((run) => `${run.name}=${run.conclusion}`);
  const openChecks = relevantChecks
    .filter((check) => check.status !== 'completed')
    .map((check) => check.name);
  const badChecks = relevantChecks
    .filter(
      (check) =>
        check.status === 'completed' &&
        !OK_CHECK_CONCLUSIONS.has(check.conclusion)
    )
    .map((check) => `${check.name}=${check.conclusion}`);
  let conclusion = null;
  let title;
  if (notGreen.length > 0 || badChecks.length > 0) {
    conclusion = 'failure';
    title = `${notGreen.length} run(s), ${badChecks.length} check(s) not green`;
  } else if (
    draft ||
    missing.length > 0 ||
    openRuns.length > 0 ||
    openChecks.length > 0 ||
    latest.size === 0
  ) {
    title = `waiting: ${missing.length} expected run(s) not started, ${openRuns.length + openChecks.length} open${draft ? ' (draft)' : ''}`;
  } else {
    conclusion = 'success';
    title = `${latest.size} expected run(s) green (${expected.length} expected, ${unknown.length} unreadable)`;
  }
  const summary = JSON.stringify(
    {
      missing,
      open: [...openRuns, ...openChecks],
      not_green: [...notGreen, ...badChecks],
      unreadable: unknown,
    },
    null,
    1
  ).slice(0, 60000);
  return { conclusion, title, summary, headSha };
}

function buildCheckRun(decision) {
  const body = {
    name: CHECK_NAME,
    head_sha: decision.headSha,
    status: decision.conclusion ? 'completed' : 'in_progress',
    output: {
      title: decision.title.slice(0, 250),
      summary: decision.summary,
    },
  };
  if (decision.conclusion) body.conclusion = decision.conclusion;
  return body;
}

function defaultParse(text) {
  if (typeof Bun !== 'undefined' && Bun.YAML?.parse)
    return Bun.YAML.parse(text);
  throw new Error('Bun.YAML is required to read workflow triggers');
}

function triggerBlock(document) {
  if (!document || typeof document !== 'object') return { error: true };
  if (Object.hasOwn(document, 'on')) return document.on;
  if (Object.hasOwn(document, 'true')) return document.true;
  return { error: true };
}

function readTriggers(dir, parse = defaultParse) {
  const triggers = new Map();
  const files = fs
    .readdirSync(dir)
    .filter((file) => /\.ya?ml$/u.test(file))
    .sort();
  if (files.length === 0) {
    throw new Error(
      'No workflow files were checked out. Refusing to post a summary.'
    );
  }
  for (const file of files) {
    const key = `.github/workflows/${file}`;
    try {
      triggers.set(
        key,
        triggerBlock(parse(fs.readFileSync(path.join(dir, file), 'utf8')))
      );
    } catch {
      triggers.set(key, { error: true });
    }
  }
  return triggers;
}

function nextLink(header) {
  if (!header) return null;
  for (const part of header.split(',')) {
    const match = /<([^>]+)>;\s*rel="next"/u.exec(part);
    if (match) return match[1];
  }
  return null;
}

function listKey(apiPath) {
  const raw = apiPath.startsWith('http') ? new URL(apiPath).pathname : apiPath;
  const pathName = raw.split('?')[0];
  if (pathName.endsWith('/actions/workflows')) return 'workflows';
  if (pathName.endsWith('/actions/runs')) return 'workflow_runs';
  if (pathName.endsWith('/check-runs')) return 'check_runs';
  return null;
}

async function githubRequest(fetchImpl, token, method, apiPath, body) {
  const url = apiPath.startsWith('http') ? apiPath : `${API}${apiPath}`;
  const response = await fetchImpl(url, {
    method,
    redirect: 'error',
    signal: AbortSignal.timeout(20000),
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'User-Agent': 'tuturuuu-ci-summary',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let parsed = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = { message: text.slice(0, 180) };
    }
  }
  if (!response.ok) {
    throw new Error(
      `GitHub ${method} ${apiPath} failed with ${response.status}: ${parsed?.message || response.statusText}`
    );
  }
  return { body: parsed, link: response.headers.get('link') };
}

async function paginate(request, token, apiPath) {
  const items = [];
  const key = listKey(apiPath);
  let next = apiPath.startsWith('http')
    ? apiPath
    : `${API}${apiPath}${apiPath.includes('?') ? '&' : '?'}per_page=100`;
  while (next) {
    const page = await request(token, 'GET', next);
    const chunk = Array.isArray(page.body) ? page.body : page.body?.[key];
    if (!Array.isArray(chunk)) {
      throw new Error(`GitHub list ${apiPath} did not return a page`);
    }
    items.push(...chunk);
    next = nextLink(page.link);
  }
  return items;
}

async function mintInstallationToken(request, { appId, privateKey, repo }) {
  const jwt = createAppJwt(appId, privateKey);
  const installation = await request(
    jwt,
    'GET',
    `${API}/repos/${repoPath(repo)}/installation`
  );
  const installationId = installation.body?.id;
  if (!Number.isSafeInteger(installationId)) {
    throw new Error(
      'The CI summary GitHub App is not installed on this repository.'
    );
  }
  const minted = await request(
    jwt,
    'POST',
    `${API}/app/installations/${installationId}/access_tokens`,
    { permissions: APP_PERMISSIONS }
  );
  const token = minted.body?.token;
  if (typeof token !== 'string' || !token.startsWith('ghs_')) {
    throw new Error('The CI summary app did not return an installation token.');
  }
  if (minted.body.permissions?.checks !== 'write') {
    throw new Error(
      'The CI summary app token does not have checks: write. The workflow token is not a fallback.'
    );
  }
  return token;
}

function definitionsFrom(active, triggersByPath) {
  return active
    .filter((workflow) => workflow.state === 'active')
    .map((workflow) => {
      const triggers = triggersByPath.get(workflow.path);
      const unreadable = !triggers || triggers.error === true;
      return {
        id: workflow.id,
        name: workflow.name,
        path: workflow.path,
        triggers: unreadable ? null : triggers,
        unreadable,
      };
    });
}

async function pullNumbers(request, token, repo, env) {
  const explicit = String(env.PR_NUMBER ?? '').trim();
  if (/^\d+$/.test(explicit)) return [Number(explicit)];
  if ((env.EVENT_NAME || env.GITHUB_EVENT_NAME) !== 'schedule') return [];
  const pulls = await paginate(
    request,
    token,
    `/repos/${repoPath(repo)}/pulls?state=open`
  );
  return pulls.map((pull) => pull.number);
}

async function summarizeOne({
  request,
  token,
  repo,
  number,
  definitions,
  selfRunId,
}) {
  const slug = repoPath(repo);
  const pull = await request(
    token,
    'GET',
    `${API}/repos/${slug}/pulls/${number}`
  );
  const pr = pull.body;
  const files = await paginate(
    request,
    token,
    `/repos/${slug}/pulls/${number}/files`
  );
  const sha = pr.head.sha;
  const runs = await paginate(
    request,
    token,
    `/repos/${slug}/actions/runs?head_sha=${encodeURIComponent(sha)}`
  );
  const checks = await paginate(
    request,
    token,
    `/repos/${slug}/commits/${encodeURIComponent(sha)}/check-runs?filter=latest`
  );
  const decision = evaluateHead({
    draft: pr.draft === true,
    baseRef: pr.base.ref,
    labels: pr.labels,
    files,
    filesTruncated: files.length >= FILE_CAP,
    definitions,
    runs,
    checks,
    selfRunId,
    headSha: sha,
  });
  const body = buildCheckRun(decision);
  await request(token, 'POST', `${API}/repos/${slug}/check-runs`, body);
  console.log(`${number} ${body.status} ${body.output.title}`);
  return body;
}

async function main(env = process.env, deps = {}) {
  const credentials = readAppCredentials(env);
  const request =
    deps.request ??
    ((token, method, apiPath, body) =>
      githubRequest(
        deps.fetchImpl ?? globalThis.fetch,
        token,
        method,
        apiPath,
        body
      ));
  const repo = env.REPO || env.GITHUB_REPOSITORY;
  const token = await mintInstallationToken(request, { ...credentials, repo });
  const numbers = await pullNumbers(request, token, repo, env);
  if (numbers.length === 0) {
    console.log('no pull requests to summarize');
    return;
  }
  const triggersByPath =
    deps.triggersByPath ??
    readTriggers(env.WORKFLOWS_DIR || '.github/workflows', deps.parse);
  const active = await paginate(
    request,
    token,
    `/repos/${repoPath(repo)}/actions/workflows`
  );
  const definitions = definitionsFrom(active, triggersByPath);
  const failures = [];
  for (const number of numbers) {
    try {
      await summarizeOne({
        request,
        token,
        repo,
        number,
        definitions,
        selfRunId: env.GITHUB_RUN_ID,
      });
    } catch (error) {
      failures.push(error);
      console.error(`pull ${number}: ${error.message}`);
    }
  }
  if (failures.length > 0) {
    throw new Error(
      `CI summary failed for ${failures.length} pull request(s).`
    );
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : 'CI summary failed');
    process.exitCode = 1;
  });
}

module.exports = {
  APP_PERMISSIONS,
  CHECK_NAME,
  buildCheckRun,
  createAppJwt,
  evaluateHead,
  fnmatch,
  main,
  patternHits,
  readAppCredentials,
  readTriggers,
  workflowExpected,
};
