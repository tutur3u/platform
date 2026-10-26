// biome-ignore-all lint/suspicious/noUndeclaredEnvVars: Protected CI publication entrypoint.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { productionPublicationHold } from './production-publication-policy.ts';
import {
  artifactDigest,
  publicInputsDigest,
  verify,
} from './wave1-native-artifact.mjs';
import { profiles } from './wave1-native-profile.mjs';
import {
  boundedJson,
  matchesVersion,
  requireRollback,
  uploadArtifact,
} from './wave1-native-publish.mjs';

export function assertRouteFree(config) {
  assert.deepEqual(
    Object.keys(config).sort(),
    [
      'name',
      'account_id',
      'main',
      'no_bundle',
      'compatibility_date',
      'compatibility_flags',
      'rules',
      'assets',
      'workers_dev',
      'preview_urls',
      'routes',
      'secrets',
      'vars',
      'observability',
    ].sort(),
    'Unexpected production configuration keys'
  );
  assert.deepEqual(
    config.routes,
    [],
    'Production upload must have no routes or Custom Domains'
  );
  assert.equal(config.workers_dev, false);
  assert.equal(config.preview_urls, false);
  assert.equal(config.no_bundle, true);
}

const uploadStepName = 'Upload once without attaching serving topology';
async function assertNoEarlierUpload({ env, sha, fetcher }) {
  const base = `https://api.github.com/repos/${env.GITHUB_REPOSITORY}/actions`;
  const runs = await boundedJson(
    `${base}/workflows/wave1-native-production.yaml/runs?branch=production&event=workflow_dispatch&per_page=100`,
    env.GITHUB_TOKEN,
    fetcher
  );
  assert.ok(
    Array.isArray(runs.workflow_runs) &&
      runs.total_count < 100 &&
      runs.total_count === runs.workflow_runs.length,
    'Unbounded or incomplete publication history'
  );
  assert.ok(
    runs.workflow_runs.some(
      (run) =>
        String(run.id) === env.GITHUB_RUN_ID &&
        run.head_sha === sha &&
        run.head_branch === 'production'
    ),
    'Current production run missing from history'
  );
  for (const run of runs.workflow_runs) {
    if (
      run.head_branch !== 'production' ||
      (String(run.id) === env.GITHUB_RUN_ID && env.GITHUB_RUN_ATTEMPT === '1')
    )
      continue;
    assert.ok(
      Number.isSafeInteger(run.id) && run.id > 0,
      'Malformed prior run identity'
    );
    const jobs = await boundedJson(
      `${base}/runs/${run.id}/jobs?filter=all&per_page=100`,
      env.GITHUB_TOKEN,
      fetcher
    );
    assert.ok(
      Array.isArray(jobs.jobs) &&
        jobs.total_count < 100 &&
        jobs.total_count === jobs.jobs.length,
      'Unknown earlier upload status; never replay'
    );
    const publishers = jobs.jobs.filter((job) => job.name === 'publish');
    if (!publishers.length) {
      assert.equal(
        run.status,
        'queued',
        'Unknown earlier upload status; never replay'
      );
      continue;
    }
    for (const job of publishers) {
      if (job.conclusion === 'skipped' || job.status === 'queued') continue;
      const step = job.steps?.find((entry) => entry.name === uploadStepName);
      assert.ok(step, 'Unknown earlier upload step; never replay');
      const notStarted =
        step.conclusion === 'skipped' ||
        (['queued', 'pending'].includes(step.status) && !step.started_at);
      assert.ok(
        notStarted,
        'Earlier production upload started or is unknown; owner reconciliation required, never replay'
      );
    }
  }
}

