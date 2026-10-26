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
    config.routes,
    [],
    'Production upload must have no routes or Custom Domains'
  );
  assert.equal(config.route, undefined, 'Singular route forbidden');
  assert.equal(config.workers_dev, false);
  assert.equal(config.preview_urls, false);
  assert.equal(config.no_bundle, true);
  assert.equal(config.env, undefined);
  assert.equal(config.triggers, undefined);
}

export async function main({
  argv = process.argv.slice(2),
  env = process.env,
  fetcher = fetch,
  exec,
  appRoot,
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
  assert.equal(env.PUBLICATION_ENVIRONMENT, 'production');
  assert.equal(env.GITHUB_SHA, sha);
  assert.equal(
    env.GITHUB_RUN_ATTEMPT,
    '1',
    'Reruns cannot replay a production upload'
  );
  assert.match(env.GITHUB_RUN_ID ?? '', /^\d+$/);
  assert.match(env.GITHUB_REPOSITORY ?? '', /^[\w.-]+\/[\w.-]+$/);
  assert.ok(
    !env.CLOUDFLARE_STAGING_API_TOKEN && !env.CLOUDFLARE_API_TOKEN,
    'Only the named production credential is admitted'
  );
  const token = env.WAVE1_PRODUCTION_CLOUDFLARE_API_TOKEN;
  assert.ok(
    token && env.GITHUB_TOKEN,
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
  const provider = async (url) => {
    const response = await boundedJson(url, token, fetcher);
    assert.equal(response.success, true, 'Provider observation failed');
    return response.result;
  };
  const script = `${base}/workers/scripts/${p.name}`;
  const topology = async () => {
    const domains = await provider(`${base}/workers/domains`);
    assert.ok(
      Array.isArray(domains) && domains.length < 100,
      'Unbounded domain inventory'
    );
    assert.ok(
      !domains.some((domain) => domain.service === p.name),
      'Worker already has a Custom Domain; use the release owner'
    );
    const routes = await provider(
      `https://api.cloudflare.com/client/v4/zones/${profiles.zoneId}/workers/routes`
    );
    assert.ok(
      Array.isArray(routes) && routes.length < 100,
      'Unbounded route inventory'
    );
    assert.ok(
      !routes.some((route) => route.script === p.name),
      'Worker already has a route; use the release owner'
    );
    const serving = await provider(`${script}/subdomain`);
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
  const rollback = requireRollback(deployments.deployments);
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
  // Workflow history is a refusal fence: earlier attempts are never inferred safe
  // from absent provider versions or a later failed/cancelled GitHub conclusion.
  const runs = await boundedJson(
    `https://api.github.com/repos/${env.GITHUB_REPOSITORY}/actions/workflows/wave1-native-production.yaml/runs?head_sha=${sha}&event=workflow_dispatch&per_page=100`,
    env.GITHUB_TOKEN,
    fetcher
  );
  assert.ok(
    Array.isArray(runs.workflow_runs) && runs.total_count < 100,
    'Unbounded publication history'
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
  assert.ok(
    !runs.workflow_runs.some(
      (run) =>
        run.head_branch === 'production' && String(run.id) !== env.GITHUB_RUN_ID
    ),
    'Earlier production attempt requires owner reconciliation; never replay'
  );
  assert.deepEqual(
    await topology(),
    before,
    'Serving topology changed before upload'
  );
  validate();
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
