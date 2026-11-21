// Proves that every Cloudflare Worker serving production Web (the activated
// vinext families and the tuturuuu.com gateway) runs code equivalent to one
// production commit, before that commit gets a Cloudflare Web deployment marker.
//
// The evidence is the serving version's own Cloudflare metadata, read with an
// authenticated API token: a family's PLATFORM_DEPLOYMENT_STAMP binding (the
// build commit's first 12 characters, set by build-family.sh) and the gateway
// version message (`<sha>` or `gateway <sha> ...`, set by web-opennext.yaml).
// GitHub then relates that commit to the target:
//   identical  the Worker was built from the target;
//   ahead      the Worker was built from a main descendant of the target;
//   behind     the Worker was built from an ancestor, and nothing in its build
//              scope changed between that ancestor and the target.
// Anything else (diverged, a split rollout, a scope change, a truncated
// comparison) is not proof. Stale Workers are re-read for a bounded time,
// because Web families deploy from main and may still be catching up.
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const GATEWAY_WORKER = 'tuturuuu-gateway';
const FAMILIES_PATH = 'apps/web/cloudflare/vinext/families.json';
const SHARED_SCOPE = [
  'packages/',
  'bun.lock',
  'package.json',
  'patches/',
  '.npmrc',
  '.node-version',
  'tsconfig.json',
  'turbo.json',
  'tuturuuu.ts',
  'tuturuuu.ci.ts',
];
export const FAMILY_SCOPE = Object.freeze([
  'apps/web/',
  'apps/gateway/',
  'scripts/active-app-mounts.mjs',
  'scripts/ci/web-vinext-',
  'scripts/ci/generate-build-metadata.ts',
  ...SHARED_SCOPE,
]);
export const GATEWAY_SCOPE = Object.freeze([
  'apps/gateway/',
  'apps/web/cloudflare/',
  ...SHARED_SCOPE,
  'scripts/ci/gateway-',
  'scripts/ci/cf-build-output-publisher.mjs',
  'scripts/ci/void-cf-publisher.mjs',
  '.github/workflows/web-opennext.yaml',
]);
// GitHub lists at most 300 changed files per comparison.
const COMPARE_FILE_LIMIT = 300;
const fullSha = /^[0-9a-f]{40}$/;
const stampPattern = /^[0-9a-f]{12}$/;
const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
const gatewayMessage = /^(?:gateway )?([0-9a-f]{40})(?:\s|$)/;

class VerificationError extends Error {}

const fail = (code) => {
  throw new VerificationError(code);
};
const assert = (ok, code) => {
  if (!ok) fail(code);
};

/** Workers that serve production Web, from the committed family inventory. */
export function servingWorkers(families) {
  assert(Array.isArray(families?.families), 'families-shape');
  const workers = families.families
    .filter((family) => family.enabled === true && family.activated === true)
    .map((family) => {
      assert(
        /^[a-z0-9-]+$/.test(family.id ?? '') &&
          family.worker === `tuturuuu-web-vinext-${family.id}`,
        'family-worker-name'
      );
      return {
        id: family.id,
        worker: family.worker,
        kind: 'family',
        scope: FAMILY_SCOPE,
      };
    });
  assert(workers.length > 0 && workers.length <= 20, 'family-count');
  assert(
    new Set(workers.map(({ worker }) => worker)).size === workers.length,
    'family-duplicate'
  );
  return [
    ...workers,
    { worker: GATEWAY_WORKER, kind: 'gateway', scope: GATEWAY_SCOPE },
  ];
}

/** The single version serving 100% of a Worker's traffic. */
export function servingVersionId(deployments) {
  assert(
    Array.isArray(deployments) && deployments.length > 0,
    'worker-deployments-missing'
  );
  const created = (row) => Date.parse(row?.created_on);
  assert(
    deployments.every((row) => Number.isFinite(created(row))),
    'worker-deployment-time'
  );
  // Cloudflare returns its deployments newest first, including when two have
  // the same timestamp. Refuse a response whose order does not support that.
  assert(
    deployments.every(
      (row, i) => i === 0 || created(row) <= created(deployments[i - 1])
    ),
    'worker-deployment-order'
  );
  const latest = deployments[0];
  const versions = latest.versions;
  assert(
    Array.isArray(versions) &&
      versions.length === 1 &&
      versions[0]?.percentage === 100 &&
      uuid.test(versions[0]?.version_id ?? ''),
    'worker-split-or-empty-deployment'
  );
  return versions[0].version_id;
}