export async function main({
  argv = process.argv.slice(2),
  env = process.env,
  fetcher = fetch,
  exec,
  appRoot,
  preflightTimeoutMs = 90_000,
} = {}) {
  const [app, sha] = argv;
  assert.ok(Object.hasOwn(profiles.apps, app), 'Unknown wave-1 frontend');
  assert.match(sha ?? '', /^[a-f0-9]{40}$/);
  assert.equal(
    productionPublicationHold(`${app}-cloudflare.yaml`),
    undefined,
    'Production publication is held'
  );
  assert.equal(env.GITHUB_REF, 'refs/heads/production');
  assert.equal(env.GITHUB_EVENT_NAME, 'workflow_dispatch');
  assert.equal(env.PUBLICATION_ENVIRONMENT, 'wave1-calendar-production');
  assert.equal(env.GITHUB_SHA, sha);
  assert.match(env.GITHUB_RUN_ATTEMPT ?? '', /^[1-9]\d*$/);
  assert.match(env.GITHUB_RUN_ID ?? '', /^\d+$/);
  assert.match(env.GITHUB_REPOSITORY ?? '', /^[\w.-]+\/[\w.-]+$/);
  assert.ok(
    !env.CLOUDFLARE_STAGING_API_TOKEN && !env.CLOUDFLARE_API_TOKEN,
    'Only the named production credential is admitted'
  );
  const token = env.WAVE1_PRODUCTION_CLOUDFLARE_API_TOKEN;
  const topologyToken = env.WAVE1_PRODUCTION_CLOUDFLARE_READ_TOKEN;
  assert.ok(
    token && topologyToken && env.GITHUB_TOKEN,
    'Missing named production/read credential'
  );
  appRoot ??= resolve('apps', app);
  const validate = () => {
    assert.equal(
      productionPublicationHold(`${app}-cloudflare.yaml`),
      undefined,
      'Production publication is held'
    );
    const artifact = verify(appRoot, app, 'production', sha);
    assertRouteFree(JSON.parse(readFileSync(artifact.config, 'utf8')));
    assert.equal(
      artifact.receipt.publicInputsSha256,
      publicInputsDigest(env),
      'Production public inputs differ'
    );
    assert.ok(
      env.NEXT_PUBLIC_SUPABASE_URL &&
        !env.NEXT_PUBLIC_SUPABASE_URL.includes('.invalid'),
      'Production public configuration is not provisioned'
    );
    return artifact;
  };
  const { receipt, config } = validate();
  const p = receipt.profile;
  const digest = artifactDigest(receipt);
  const base = `https://api.cloudflare.com/client/v4/accounts/${p.accountId}`;
  let deadline = AbortSignal.timeout(preflightTimeoutMs);
  const boundedFetch = (url, options) =>
    fetcher(url, {
      ...options,
      signal: AbortSignal.any([options.signal, deadline]),
    });
  const provider = async (url, credential = token) => {
    const response = await boundedJson(url, credential, boundedFetch);
    assert.equal(response.success, true, 'Provider observation failed');
    return response.result;
  };
  const script = `${base}/workers/scripts/${p.name}`;
  const topology = async () => {
    const allDomains = await provider(`${base}/workers/domains`, topologyToken);
    assert.ok(
      Array.isArray(allDomains) && allDomains.length < 100,
      'Unbounded domain inventory'
    );
    const domains = allDomains.filter((domain) => domain.service === p.name);
    assert.deepEqual(
      domains,
      [],
      'Worker already has a Custom Domain; use the release owner'
    );
    const zoneResponse = await boundedJson(
      `https://api.cloudflare.com/client/v4/zones?account.id=${p.accountId}&per_page=100`,
      topologyToken,
      boundedFetch
    );
    assert.equal(zoneResponse.success, true);
    const zones = zoneResponse.result;
    assert.ok(
      Array.isArray(zones) &&
        zones.length < 100 &&
        zoneResponse.result_info?.total_count === zones.length,
      'Incomplete account zone inventory'
    );
    const routes = [];
    for (const zone of zones) {
      assert.match(zone.id ?? '', /^[a-f0-9]{32}$/);
      assert.equal(
        zone.account?.id,
        p.accountId,
        'Unexpected account in zone inventory'
      );
      const entries = await provider(
        `https://api.cloudflare.com/client/v4/zones/${zone.id}/workers/routes`,
        topologyToken
      );
      assert.ok(
        Array.isArray(entries) && entries.length < 100,
        'Unbounded route inventory'
      );
      routes.push(
        ...entries
          .filter((route) => route.script === p.name)
          .map((route) => ({ zoneId: zone.id, ...route }))
      );
    }
    assert.deepEqual(
      routes,
      [],
      'Worker already has a route; use the release owner'
    );
    const serving = await provider(`${script}/subdomain`, topologyToken);
    assert.equal(
      serving.enabled,
      false,
      'workers.dev serving must be disabled'
    );
    assert.equal(
      serving.previews_enabled,
      false,
      'Preview serving must be disabled'
    );
    return { domains, routes, serving };
  };
  const before = await topology();
  const names = await provider(`${script}/secrets`);
  assert.ok(Array.isArray(names));
  for (const name of p.secrets)
    assert.ok(
      names.some((secret) => secret.name === name),
      `Missing production secret name: ${name}`
    );
  const deployments = await provider(`${script}/deployments`);
  assert.ok(
    Array.isArray(deployments.deployments) &&
      deployments.deployments.length > 0,
    'Initial private Worker and rollback version must be provisioned'
  );
  const versions = await provider(`${script}/versions?per_page=100`);
  assert.ok(
    Array.isArray(versions.items) && versions.items.length < 100,
    'Version history exceeds bounded reconciliation'
  );
  const matches = [];
  for (const item of versions.items) {
    assert.match(item.id ?? '', /^[a-f0-9-]{36}$/);
    const version = await provider(`${script}/versions/${item.id}`);
    if (matchesVersion(version, sha, digest)) matches.push(version.id);
  }
  assert.ok(matches.length <= 1, 'Ambiguous matching production versions');
  const candidates = matches.length
    ? deployments.deployments.filter(
        (deployment) =>
          Array.isArray(deployment.versions) &&
          !deployment.versions.some(
            (version) => version.version_id === matches[0]
          )
      )
    : deployments.deployments;
  assert.ok(
    candidates.length > 0,
    'No earlier rollback deployment; require the original receipt'
  );
  const rollback = requireRollback(candidates);
  const accept = async (id) => {
    const version = await provider(`${script}/versions/${id}`);
    assert.ok(
      matchesVersion(version, sha, digest),
      'Uploaded SHA/artifact identity mismatch'
    );
    const active = await provider(`${script}/deployments`);
    assert.deepEqual(active.deployments?.[0]?.versions, [
      { version_id: id, percentage: 100 },
    ]);
    assert.deepEqual(
      await topology(),
      before,
      'Upload changed serving topology'
    );
    validate();
  };
  const path = resolve(env.RUNNER_TEMP, `${app}-production-publication.json`);
  const record = {
    schema: 1,
    app,
    sha,
    digest,
    worker: p.name,
    rollback,
    topology: before,
    state: 'preflight',
  };
  const save = () =>
    writeFileSync(path, `${JSON.stringify(record, null, 2)}\n`, {
      mode: 0o600,
    });
  if (matches.length) {
    record.versionId = matches[0];
    await accept(record.versionId);
    record.state = 'reconciled';
    save();
    return record;
  }
  await assertNoEarlierUpload({ env, sha, fetcher: boundedFetch });
  assert.deepEqual(
    await topology(),
    before,
    'Serving topology changed before upload'
  );
  validate();
  deadline.throwIfAborted();
  record.state = 'pending';
  save();
  // One bounded upload. Exceptions remain pending, including a lost CLI receipt.
  record.versionId = await uploadArtifact({
    env,
    app,
    environment: 'production',
    config,
    sha,
    digest,
    cfToken: token,
    p,
    exec,
  });
  record.state = 'uploaded';
  save();
  deadline = AbortSignal.timeout(60_000);
  await accept(record.versionId);
  record.state = 'accepted-private';
  save();
  return record;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  main()
    .then((record) =>
      console.log(
        `Accepted private ${record.worker} version ${record.versionId}; routing remains separate`
      )
    )
    .catch(() => {
      console.error(
        'Production upload refused or uncertain; inspect the retained receipt and provider versions before another attempt'
      );
      process.exitCode = 1;
    });
}
