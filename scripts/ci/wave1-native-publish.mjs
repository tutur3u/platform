// biome-ignore-all lint/suspicious/noUndeclaredEnvVars: Direct CI entrypoint; deployment credentials never enter Turbo builds.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  artifactDigest,
  publicInputsDigest,
  verify,
} from './wave1-native-artifact.mjs';
import { profiles } from './wave1-native-profile.mjs';

export function publicationAdmission({
  environment,
  ref,
  event,
  stagingEnabled,
  hold = profiles.productionHold,
}) {
  if (environment === 'production') {
    if (hold) return { allowed: false, reason: hold };
    return {
      allowed:
        ref === 'refs/heads/production' &&
        ['push', 'workflow_dispatch'].includes(event),
      reason: 'Explicit source cutover admission required',
    };
  }
  if (
    environment !== 'staging' ||
    ref !== 'refs/heads/main' ||
    !['push', 'workflow_dispatch'].includes(event)
  )
    return {
      allowed: false,
      reason: 'Staging requires a trusted main push or dispatch',
    };
  return stagingEnabled === 'true'
    ? { allowed: true, reason: 'Owner-admitted staging publication' }
    : { allowed: false, reason: 'Staging provisioning/enable flag is pending' };
}
export function requireRollback(deployments) {
  assert.ok(
    Array.isArray(deployments) && deployments.length,
    'Owner must provision and accept initial Worker version first'
  );
  const latest = deployments[0];
  assert.equal(typeof latest.id, 'string');
  assert.ok(Array.isArray(latest.versions) && latest.versions.length);
  for (const version of latest.versions) {
    assert.match(version.version_id, /^[a-f0-9-]{36}$/);
    assert.ok(Number.isFinite(version.percentage) && version.percentage > 0);
  }
  assert.equal(
    latest.versions.reduce((sum, v) => sum + v.percentage, 0),
    100
  );
  return {
    id: latest.id,
    created_on: latest.created_on,
    versions: latest.versions,
  };
}
export async function boundedJson(url, token, fetcher = fetch) {
  const response = await fetcher(url, {
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      Accept: 'application/json',
    },
    signal: AbortSignal.timeout(15000),
    redirect: 'error',
  });
  assert.ok(
    response.ok,
    `Required control-plane observation failed (${response.status})`
  );
  const reader = response.body.getReader();
  let size = 0;
  const chunks = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      assert.ok(size <= 1024 * 1024, 'Control-plane response exceeded budget');
      chunks.push(Buffer.from(value));
    }
  } finally {
    await reader.cancel();
  }
  return JSON.parse(Buffer.concat(chunks).toString());
}
export function matchesVersion(version, sha, digest) {
  return (
    version.annotations?.['workers/message'] === sha &&
    version.annotations?.['workers/tag'] === digest
  );
}
export async function guardedPublication({
  enabled,
  validate,
  write,
  accept,
  record,
  save,
}) {
  await enabled();
  validate();
  record.state = 'publication-attempted';
  save();
  const versionId = await write();
  record.versionId = versionId;
  record.state = 'published-awaiting-acceptance';
  save();
  await accept(versionId);
  record.state = 'accepted';
  save();
}
async function main() {
  const [mode, app, environment, sha] = process.argv.slice(2);
  const admission = publicationAdmission({
    environment,
    ref: process.env.GITHUB_REF,
    event: process.env.GITHUB_EVENT_NAME,
    stagingEnabled: process.env.WAVE1_STAGING_PUBLISH_ENABLED,
  });
  if (mode === 'policy') {
    console.log(`${app} ${environment}: ${admission.reason}`);
    if (process.env.GITHUB_OUTPUT)
      appendFileSync(
        process.env.GITHUB_OUTPUT,
        `allowed=${admission.allowed}\n`
      );
    const summary = process.argv[6];
    if (summary)
      appendFileSync(
        summary,
        `## ${app} ${environment} publication\n\n${admission.reason}\n`
      );
    return;
  }
  assert.equal(mode, 'publish');
  assert.ok(admission.allowed, admission.reason);
  const { receipt, config } = verify(
    resolve('apps', app),
    app,
    environment,
    sha
  );
  const p = receipt.profile;
  assert.equal(
    receipt.publicInputsSha256,
    publicInputsDigest(process.env),
    'Public build inputs differ from admitted publisher inputs'
  );
  assert.ok(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      !process.env.NEXT_PUBLIC_SUPABASE_URL.includes('.invalid'),
    'Staging/production public configuration is not provisioned'
  );
  const digest = artifactDigest(receipt);
  const ghToken = process.env.WAVE1_CONTROL_READ_TOKEN;
  const cfToken = process.env.CLOUDFLARE_API_TOKEN;
  assert.ok(ghToken && cfToken, 'Missing named publication credential');
  assert.equal(process.env.CLOUDFLARE_ACCOUNT_ID, p.accountId);
  if (environment === 'staging')
    assert.equal(
      p.host,
      `${p.name}.${process.env.CLOUDFLARE_WORKERS_SUBDOMAIN}.workers.dev`
    );
  else {
    const sourcePolicy = await import('../../tuturuuu.ci.ts');
    assert.ok(
      Object.hasOwn(sourcePolicy, 'productionPublicationHolds'),
      'PR A must land first'
    );
    assert.ok(
      !sourcePolicy.productionPublicationHolds[app],
      'Source production hold is still active'
    );
  }
  const flag =
    environment === 'staging'
      ? 'WAVE1_STAGING_PUBLISH_ENABLED'
      : 'WAVE1_PRODUCTION_PUBLISH_ENABLED';
  const variableUrl = `https://api.github.com/repos/${process.env.GITHUB_REPOSITORY}/actions/variables/${flag}`;
  const assertEnabled = async () =>
    assert.equal(
      (await boundedJson(variableUrl, ghToken)).value,
      'true',
      'Publication stop fence is disabled'
    );
  await assertEnabled();
  const cfBase = `https://api.cloudflare.com/client/v4/accounts/${p.accountId}/workers/scripts/${p.name}`;
  const deployments = await boundedJson(`${cfBase}/deployments`, cfToken);
  assert.equal(deployments.success, true);
  const rollback = requireRollback(deployments.result.deployments);
  const recordPath = resolve(
    process.env.RUNNER_TEMP,
    `${app}-${environment}-publication.json`
  );
  const record = {
    sha,
    app,
    environment,
    worker: p.name,
    accountId: p.accountId,
    host: p.host,
    rollback,
    state: 'preflight',
    seal: receipt.files,
  };
  writeFileSync(recordPath, `${JSON.stringify(record, null, 2)}\n`);
  const secrets = await boundedJson(`${cfBase}/secrets`, cfToken);
  assert.equal(secrets.success, true);
  const names = secrets.result.map((item) => item.name);
  for (const name of p.secrets)
    assert.ok(names.includes(name), `Missing Worker secret name: ${name}`);
  const validate = () => verify(resolve('apps', app), app, environment, sha);
  const save = () =>
    writeFileSync(recordPath, `${JSON.stringify(record, null, 2)}\n`);
  const accept = async (versionId) => {
    const active = await boundedJson(`${cfBase}/deployments`, cfToken);
    assert.equal(active.success, true);
    assert.deepEqual(requireRollback(active.result.deployments).versions, [
      { version_id: versionId, percentage: 100 },
    ]);
    const version = await boundedJson(
      `${cfBase}/versions/${versionId}`,
      cfToken
    );
    assert.equal(version.success, true);
    assert.ok(
      matchesVersion(version.result, sha, digest),
      'Hosted artifact identity differs'
    );
    const identity = await boundedJson(`https://${p.host}/api/build-info`, '');
    assert.equal(identity.appName, app);
    assert.equal(identity.commitHash, sha);
    assert.equal(identity.environment, environment);
    validate();
  };
  const currentVersion =
    rollback.versions.length === 1 && rollback.versions[0].percentage === 100
      ? await boundedJson(
          `${cfBase}/versions/${rollback.versions[0].version_id}`,
          cfToken
        )
      : null;
  if (
    currentVersion?.success &&
    matchesVersion(currentVersion.result, sha, digest)
  ) {
    await accept(rollback.versions[0].version_id);
    record.versionId = rollback.versions[0].version_id;
    record.state = 'accepted-existing-identical-artifact';
    save();
    console.log(
      `Retained identical accepted ${p.name} artifact; no publication replay`
    );
    return;
  }
  await guardedPublication({
    enabled: assertEnabled,
    validate,
    record,
    save,
    accept,
    write: async () => {
      const outputFile = resolve(
        process.env.RUNNER_TEMP,
        `${app}-${environment}-wrangler.ndjson`
      );
      try {
        execFileSync(
          'bun',
          [
            'x',
            '--no-install',
            'wrangler',
            'deploy',
            '--config',
            config,
            '--message',
            sha,
            '--tag',
            digest,
          ],
          {
            env: {
              ...process.env,
              WRANGLER_OUTPUT_FILE_PATH: outputFile,
              WRANGLER_SEND_METRICS: 'false',
            },
            stdio: ['ignore', 'pipe', 'pipe'],
            timeout: 180000,
            maxBuffer: 1024 * 1024,
          }
        );
      } catch {
        throw new Error(
          'Wrangler publication outcome is uncertain; inspect the matching version and retained receipt before any retry'
        );
      }
      const writes = readFileSync(outputFile, 'utf8')
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line))
        .filter((item) => item.type === 'deploy');
      assert.equal(writes.length, 1, 'Expected one publication receipt');
      assert.equal(writes[0].worker_name, p.name);
      assert.match(writes[0].version_id, /^[a-f0-9-]{36}$/);
      return writes[0].version_id;
    },
  });
  console.log(
    `Accepted ${p.name} version ${record.versionId} at https://${p.host}`
  );
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  main().catch((error) => {
    console.error(
      error instanceof Error
        ? error.message
        : 'Unknown native publication failure'
    );
    process.exitCode = 1;
  });
}
