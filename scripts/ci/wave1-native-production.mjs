import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { productionPublicationHold } from './production-publication-policy.ts';
import {
  productionServingTopologyFor,
  servingTopologyRefusal,
} from './production-serving-topology.ts';
import {
  artifactDigest,
  publicInputsDigest,
  verify,
} from './wave1-native-artifact.mjs';
import { assertNoEarlierUpload } from './wave1-native-production-history.mjs';
import { assertResolvedVersionsAbsent } from './wave1-native-production-resolution.mjs';
import {
  logSkippedSettingsCheck,
  settingsExpectation,
} from './wave1-native-emitted-observability.mjs';
import { profiles } from './wave1-native-profile.mjs';
import { ABUSE_GUARD_SERVICE_BINDING } from './wave1-source-admissions.mjs';
import {
  boundedJson,
  matchesVersion,
  requireRollback,
  uploadArtifact,
} from './wave1-native-publish.mjs';
import { waitForScriptObservability } from './wave1-native-script-settings.mjs';
import {
  NativeUploadError,
  productionFailureMessage,
} from './wave1-native-upload-error.mjs';
import { UploadLimitsError } from './wave1-native-upload-limits.mjs';

export function assertRouteFree(config) {
  // The shared abuse guard is the only admitted service binding.
  const services = Object.hasOwn(config, 'services') ? ['services'] : [];
  if (services.length)
    assert.deepEqual(
      config.services,
      [ABUSE_GUARD_SERVICE_BINDING],
      'Unadmitted production service binding'
    );
  assert.equal(
    config.upload_source_maps,
    false,
    'Source map uploads must be disabled'
  );
  assert.deepEqual(
    Object.keys(config).sort(),
    [
      'name',
      'account_id',
      'main',
      'no_bundle',
      'upload_source_maps',
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
      ...services,
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

const fullSha = /^[a-f0-9]{40}$/;

/** The id of the single version serving 100%, or null for a split. */
export function servingVersionId(deployment) {
  const serving = deployment?.versions;
  if (!Array.isArray(serving) || serving.length !== 1) return null;
  return serving[0].percentage === 100 ? serving[0].version_id : null;
}

/** The source SHA a version was published from, when it is annotated. */
export function annotatedSourceSha(version) {
  const message = version?.annotations?.['workers/message'];
  return typeof message === 'string' && fullSha.test(message) ? message : null;
}

/** GitHub's compare status of head against base: ahead, behind, identical or diverged. */
async function sourceRelation({ env, base, head, fetcher }) {
  const comparison = await boundedJson(
    `https://api.github.com/repos/${env.GITHUB_REPOSITORY}/compare/${base}...${head}?per_page=1`,
    env.GITHUB_TOKEN,
    fetcher
  );
  assert.ok(
    ['ahead', 'behind', 'identical', 'diverged'].includes(comparison.status),
    'Unknown production source relation'
  );
  return comparison.status;
}

export async function main({
  argv = process.argv.slice(2),
  env = process.env,
  fetcher = fetch,
  exec,
  appRoot,
  preflightTimeoutMs = 90_000,
  settingsTiming,
  readWorkerConfig,
  servingTopology,
} = {}) {
  const [app, sha, mode] = argv;
  assert.ok(['all', 'preflight', 'upload', 'verify'].includes(mode));
  assert.ok(Object.hasOwn(profiles.apps, app), 'Unknown wave-1 frontend');
  assert.match(sha ?? '', /^[a-f0-9]{40}$/);
  assert.equal(
    productionPublicationHold(`${app}-cloudflare.yaml`),
    undefined,
    'Production publication is held'
  );
  assert.equal(env.GITHUB_REF, 'refs/heads/production');
  // A planner push calls the publisher; a manual dispatch is recovery.
  assert.ok(
    ['push', 'workflow_dispatch'].includes(env.GITHUB_EVENT_NAME),
    'Production publication runs from a production push or dispatch'
  );
  assert.equal(env.PUBLICATION_ENVIRONMENT, `wave1-${app}-production`);
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
  if (mode !== 'upload')
    assert.ok(topologyToken, 'Missing named read credential');
  if (mode === 'preflight')
    assert.ok(env.GITHUB_TOKEN, 'Missing history credential');
  if (mode === 'upload' || mode === 'all')
    assert.ok(token, 'Missing named production credential');
  if (mode === 'preflight' || mode === 'verify')
    assert.ok(!token, 'Deploy credential forbidden in read-only step');
  if (mode === 'upload')
    assert.ok(
      !topologyToken && !env.GITHUB_TOKEN,
      'Read credentials forbidden in upload step'
    );
  appRoot ??= resolve('apps', app);
  // Tests pass null for a route-free Worker; production reads tuturuuu.ci.ts.
  if (servingTopology === undefined)
    servingTopology = productionServingTopologyFor(app);
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
  const expectedObservability = await settingsExpectation({
    app,
    appRoot,
    environment: 'production',
    sha,
    worker: p.name,
    readWorkerConfig,
  });
  const digest = artifactDigest(receipt);
  const base = `https://api.cloudflare.com/client/v4/accounts/${p.accountId}`;
  let deadline = AbortSignal.timeout(preflightTimeoutMs);
  const boundedFetch = (url, options) =>
    fetcher(url, {
      ...options,
      signal: AbortSignal.any([options.signal, deadline]),
    });
  const provider = async (url, credential = topologyToken) => {
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
    // Route-free unless tuturuuu.ci.ts records the reviewed serving topology;
    // either way the caller asserts the upload leaves it unchanged.
    const refusal = servingTopologyRefusal(servingTopology, domains, routes);
    assert.equal(refusal, null, refusal ?? undefined);
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
  const path = resolve(env.RUNNER_TEMP, `${app}-production-publication.json`);
  let record;
  let before;
  if (mode === 'all' || mode === 'preflight') {
    before = await topology();
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
    const observedVersions = [];
    for (const item of versions.items) {
      assert.match(item.id ?? '', /^[a-f0-9-]{36}$/);
      const version = await provider(`${script}/versions/${item.id}`);
      observedVersions.push(version);
      if (matchesVersion(version, sha, digest)) matches.push(version.id);
    }
    assertResolvedVersionsAbsent({ app, versions: observedVersions });
    assert.ok(matches.length <= 1, 'Ambiguous matching production versions');
    // A newer production push may already serve: an older SHA never
    // downgrades it, and its attempt stops here as superseded, before any
    // write. An in-flight upload is never cancelled; the per-app upload
    // queue runs the next attempt after it.
    const servingId = matches.length
      ? null
      : servingVersionId(deployments.deployments[0]);
    const live = servingId
      ? annotatedSourceSha(
          observedVersions.find(({ id }) => id === servingId) ??
            (await provider(`${script}/versions/${servingId}`))
        )
      : null;
    if (live && live !== sha) {
      const relation = await sourceRelation({
        env,
        base: sha,
        head: live,
        fetcher: boundedFetch,
      });
      if (relation === 'ahead') {
        record = {
          schema: 1,
          app,
          sha,
          digest,
          worker: p.name,
          state: 'superseded',
          liveSha: live,
          runId: env.GITHUB_RUN_ID,
          runAttempt: env.GITHUB_RUN_ATTEMPT,
          preflightAt: Date.now(),
        };
        writeFileSync(path, `${JSON.stringify(record, null, 2)}\n`, {
          mode: 0o600,
        });
        return record;
      }
      assert.equal(
        relation,
        'behind',
        'Live version is not on the production history; owner reconciliation required'
      );
    }
    if (matches.length)
      assert.deepEqual(
        deployments.deployments[0].versions,
        [{ version_id: matches[0], percentage: 100 }],
        'Matching production version must be active at 100% before upload'
      );
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
    record = {
      schema: 1,
      app,
      sha,
      digest,
      worker: p.name,
      rollback,
      topology: before,
      state: 'preflight',
      runId: env.GITHUB_RUN_ID,
      runAttempt: env.GITHUB_RUN_ATTEMPT,
      preflightAt: Date.now(),
      ...(matches.length ? { versionId: matches[0], reconciled: true } : {}),
    };
    if (!matches.length)
      await assertNoEarlierUpload({
        env,
        sha,
        app,
        worker: p.name,
        rollback,
        fetcher: boundedFetch,
      });
    try {
      record.measurements = await uploadArtifact({
        env,
        appRoot,
        app,
        environment: 'production',
        config,
        sha,
        digest,
        p,
        exec,
        dryRun: true,
        secretNames: names.map((secret) => secret.name),
      });
    } catch (error) {
      if (error instanceof UploadLimitsError) {
        record.measurements = error.measurements;
        record.state = 'refused-before-upload';
        writeFileSync(path, `${JSON.stringify(record, null, 2)}\n`, {
          mode: 0o600,
        });
      }
      throw error;
    }
    writeFileSync(path, `${JSON.stringify(record, null, 2)}\n`, {
      mode: 0o600,
    });
    assert.deepEqual(
      await topology(),
      before,
      'Serving topology changed before upload'
    );
    validate();
    deadline.throwIfAborted();
    writeFileSync(path, `${JSON.stringify(record, null, 2)}\n`, {
      mode: 0o600,
    });
    if (mode === 'preflight') return record;
  } else {
    record = JSON.parse(readFileSync(path, 'utf8'));
    assert.equal(record.app, app);
    assert.equal(record.sha, sha);
    assert.equal(record.digest, digest);
    assert.equal(record.worker, p.name);
    assert.equal(record.runId, env.GITHUB_RUN_ID);
    assert.equal(record.runAttempt, env.GITHUB_RUN_ATTEMPT);
    // The preflight proved a newer SHA already serves: nothing to upload.
    if (record.state === 'superseded') return record;
    before = record.topology;
  }
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
    if (expectedObservability === null) logSkippedSettingsCheck(p.name);
    else {
      // The settings poll carries its own 60 s bound; the topology readback
      // after it gets a fresh 60 s bound so a slow poll cannot starve it.
      await waitForScriptObservability({
        worker: p.name,
        expected: expectedObservability,
        readSettings: (signal) =>
          boundedJson(
            `${script}/script-settings`,
            topologyToken,
            fetcher,
            undefined,
            signal
          ),
        timing: settingsTiming,
      });
      deadline = AbortSignal.timeout(60_000);
    }
    assert.deepEqual(
      await topology(),
      before,
      'Upload changed serving topology'
    );
    validate();
  };
  const save = () =>
    writeFileSync(path, `${JSON.stringify(record, null, 2)}\n`, {
      mode: 0o600,
    });
  if (mode === 'all' || mode === 'upload') {
    assert.equal(record.state, 'preflight');
    assert.ok(
      Date.now() - record.preflightAt >= 0 &&
        Date.now() - record.preflightAt < 120_000,
      'Preflight expired; start a fresh read-only preflight'
    );
    validate();
    deadline.throwIfAborted();
    if (!record.reconciled) {
      record.state = 'pending';
      save();
      // One bounded upload. Exceptions remain pending, including a lost CLI receipt.
      try {
        record.versionId = await uploadArtifact({
          env,
          appRoot,
          app,
          environment: 'production',
          config,
          sha,
          digest,
          cfToken: token,
          p,
          exec,
          measurements: record.measurements,
        });
      } catch (error) {
        if (error instanceof NativeUploadError) {
          record.uploadFailure = error.uploadFailure;
          save();
        }
        throw error;
      }
    }
    record.state = 'uploaded';
    save();
    if (mode === 'upload') return record;
  }
  assert.equal(record.state, 'uploaded');
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
      console.log(`${record.state}: ${record.worker}; routing remains separate`)
    )
    .catch((error) => {
      console.error(productionFailureMessage(error));
      process.exitCode = 1;
    });
}
