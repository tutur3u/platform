// biome-ignore-all lint/suspicious/noUndeclaredEnvVars: Direct CI entrypoint; credentials never enter Turbo builds.
// Fail-closed guards for the Cloudflare-only wave-1 web staging publisher.
// Everything here is credential-free and runs before any Cloudflare call:
//
//   node scripts/ci/wave1-staging-guard.mjs preflight   # environments, fence, vars
//   node scripts/ci/wave1-staging-guard.mjs admission   # admission var is set
//
// Unset is never `true`: a missing fence, admission, D1 id or protected
// environment stops the run. Staging identities live under `tutur3u.com`
// (`<app>.tutur3u.com` stages `<app>.tuturuuu.com`) and never under
// `tuturuuu.com`.
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { profiles } from './wave1-native-profile.mjs';

/** Environments whose protection the preflight proves before any credential. */
export const REQUIRED_ENVIRONMENTS = Object.freeze(['wave1-web-staging']);

const STAGING_HOST = /^(?:[a-z0-9-]+\.tutur3u\.com|tutur3u\.com)$/u;
const SCRIPT_NAME = /^[a-z0-9-]+$/u;
const ENVIRONMENT_NAME = /^[a-z0-9-]+$/u;
const REPOSITORY = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u;

/**
 * Validates the reviewed allowlist itself, so a malformed profile entry can
 * never widen what the publisher may touch.
 */
export function stagingAllowlist(allowlist = profiles.webStaging?.allowlist) {
  const { scripts, hosts } = allowlist ?? {};
  assert.ok(
    Array.isArray(scripts) && scripts.length > 0,
    'Staging Worker allowlist is missing'
  );
  assert.ok(
    Array.isArray(hosts) && hosts.length > 0,
    'Staging host allowlist is missing'
  );
  for (const script of scripts)
    assert.ok(
      typeof script === 'string' && SCRIPT_NAME.test(script),
      'Malformed staging Worker allowlist entry'
    );
  for (const host of hosts) assertStagingHostShape(host);
  return {
    scripts: Object.freeze([...scripts]),
    hosts: Object.freeze([...hosts]),
  };
}

function assertStagingHostShape(host) {
  assert.ok(
    typeof host === 'string' &&
      STAGING_HOST.test(host) &&
      host !== 'tuturuuu.com' &&
      !host.endsWith('.tuturuuu.com'),
    'Staging host must be tutur3u.com or <label>.tutur3u.com'
  );
}

export function assertStagingScript(name, allowlist) {
  const allowed = stagingAllowlist(allowlist);
  assert.ok(
    typeof name === 'string' &&
      SCRIPT_NAME.test(name) &&
      allowed.scripts.includes(name),
    'Worker script is not an allowlisted staging script'
  );
  return name;
}

export function assertStagingHost(host, allowlist) {
  const allowed = stagingAllowlist(allowlist);
  assertStagingHostShape(host);
  assert.ok(
    allowed.hosts.includes(host),
    'Route host is not an allowlisted staging host'
  );
  return host;
}

/** The only D1 database the staging publisher may read or write. */
export function assertStagingD1(databaseId, configuredId) {
  assert.ok(
    typeof configuredId === 'string' && configuredId.length > 0,
    'WAVE1_STAGING_ATTEMPT_D1_ID is not configured'
  );
  assert.ok(
    typeof databaseId === 'string' && databaseId === configuredId,
    'Refusing a D1 database other than WAVE1_STAGING_ATTEMPT_D1_ID'
  );
  return databaseId;
}

/** Every identity a staging publication names, checked before any API call. */
export function assertStagingIdentity({ worker, hosts = [], databaseId, env }) {
  assertStagingScript(worker);
  for (const host of hosts) assertStagingHost(host);
  if (databaseId !== undefined)
    assertStagingD1(databaseId, env?.WAVE1_STAGING_ATTEMPT_D1_ID);
}

/** Unset (or anything but exactly `true`) is a closed fence. */
export function assertFenceOpen(value) {
  assert.equal(value, 'true', 'Publication stop fence is not enabled');
}

export function assertAdmissionSet(value) {
  assert.ok(
    typeof value === 'string' && value.trim().length > 0,
    'Staging publication admission is not set'
  );
}