/** The build commit (12 or 40 hex) a serving version records about itself. */
export function versionCommit(version, { kind, id }) {
  if (kind === 'gateway') {
    const message = version?.annotations?.['workers/message'];
    const match =
      typeof message === 'string' ? gatewayMessage.exec(message) : null;
    assert(match, 'gateway-version-commit-missing');
    return match[1];
  }
  const bindings = version?.resources?.bindings;
  assert(Array.isArray(bindings), 'family-version-bindings');
  const stamps = bindings.filter(
    (binding) =>
      binding?.name === 'PLATFORM_DEPLOYMENT_STAMP' &&
      binding?.type === 'plain_text'
  );
  assert(
    stamps.length === 1 && stampPattern.test(stamps[0].text ?? ''),
    'family-version-stamp-missing'
  );
  const message = version.annotations?.['workers/message'];
  const commit =
    typeof message === 'string' && message.startsWith(`vinext ${id} `)
      ? message.slice(`vinext ${id} `.length)
      : '';
  assert(
    (fullSha.test(commit) || stampPattern.test(commit)) &&
      commit.startsWith(stamps[0].text),
    'family-version-commit-mismatch'
  );
  return commit;
}

function checkGatewayRoutes(version, families) {
  const bindings = version?.resources?.bindings;
  assert(Array.isArray(bindings), 'gateway-version-bindings');
  const flags = bindings.filter(
    (binding) => binding?.name === 'GATEWAY_WEB_FAMILIES'
  );
  assert(
    flags.length === 1 &&
      flags[0].type === 'plain_text' &&
      typeof flags[0].text === 'string',
    'gateway-family-flags'
  );
  const routedIds = new Set(
    flags[0].text
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean)
  );
  // public-docs is a separate OpenNext publisher and is not part of the vinext matrix.
  routedIds.delete('public-docs');
  assert(routedIds.size === families.length, 'gateway-family-inventory');
  for (const { id, worker } of families) {
    const name = `WEB_FAMILY_${id.toUpperCase().replaceAll('-', '_')}`;
    const services = bindings.filter((binding) => binding?.name === name);
    assert(
      routedIds.has(id) &&
        services.length === 1 &&
        services[0].type === 'service' &&
        services[0].service === worker,
      'gateway-family-binding'
    );
  }
}

/** Whether a served commit is equivalent to the target for this scope. */
export function relationVerdict({
  comparison,
  forwardComparison,
  scope,
  onMain,
}) {
  const status = comparison?.status;
  if (status === 'identical') return { ok: true, relation: 'identical' };
  if (status === 'ahead')
    return onMain
      ? { ok: true, relation: 'ahead' }
      : { ok: false, relation: 'ahead-off-main' };
  if (status !== 'behind') return { ok: false, relation: 'diverged' };
  const files = forwardComparison?.files;
  if (forwardComparison?.status !== 'ahead')
    return { ok: false, relation: 'behind-unprovable' };
  if (!Array.isArray(files) || files.length >= COMPARE_FILE_LIMIT)
    return { ok: false, relation: 'behind-unprovable' };
  const touched = files.some(
    (file) =>
      typeof file?.filename !== 'string' ||
      [file?.filename, file?.previous_filename].some(
        (name) =>
          typeof name === 'string' &&
          scope.some((prefix) =>
            prefix.endsWith('/') || prefix.endsWith('-')
              ? name.startsWith(prefix)
              : name === prefix
          )
      )
  );
  return touched
    ? { ok: false, relation: 'behind-stale' }
    : { ok: true, relation: 'behind-unchanged' };
}

function jsonRequest(request, url, headers, budget) {
  assert(++budget.used <= budget.limit, 'request-budget');
  return request(url, {
    method: 'GET',
    redirect: 'error',
    headers,
    signal: AbortSignal.timeout(15000),
  })
    .catch(() => fail('api-request'))
    .then(async (response) => {
      assert(response.ok, 'api-response');
      return response.json().catch(() => fail('api-json'));
    });
}

