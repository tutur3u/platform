// biome-ignore-all lint/suspicious/noUndeclaredEnvVars: Direct CI entrypoint; credentials never enter Turbo builds.
// Staging Web Next fallback: one admitted Vercel deployment per SHA, verified
// before any serving step (staging-web-publisher §3, V1b, Tess gate (a)–(c)).
//
//   node scripts/ci/wave1-web-next.mjs deploy  <sha>   # protected next env
//   node scripts/ci/wave1-web-next.mjs verify  <sha>   # protected next env
//   node scripts/ci/wave1-web-next.mjs recheck <sha>   # read-only re-probe
//
// `deploy` makes at most one `vercel deploy --prebuilt` for a SHA, behind a
// signed D1 CAS; a lost receipt is reconciled from Vercel, never redeployed.
// `verify` alone writes `verified`. Domain attach and WEB_STAGING_SERVING=on
// are never performed here: they stay manual release-owner actions.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { boundedJson } from './wave1-native-publish.mjs';
import {
  requireVerifiedNext,
  webNextLedger,
} from './wave1-web-next-ledger.mjs';
import {
  deploymentHosts,
  evaluateDeployment,
  evaluateProtection,
  VERCEL_API,
  vercelProbes,
} from './wave1-web-vercel.mjs';

const github = (env, name) =>
  `https://api.github.com/repos/${env.GITHUB_REPOSITORY}/actions/variables/${name}`;

/** WEB_STAGING_NEXT_ADMISSION: exactly one deployment for one exact SHA. */
export function nextAdmission(raw, sha) {
  assert.equal(typeof raw, 'string', 'Missing exact Web Next admission');
  assert.ok(raw.length <= 1024, 'Web Next admission exceeds budget');
  const record = JSON.parse(raw);
  assert.deepEqual(
    Object.keys(record).sort(),
    [
      'app',
      'maxDeploysPerSha',
      'schema',
      'sourceSha',
      'target',
      'vercelProjectIdEnv',
    ],
    'Unexpected Web Next admission fields'
  );
  assert.equal(record.schema, 1);
  assert.equal(record.app, 'web-next');
  assert.equal(record.sourceSha, sha, 'Unadmitted Web Next source SHA');
  assert.equal(record.vercelProjectIdEnv, 'VERCEL_WEB_STAGING_PROJECT_ID');
  assert.equal(record.target, 'staging');
  assert.equal(record.maxDeploysPerSha, 1);
  return record;
}

function context(env, fetcher) {
  const request = (url, token, body) => boundedJson(url, token, fetcher, body);
  const team = encodeURIComponent(env.VERCEL_ORG_ID ?? '');
  const vercel = (path) =>
    request(
      `${VERCEL_API}${path}${path.includes('?') ? '&' : '?'}teamId=${team}`,
      env.VERCEL_TOKEN_WEB_STAGING
    );
  assert.ok(
    env.VERCEL_TOKEN_WEB_STAGING && env.VERCEL_ORG_ID,
    'Missing Vercel staging credentials'
  );
  assert.ok(
    env.CLOUDFLARE_STAGING_API_TOKEN && !env.CLOUDFLARE_API_TOKEN,
    'Missing or unsafe Cloudflare token'
  );
  assert.match(env.CLOUDFLARE_STAGING_ACCOUNT_ID ?? '', /^[a-f0-9]{32}$/u);
  const ledger = () =>
    webNextLedger({
      request,
      base: `https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_STAGING_ACCOUNT_ID}`,
      token: env.CLOUDFLARE_STAGING_API_TOKEN,
      databaseId: env.WAVE1_STAGING_ATTEMPT_D1_ID,
      repository: env.GITHUB_REPOSITORY,
      projectId: env.VERCEL_WEB_STAGING_PROJECT_ID,
    });
  return { request, vercel, ledger };
}

/** Fresh stop fence plus exact Next admission, read immediately before writing. */
async function assertAdmitted(env, request, sha) {
  const flag = await request(
    github(env, 'WAVE1_STAGING_PUBLISH_ENABLED'),
    env.WAVE1_CONTROL_READ_TOKEN
  );
  assert.equal(flag.value, 'true', 'Publication stop fence is disabled');
  const fresh = await request(
    github(env, 'WEB_STAGING_NEXT_ADMISSION'),
    env.WAVE1_CONTROL_READ_TOKEN
  );
  nextAdmission(fresh.value, sha);
}

