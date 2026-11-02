// biome-ignore-all lint/suspicious/noUndeclaredEnvVars: Direct CI entrypoint; deployment credentials never enter Turbo builds.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  appendFileSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ingressPreflight } from './wave1-ingress-preflight.mjs';
import { stagingAdmission } from './wave1-native-admission.mjs';
import {
  artifactDigest,
  publicInputsDigest,
  verify,
} from './wave1-native-artifact.mjs';
import { attemptLedger } from './wave1-native-attempt.mjs';
import { profileFor, profiles } from './wave1-native-profile.mjs';
import {
  NativeUploadError,
  productionFailureMessage,
} from './wave1-native-upload-error.mjs';
import {
  assertUploadLimits,
  measureUpload,
} from './wave1-native-upload-limits.mjs';

export function publicationAdmission({
  environment,
  ref,
  event,
  stagingEnabled,
  admissionRecord,
  app,
  sha,
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
  if (stagingEnabled !== 'true')
    return {
      allowed: false,
      reason: 'Staging provisioning/enable flag is pending',
    };
  try {
    stagingAdmission(admissionRecord, app, sha);
    return { allowed: true, reason: 'Exact staging source/artifact admission' };
  } catch {
    return {
      allowed: false,
      reason: 'Missing or mismatched exact staging admission',
    };
  }
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
export async function boundedJson(url, token, fetcher = fetch, body) {
  const response = await fetcher(url, {
    method: body === undefined ? 'GET' : 'POST',
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      Accept: 'application/json',
      'Content-Type': 'application/json',
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
export async function main({
  argv = process.argv.slice(2),
  env = process.env,
  fetcher = fetch,
  exec = execFileSync,
  appRoot,
} = {}) {
  const [mode, app, environment, sha] = argv;
  // The Web issuer candidate builds from its isolated cloudflare/ root.
  appRoot ??=
    app === 'web' ? resolve('apps/web/cloudflare') : resolve('apps', app);
  if (mode === 'dry-run') {
    assert.ok(
      !env.CLOUDFLARE_API_TOKEN &&
        !env.CLOUDFLARE_STAGING_API_TOKEN &&
        !env.WAVE1_PRODUCTION_CLOUDFLARE_API_TOKEN,
      'Provider credentials forbidden in dry-run'
    );
    const { receipt, config } = verify(appRoot, app, environment, sha);
    const measurements = await uploadArtifact({
      env,
      app,
      environment,
      config,
      sha,
      digest: artifactDigest(receipt),
      p: receipt.profile,
      exec,
      dryRun: true,
    });
    console.log(JSON.stringify({ uploadMeasurements: measurements }));
    assertUploadLimits(measurements);
    return;
  }
  const request = (url, token, body) => boundedJson(url, token, fetcher, body);
  const { productionPublicationHold } = await import(
    './production-publication-policy.ts'
  );
  const admission = publicationAdmission({
    environment,
    hold: productionPublicationHold(`${app}-cloudflare.yaml`) ?? null,
    ref: env.GITHUB_REF,
    event: env.GITHUB_EVENT_NAME,
    stagingEnabled: env.WAVE1_STAGING_PUBLISH_ENABLED,
    admissionRecord: env.WAVE1_STAGING_PUBLICATION_ADMISSION,
    app,
    sha,
  });
  if (mode === 'policy') {
    console.log(`${app} ${environment}: ${admission.reason}`);
    if (env.GITHUB_OUTPUT)
      appendFileSync(env.GITHUB_OUTPUT, `allowed=${admission.allowed}\n`);
    const summary = argv[4];
    if (summary)
      appendFileSync(
        summary,
        `## ${app} ${environment} publication\n\n${admission.reason}\n`
      );
    return;
  }
  assert.equal(mode, 'publish');
  assert.equal(environment, 'staging', 'Production publication remains HELD');
  assert.ok(admission.allowed, admission.reason);
  const { receipt, config } = verify(appRoot, app, environment, sha);
  const p = receipt.profile;
  assert.equal(
    receipt.publicInputsSha256,
    publicInputsDigest(env),
    'Public build inputs differ from admitted publisher inputs'
  );
  assert.ok(
    env.NEXT_PUBLIC_SUPABASE_URL &&
      !env.NEXT_PUBLIC_SUPABASE_URL.includes('.invalid'),
    'Staging/production public configuration is not provisioned'
  );
  const digest = artifactDigest(receipt);
  const ghToken = env.WAVE1_CONTROL_READ_TOKEN;
  const admitted = stagingAdmission(
    env.WAVE1_STAGING_PUBLICATION_ADMISSION,
    app,
    sha,
    digest
  );
  const cfToken = env.CLOUDFLARE_STAGING_API_TOKEN;
  assert.ok(
    !env.CLOUDFLARE_API_TOKEN,
    'Production deploy token exposed to staging'
  );
  assert.ok(ghToken && cfToken, 'Missing named publication credential');
  assert.equal(
    env[admitted.accountIdEnv],
    p.accountId,
    'Staging account admission mismatch'
  );
  if (environment === 'staging')
    assert.equal(
      p.host,
      profileFor(app, 'staging', env.CLOUDFLARE_WORKERS_SUBDOMAIN).host
    );
  const flag =
    environment === 'staging'
      ? 'WAVE1_STAGING_PUBLISH_ENABLED'
      : 'WAVE1_PRODUCTION_PUBLISH_ENABLED';
  const variableUrl = `https://api.github.com/repos/${env.GITHUB_REPOSITORY}/actions/variables/${flag}`;
  const assertEnabled = async () => {
    assert.equal(
      (await request(variableUrl, ghToken)).value,
      'true',
      'Publication stop fence is disabled'
    );
    const fresh = await request(
      `https://api.github.com/repos/${env.GITHUB_REPOSITORY}/actions/variables/${profiles.stagingAdmission.publicationVariable}`,
      ghToken
    );
    assert.deepEqual(
      stagingAdmission(fresh.value, app, sha, digest),
      admitted,
      'Staging admission changed'
    );
  };
  await assertEnabled();
  // Ingress-admitted identities (Access-protected Custom Domain) must prove
  // their topology and the fresh serving intent before any ledger write.
  await ingressPreflight({
    app,
    env,
    request,
    cfToken,
    ghToken,
    accountId: p.accountId,
  });
  const ledger = await attemptLedger({
    request,
    base: `https://api.cloudflare.com/client/v4/accounts/${p.accountId}`,
    token: cfToken,
    databaseId: env.WAVE1_STAGING_ATTEMPT_D1_ID,
    repository: env.GITHUB_REPOSITORY,
    runId: env.GITHUB_RUN_ID,
    runAttempt: env.GITHUB_RUN_ATTEMPT,
    app,
    identity: {
      sha,
      digest,
      worker: p.name,
      accountId: p.accountId,
      accountIdEnv: admitted.accountIdEnv,
      admission: admitted,
    },
  });
  const cfBase = `https://api.cloudflare.com/client/v4/accounts/${p.accountId}/workers/scripts/${p.name}`;
  const deployments = await request(`${cfBase}/deployments`, cfToken);
  assert.equal(deployments.success, true);
  const observedRollback = requireRollback(deployments.result.deployments);
  const rollback = ledger.prior
    ? requireRollback([ledger.prior.payload.rollback])
    : observedRollback;
  const recordPath = resolve(
    env.RUNNER_TEMP,
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
    digest,
    admission: admitted,
    seal: receipt.files,
  };
  writeFileSync(recordPath, `${JSON.stringify(record, null, 2)}\n`);
  const secrets = await request(`${cfBase}/secrets`, cfToken);
  assert.equal(secrets.success, true);
  const names = secrets.result.map((item) => item.name);
  for (const name of p.secrets)
    assert.ok(names.includes(name), `Missing Worker secret name: ${name}`);
  const validate = () => verify(appRoot, app, environment, sha);
  const save = () =>
    writeFileSync(recordPath, `${JSON.stringify(record, null, 2)}\n`);
  record.measurements = await uploadArtifact({
    env,
    app,
    environment,
    config,
    sha,
    digest,
    p,
    exec,
    dryRun: true,
    secretNames: names,
  });
  save();
  try {
    assertUploadLimits(record.measurements);
  } catch (error) {
    record.state = 'refused-before-upload';
    save();
    throw error;
  }
  const accept = async (versionId) => {
    const active = await request(`${cfBase}/deployments`, cfToken);
    assert.equal(active.success, true);
    assert.deepEqual(requireRollback(active.result.deployments).versions, [
      { version_id: versionId, percentage: 100 },
    ]);
    const version = await request(`${cfBase}/versions/${versionId}`, cfToken);
    assert.equal(version.success, true);
    assert.ok(
      matchesVersion(version.result, sha, digest),
      'Hosted artifact identity differs'
    );
    const serving = await request(`${cfBase}/subdomain`, cfToken);
    assert.equal(serving.success, true);
    assert.equal(
      serving.result.enabled,
      false,
      'Staging workers.dev must be disabled'
    );
    assert.equal(
      serving.result.previews_enabled,
      false,
      'Staging preview URLs must be disabled'
    );
    validate();
  };
  // Inspect uploaded versions as well as active deployments, including an upload
  // whose process died before returning its receipt. A capped view fails closed.
  const versions = await request(`${cfBase}/versions?per_page=100`, cfToken);
  assert.equal(versions.success, true);
  assert.ok(
    Array.isArray(versions.result?.items) && versions.result.items.length < 100,
    'Worker version history incomplete'
  );
  assert.ok(
    versions.result_info?.total_pages === undefined ||
      versions.result_info.total_pages <= 1,
    'Worker version history incomplete'
  );
  const identical = [];
  for (const item of versions.result.items) {
    assert.match(item.id ?? '', /^[a-f0-9-]{36}$/);
    const version = await request(`${cfBase}/versions/${item.id}`, cfToken);
    assert.equal(version.success, true);
    if (matchesVersion(version.result, sha, digest))
      identical.push({ ...version.result, id: item.id });
  }
  assert.ok(
    identical.length <= 1,
    'Multiple matching versions require owner reconciliation'
  );
  if (identical.length) {
    record.versionId = identical[0].id;
    if (ledger.prior?.state === 'activated') {
      // A terminal activation is never downgraded; a rerun only re-verifies it.
      assert.equal(
        ledger.prior.versionId,
        record.versionId,
        'Activated version mismatch'
      );
      await accept(record.versionId);
      record.state = 'activated';
      save();
      return;
    }
    if (!ledger.prior) await ledger.start(rollback);
    record.state = 'uploaded';
    save();
    await ledger.save('uploaded', record.versionId);
    await accept(record.versionId);
    record.state = 'activated';
    save();
    await ledger.save('activated', record.versionId);
    return;
  }
  assert.ok(
    !ledger.prior,
    'Earlier artifact attempt is unresolved or consumed; never replay an upload'
  );
  await ledger.start(rollback);
  record.state = 'pending';
  save();
  try {
    await assertEnabled();
    validate();
  } catch (error) {
    record.state = 'failed';
    save();
    await ledger.save('failed');
    throw error;
  }
  const write = () =>
    uploadArtifact({
      env,
      app,
      environment,
      config,
      sha,
      digest,
      cfToken,
      p,
      measurements: record.measurements,
      exec,
    });
  try {
    record.versionId = await write();
  } catch (error) {
    if (error instanceof NativeUploadError) {
      record.uploadFailure = error.uploadFailure;
      save();
    }
    throw error;
  }
  record.state = 'uploaded';
  save();
  await ledger.save('uploaded', record.versionId);
  await accept(record.versionId);
  record.state = 'activated';
  save();
  await ledger.save('activated', record.versionId);
  console.log(
    `Accepted ${p.name} version ${record.versionId} (private staging; public serving disabled)`
  );
}
export async function uploadArtifact({
  env,
  app,
  environment,
  config,
  sha,
  digest,
  cfToken,
  p,
  exec = execFileSync,
  dryRun = false,
  measurements,
  secretNames = [],
}) {
  if (dryRun)
    assert.equal(
      cfToken,
      undefined,
      'Deploy credential forbidden in measurement'
    );
  if (!dryRun) assertUploadLimits(measurements);
  const outdir = dryRun
    ? realpathSync(
        mkdtempSync(resolve(env.RUNNER_TEMP, `${app}-${environment}-dry-run-`))
      )
    : undefined;
  let outputFile = resolve(
    env.RUNNER_TEMP,
    `${app}-${environment}-wrangler.ndjson`
  );
  if (dryRun) outputFile += `.${basename(outdir)}`;
  try {
    exec(
      'bun',
      [
        'x',
        '--no-install',
        'wrangler',
        'deploy',
        ...(dryRun ? ['--dry-run', '--outdir', outdir] : []),
        '--config',
        config,
        '--message',
        sha,
        '--tag',
        digest,
      ],
      {
        cwd: resolve(dirname(config), '../..'),
        env: {
          ...Object.fromEntries(
            [
              'PATH',
              'HOME',
              'USER',
              'TMPDIR',
              'TMP',
              'TEMP',
              'LANG',
              'LC_ALL',
            ].flatMap((name) =>
              env[name] === undefined ? [] : [[name, env[name]]]
            )
          ),
          CI: 'true',
          ...(cfToken ? { CLOUDFLARE_API_TOKEN: cfToken } : {}),
          CLOUDFLARE_ACCOUNT_ID: p.accountId,
          WRANGLER_OUTPUT_FILE_PATH: outputFile,
          WRANGLER_SEND_METRICS: 'false',
          WRANGLER_WRITE_LOGS: 'false',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: dryRun ? 60000 : 180000,
        maxBuffer: 1024 * 1024,
      }
    );
  } catch (error) {
    throw new NativeUploadError(error, [cfToken]);
  }
  const writes = readFileSync(outputFile, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line))
    .filter((item) => item.type === 'deploy');
  assert.equal(writes.length, 1, 'Expected one publication receipt');
  assert.equal(writes[0].worker_name, p.name);
  if (dryRun) {
    assert.equal(
      writes[0].version_id,
      null,
      'Dry-run must not upload a version'
    );
    assert.ok(writes[0].bundle_size, 'Missing exact CLI bundle measurements');
    return measureUpload(config, outdir, secretNames, writes[0].bundle_size);
  }
  assert.match(writes[0].version_id, /^[a-f0-9-]{36}$/);
  return writes[0].version_id;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  main().catch((error) => {
    console.error(
      error instanceof NativeUploadError
        ? productionFailureMessage(error)
        : error instanceof Error
          ? error.message
          : 'Unknown native publication failure'
    );
    process.exitCode = 1;
  });
}