export async function verifyCloudflareWeb({
  env = process.env,
  request = fetch,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  now = Date.now,
  families = JSON.parse(readFileSync(FAMILIES_PATH, 'utf8')),
} = {}) {
  const target = env.TARGET_SHA;
  const repo = env.GITHUB_REPOSITORY;
  const account = env.CLOUDFLARE_ACCOUNT_ID;
  assert(
    fullSha.test(target ?? '') &&
      /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo ?? '') &&
      /^[0-9a-f]{32}$/.test(account ?? '') &&
      env.CLOUDFLARE_API_TOKEN &&
      env.GH_TOKEN,
    'verify-input'
  );
  const waitSeconds = Number(env.WEB_SERVING_WAIT_SECONDS ?? 1200);
  assert(
    Number.isInteger(waitSeconds) && waitSeconds >= 0 && waitSeconds <= 1200,
    'verify-wait'
  );
  const pollMs = 120000;
  const deadline = now() + waitSeconds * 1000;
  const workers = servingWorkers(families);
  const github = (route) =>
    jsonRequest(
      request,
      `https://api.github.com/repos/${repo}${route}`,
      {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${env.GH_TOKEN}`,
        'X-GitHub-Api-Version': '2022-11-28',
      },
      githubBudget
    );
  const cloudflare = async (route) => {
    const body = await jsonRequest(
      request,
      `https://api.cloudflare.com/client/v4/accounts/${account}/workers/scripts${route}`,
      {
        Authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}`,
        'Cache-Control': 'no-cache',
      },
      cloudflareBudget
    );
    assert(body?.success === true && body.result, 'cloudflare-response');
    return body.result;
  };
  const githubBudget = { used: 0, limit: 60 };
  const cloudflareBudget = { used: 0, limit: 600 };
  // GitHub answers are immutable per commit, so each is fetched once.
  const commits = new Map();
  const comparisons = new Map();
  const resolveCommit = async (commit) => {
    if (!commits.has(commit)) {
      const data = await github(`/commits/${commit}`);
      assert(
        fullSha.test(data?.sha ?? '') && data.sha.startsWith(commit),
        'served-commit-unknown'
      );
      commits.set(commit, data.sha);
    }
    return commits.get(commit);
  };
  const compare = async (base, head) => {
    const key = `${base}...${head}`;
    if (!comparisons.has(key))
      comparisons.set(key, await github(`/compare/${key}?per_page=1`));
    return comparisons.get(key);
  };

  const readServingVersion = async (worker) => {
    const { deployments } = await cloudflare(`/${worker}/deployments`);
    return servingVersionId(deployments);
  };
  for (let round = 1; ; round += 1) {
    const results = [];
    for (const { worker, kind, scope, id } of workers) {
      try {
        const versionId = await readServingVersion(worker);
        const version = await cloudflare(`/${worker}/versions/${versionId}`);
        assert(version?.id === versionId, 'worker-version-identity');
        if (kind === 'gateway')
          checkGatewayRoutes(version, workers.slice(0, -1));
        const servedCommit = versionCommit(version, { kind, id });
        const served =
          servedCommit === target ? target : await resolveCommit(servedCommit);
        const comparison =
          target === served
            ? { status: 'identical' }
            : await compare(target, served);
        // A descendant only counts when it is a main commit.
        const onMain =
          comparison.status === 'ahead' &&
          ['identical', 'behind'].includes(
            (await compare('refs/heads/main', served)).status
          );
        const verdict = relationVerdict({
          comparison,
          forwardComparison:
            comparison.status === 'behind'
              ? await compare(served, target)
              : undefined,
          scope,
          onMain,
        });
        results.push({ worker, versionId, served, ...verdict });
      } catch (error) {
        results.push({
          worker,
          ok: false,
          relation:
            error instanceof VerificationError ? error.message : 'api-unproven',
        });
      }
    }
    if (results.every((result) => result.ok)) {
      for (const result of results) {
        if (
          (await readServingVersion(result.worker).catch(() => null)) !==
          result.versionId
        ) {
          result.ok = false;
          result.relation = 'worker-deployment-changed';
        }
      }
      if (results.every((result) => result.ok)) return { round, results };
    }
    if (now() + pollMs > deadline) {
      const error = new VerificationError('web-serving-unproven');
      error.results = results;
      throw error;
    }
    await sleep(pollMs);
  }
}

function summaryTable(results) {
  return [
    '| Worker | Version | Served commit | Relation |',
    '| --- | --- | --- | --- |',
    ...results.map(
      ({ worker, versionId, served, relation }) =>
        `| \`${worker}\` | ${versionId ?? '-'} | ${served ? `\`${served.slice(0, 12)}\`` : '-'} | ${relation} |`
    ),
  ].join('\n');
}

async function main() {
  const env = process.env;
  let outcome;
  try {
    outcome = { status: 'success', ...(await verifyCloudflareWeb()) };
  } catch (error) {
    outcome = {
      status: 'denied',
      code: error instanceof VerificationError ? error.message : 'api-unproven',
      results: error?.results ?? [],
    };
  }
  // Fixed codes, Worker names, version ids and commits only: never API bodies or credentials.
  const receipt = JSON.stringify({ target: env.TARGET_SHA, ...outcome });
  if (env.WEB_VERIFY_RESULT_FILE)
    writeFileSync(env.WEB_VERIFY_RESULT_FILE, `${receipt}\n`, { mode: 0o600 });
  if (env.GITHUB_STEP_SUMMARY)
    appendFileSync(
      env.GITHUB_STEP_SUMMARY,
      `## Cloudflare Web serving proof\n\n${outcome.status === 'success' ? 'Verified' : `Denied: ${outcome.code}`}\n\n${summaryTable(outcome.results)}\n`
    );
  console.log(`RESULT ${receipt}`);
  if (outcome.status !== 'success') process.exitCode = 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