/**
 * Re-reads the deployment, its every hostname and the project protection, and
 * re-runs N15–N17 plus the anonymous `_next/image`/monitoring probes. Used by
 * verify, by the publisher right before upload (b) and after publishing (c).
 */
export async function recheckNext({
  env,
  fetcher = fetch,
  sha,
  deploymentId,
  withProof = true,
}) {
  const { vercel } = context(env, fetcher);
  const projectId = env.VERCEL_WEB_STAGING_PROJECT_ID;
  const failures = [];
  const project = await vercel(`/v9/projects/${encodeURIComponent(projectId)}`);
  failures.push(
    ...evaluateProtection(project, env.VERCEL_AUTOMATION_BYPASS_SECRET)
  );
  if (project?.id !== projectId) failures.push('Project id differs');
  const deployment = await vercel(
    `/v13/deployments/${encodeURIComponent(deploymentId)}`
  );
  failures.push(
    ...evaluateDeployment(deployment, { projectId, sha, deploymentId })
  );
  const aliases = await vercel(
    `/v2/deployments/${encodeURIComponent(deploymentId)}/aliases`
  );
  const domains = await vercel(
    `/v9/projects/${encodeURIComponent(projectId)}/domains?limit=100`
  );
  const enumerated = deploymentHosts({ deployment, aliases, domains });
  failures.push(...enumerated.failures);
  const checks = enumerated.failures.length
    ? []
    : await vercelProbes({
        hosts: enumerated.hosts,
        fetcher,
        bypassSecret: env.VERCEL_AUTOMATION_BYPASS_SECRET,
        proofSecret: withProof ? env.TRUSTED_PROXY_ORIGIN_SECRET : undefined,
      });
  for (const check of checks)
    if (!check.ok) failures.push(`${check.id} ${check.host}: ${check.detail}`);
  return {
    ok: failures.length === 0,
    failures,
    origin: `https://${deployment?.url}`,
    hosts: enumerated.hosts,
    checks,
  };
}

function parseDeploymentUrl(stdout) {
  const urls =
    String(stdout).match(
      /https:\/\/tuturuuu-web-staging-[a-z0-9-]+\.vercel\.app/gu
    ) ?? [];
  assert.equal(
    new Set(urls).size,
    1,
    'Vercel deploy must report exactly one staging URL'
  );
  return urls[0];
}

export async function deploy({
  env,
  sha,
  fetcher = fetch,
  exec = execFileSync,
}) {
  const { request, vercel, ledger: open } = context(env, fetcher);
  await assertAdmitted(env, request, sha);
  const ledger = await open();
  const existing = ledger.entryFor(sha);
  let entry = existing;
  if (!existing) {
    await ledger.start(sha, env.GITHUB_RUN_ID, env.GITHUB_RUN_ATTEMPT);
    await assertAdmitted(env, request, sha);
    let stdout = '';
    try {
      stdout = exec(
        'vercel',
        [
          'deploy',
          '--prebuilt',
          '--archive=tgz',
          '--target=staging',
          '--meta',
          `githubCommitSha=${sha}`,
          '--yes',
        ],
        {
          cwd: 'apps/web',
          encoding: 'utf8',
          timeout: 600_000,
          maxBuffer: 1024 * 1024,
          stdio: ['ignore', 'pipe', 'pipe'],
          // Only what the Vercel CLI needs: no Cloudflare or GitHub credential.
          env: {
            PATH: env.PATH,
            HOME: env.HOME,
            CI: 'true',
            VERCEL_TOKEN: env.VERCEL_TOKEN_WEB_STAGING,
            VERCEL_ORG_ID: env.VERCEL_ORG_ID,
            VERCEL_PROJECT_ID: env.VERCEL_WEB_STAGING_PROJECT_ID,
          },
        }
      );
    } catch {
      // The write may have happened: stay pending (uncertain), never retry.
      throw new Error(
        'Vercel deploy outcome uncertain; reconcile from Vercel before any retry'
      );
    }
    const deployment = await vercel(
      `/v13/deployments/${encodeURIComponent(new URL(parseDeploymentUrl(stdout)).hostname)}`
    );
    const failures = evaluateDeployment(deployment, {
      projectId: env.VERCEL_WEB_STAGING_PROJECT_ID,
      sha,
      deploymentId: deployment?.id,
    });
    assert.deepEqual(failures, [], failures.join('; '));
    await ledger.deployed(sha, {
      deploymentId: deployment.id,
      origin: `https://${deployment.url}`,
    });
    entry = ledger.entryFor(sha);
  } else if (existing.state === 'pending') {
    // Reconcile a lost receipt from Vercel; absence is not proof of no write.
    const listed = await vercel(
      `/v6/deployments?projectId=${encodeURIComponent(env.VERCEL_WEB_STAGING_PROJECT_ID)}&limit=100`
    );
    const matches = (listed?.deployments ?? []).filter(
      (d) => d.meta?.githubCommitSha === sha
    );
    assert.equal(
      matches.length,
      1,
      'Pending Next deployment needs owner reconciliation; never redeploy'
    );
    const deployment = await vercel(
      `/v13/deployments/${encodeURIComponent(matches[0].uid ?? matches[0].id)}`
    );
    const failures = evaluateDeployment(deployment, {
      projectId: env.VERCEL_WEB_STAGING_PROJECT_ID,
      sha,
      deploymentId: deployment?.id,
    });
    assert.deepEqual(failures, [], failures.join('; '));
    await ledger.deployed(sha, {
      deploymentId: deployment.id,
      origin: `https://${deployment.url}`,
    });
    entry = ledger.entryFor(sha);
  }
  assert.ok(
    ['deployed', 'verified'].includes(entry.state),
    `Next deployment is ${entry.state}`
  );
  return { deploymentId: entry.deploymentId, origin: entry.origin };
}