export function assertEnvironmentProtected(name, environment, policies) {
  const reviewers = (environment?.protection_rules ?? []).filter(
    (rule) => rule?.type === 'required_reviewers'
  );
  assert.ok(
    reviewers.some((rule) =>
      (Array.isArray(rule.reviewers) ? rule.reviewers : []).some(
        (entry) => entry?.type === 'User' || entry?.type === 'Team'
      )
    ),
    `Environment ${name} has no required reviewers`
  );
  // The dispatcher must never be able to approve their own deployment.
  assert.ok(
    reviewers.every((rule) => rule.prevent_self_review === true),
    `Environment ${name} does not prevent self-review`
  );
  const policy = environment?.deployment_branch_policy;
  assert.ok(
    policy?.custom_branch_policies === true &&
      policy.protected_branches === false,
    `Environment ${name} is not limited to a custom branch policy`
  );
  const branches = policies?.branch_policies ?? [];
  assert.ok(
    branches.length === 1 &&
      branches[0]?.name === 'main' &&
      branches[0]?.type === 'branch',
    `Environment ${name} must deploy from the main branch only`
  );
}

async function githubJson(url, token, fetcher) {
  const response = await fetcher(url, {
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${token}`,
      'x-github-api-version': '2022-11-28',
    },
    redirect: 'error',
    signal: AbortSignal.timeout(15000),
  });
  assert.equal(response.status, 200, `GitHub API answered ${response.status}`);
  return response.json();
}

/**
 * Proves every named environment exists with required reviewers (self-review
 * prevented) and a main-only deployment branch policy. Any API error, 404 or unexpected shape
 * stops the run.
 */
export async function preflightEnvironments({
  repository,
  token,
  environments = REQUIRED_ENVIRONMENTS,
  fetcher = fetch,
}) {
  assert.match(repository ?? '', REPOSITORY, 'Repository identity required');
  assert.ok(token, 'GitHub token required');
  assert.ok(environments.length > 0, 'No environments to verify');
  for (const name of environments) {
    assert.match(name, ENVIRONMENT_NAME, 'Malformed environment name');
    const base = `https://api.github.com/repos/${repository}/environments/${name}`;
    let environment;
    let policies;
    try {
      environment = await githubJson(base, token, fetcher);
      policies = await githubJson(
        `${base}/deployment-branch-policies`,
        token,
        fetcher
      );
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'unknown';
      // The preflight is credential-free: never widen github.token to fix this.
      const hint = /answered (?:403|404)\b/u.test(reason)
        ? ' (a missing environment, or a workflow token that cannot read environment protection rules)'
        : '';
      throw new Error(
        `Environment ${name} could not be verified: ${reason}${hint}`
      );
    }
    assert.equal(environment?.name, name, `Environment ${name} is missing`);
    assertEnvironmentProtected(name, environment, policies);
  }
  return [...environments];
}

/** Credential-free preflight: protection, fence and provisioned identifiers. */
export async function preflight({ env, fetcher = fetch }) {
  assertFenceOpen(env.WAVE1_STAGING_PUBLISH_ENABLED);
  assert.ok(
    env.WAVE1_STAGING_ATTEMPT_D1_ID,
    'WAVE1_STAGING_ATTEMPT_D1_ID is not configured'
  );
  assert.equal(
    env.CLOUDFLARE_STAGING_ACCOUNT_ID,
    profiles.accountId,
    'Staging account admission mismatch'
  );
  stagingAllowlist();
  return preflightEnvironments({
    repository: env.GITHUB_REPOSITORY,
    token: env.GH_TOKEN,
    fetcher,
  });
}

export async function main(argv = process.argv.slice(2), env = process.env) {
  const [mode] = argv;
  if (mode === 'preflight') {
    const checked = await preflight({ env });
    console.log(`Verified protected environments: ${checked.join(', ')}`);
    return;
  }
  if (mode === 'admission') {
    assertFenceOpen(env.WAVE1_STAGING_PUBLISH_ENABLED);
    assertAdmissionSet(env.WAVE1_STAGING_PUBLICATION_ADMISSION);
    console.log('Staging fence and admission are set');
    return;
  }
  throw new Error(`Unknown mode ${mode}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main().catch((error) => {
    console.error(
      error instanceof Error ? error.message : 'Wave-1 staging guard failed'
    );
    process.exitCode = 1;
  });