export async function verify({ env, sha, fetcher = fetch }) {
  const { request, ledger: open } = context(env, fetcher);
  await assertAdmitted(env, request, sha);
  const ledger = await open();
  const entry = ledger.entryFor(sha);
  assert.ok(
    entry && ['deployed', 'verified'].includes(entry.state),
    'No deployed Next build for this SHA'
  );
  const result = await recheckNext({
    env,
    fetcher,
    sha,
    deploymentId: entry.deploymentId,
  });
  assert.equal(
    result.origin,
    entry.origin,
    'Deployment URL differs from the ledger'
  );
  assert.deepEqual(
    result.failures,
    [],
    `Next verification refused:\n${result.failures.join('\n')}`
  );
  if (entry.state === 'deployed')
    await ledger.verified(sha, {
      deploymentId: entry.deploymentId,
      verifyRunId: env.GITHUB_RUN_ID,
      verifyRunAttempt: env.GITHUB_RUN_ATTEMPT,
    });
  return {
    deploymentId: entry.deploymentId,
    origin: entry.origin,
    checks: result.checks.length,
  };
}

/**
 * Publisher gate (a): the admitted pair is the ledger's verified entry, bound
 * to this SHA, deployment, project and origin. Read-only.
 */
export async function requireVerifiedPair({
  env,
  fetcher,
  sha,
  deploymentId,
  origin,
}) {
  const { ledger: open } = context(env, fetcher);
  return requireVerifiedNext(await open(), {
    sha,
    deploymentId,
    origin,
    projectId: env.VERCEL_WEB_STAGING_PROJECT_ID,
  });
}

async function cli(argv = process.argv.slice(2), env = process.env) {
  const [mode, sha] = argv;
  assert.match(sha ?? '', /^[a-f0-9]{40}$/u, 'Exact source SHA required');
  assert.equal(
    env.GITHUB_REF,
    'refs/heads/main',
    'Web staging runs from main only'
  );
  if (mode === 'deploy') {
    const out = await deploy({ env, sha });
    if (env.GITHUB_OUTPUT)
      appendFileSync(
        env.GITHUB_OUTPUT,
        `deployment_id=${out.deploymentId}\norigin=${out.origin}\n`
      );
    console.log(`Next deployment ${out.deploymentId} recorded for ${sha}`);
  } else if (mode === 'verify') {
    const out = await verify({ env, sha });
    if (env.GITHUB_OUTPUT)
      appendFileSync(
        env.GITHUB_OUTPUT,
        `deployment_id=${out.deploymentId}\norigin=${out.origin}\n`
      );
    console.log(
      `Next deployment ${out.deploymentId} verified (${out.checks} probes)`
    );
  } else if (mode === 'recheck') {
    const result = await recheckNext({ env, sha, deploymentId: argv[2] });
    console.log(
      JSON.stringify(
        { ok: result.ok, failures: result.failures, checks: result.checks },
        null,
        2
      )
    );
    if (!result.ok) process.exitCode = 1;
  } else throw new Error(`Unknown mode ${mode}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  cli().catch((error) => {
    console.error(
      error instanceof Error ? error.message : 'Web Next step failed'
    );
    process.exitCode = 1;
  });
