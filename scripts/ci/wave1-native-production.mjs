import { canonicalDeploymentId } from './wave1-production-deployments.mjs';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
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
import {
  assertActiveVersionsPresent,
  assertLiveRollbackUnchanged,
  readAllVersions,
  readAllDeployments,
  confirmMissingHistoricalVersions,
} from './wave1-native-production-guards.mjs';
import { assertResolvedVersionsAbsent } from './wave1-native-production-resolution.mjs';
import {
  logSkippedSettingsCheck,
  settingsExpectation,
} from './wave1-native-emitted-observability.mjs';
import { profiles } from './wave1-native-profile.mjs';
import { ABUSE_GUARD_SERVICE_BINDING } from './wave1-source-admissions.mjs';
import {
  boundedJson,
  isHistoricalVersionNotFound,
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
import { gateOrRollBack, minimumGateMs } from './wave1-production-health.mjs';
import { supersedingSha } from './wave1-production-supersede.mjs';
import { recoverPublication } from './wave1-production-recovery.mjs';
import { stageSmokeSwitch } from './wave1-staged-publish.mjs';
import { compareUploadedModules } from './wave1-uploaded-modules.mjs';

// Upload, staged smoke and health gate stop by this budget; the upload
// step's 25-minute timeout keeps the rest for the rollback and its re-probe.
// Add an app and its exact GET /versions/{id} error code only after Iris approval
// and provider readback. 100146 (deploy) and 10007 (missing Worker) are unconfirmed here.
const approvedHistoricalVersionNotFoundCodes = new Map();

export const UPLOAD_BUDGET_MS = 17 * 60_000;

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

export async function main({
  argv = process.argv.slice(2),
  env = process.env,
  fetcher = fetch,
  exec,
  appRoot,
  preflightTimeoutMs = 150_000,
  settingsTiming,
  readWorkerConfig,
  servingTopology,
  healthFetcher = fetch,
  healthSleep,
  healthOptions = {},
  smokeOptions = {},
  moduleReadTimeoutMs,
} = {}) {
  const [app, sha, mode] = argv;
  assert.ok(['all', 'preflight', 'upload', 'verify', 'recover'].includes(mode));
  assert.ok(Object.hasOwn(profiles.apps, app), 'Unknown wave-1 frontend');
  assert.match(sha ?? '', /^[a-f0-9]{40}$/);
  // Recovery protects production after an interrupted upload step, so it
  // runs even if the app was held meanwhile.
  if (mode === 'recover')
    return recoverPublication({
      app,
      sha,
      env,
      accountId: profiles.accountId,
      fetcher,
      sleep: healthSleep,
    });
  // The upload step stops smoking and probing at this deadline, which leaves
  // its timeout enough room to restore the rollback deployment.
  const budget = env.WAVE1_UPLOAD_BUDGET_MS;
  // A malformed budget would silently disable the deadline, so it refuses.
  assert.ok(
    budget === undefined || budget === '' || /^[1-9]\d{0,8}$/.test(budget),
    'WAVE1_UPLOAD_BUDGET_MS must be a positive whole number of milliseconds'
  );
  const deadlineAt = Date.now() + (budget ? Number(budget) : UPLOAD_BUDGET_MS);
  assert.equal(
    productionPublicationHold(`${app}-cloudflare.yaml`, {
      automatic: env.WAVE1_AUTOMATIC_PUBLICATION === 'true',
    }),
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
  // The Calendar artifact publisher always activates, so a staged
  // production upload refuses it first, before any read or state.
  assert.ok(
    !(
      app === 'calendar' &&
      existsSync(resolve(appRoot, 'calendar-artifact.json'))
    ),
    'Calendar artifact publication cannot upload a version without traffic'
  );
  // Tests pass null for a route-free Worker; production reads tuturuuu.ci.ts.
  if (servingTopology === undefined)
    servingTopology = productionServingTopologyFor(app);
  const validate = () => {
    assert.equal(
      productionPublicationHold(`${app}-cloudflare.yaml`, {
        automatic: env.WAVE1_AUTOMATIC_PUBLICATION === 'true',
      }),
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
    const fetchJson = (url, credential) =>
      boundedJson(url, credential, boundedFetch);
    const deployments = await readAllDeployments({
      script,
      token: topologyToken,
      fetchJson,
    });
    assert.ok(
      Array.isArray(deployments) && deployments.length > 0,
      'Initial private Worker and rollback version must be provisioned'
    );
    const versionItems = await readAllVersions({
      script,
      token: topologyToken,
      fetchJson: (url, credential) =>
        boundedJson(url, credential, boundedFetch),
    });
    assertActiveVersionsPresent({
      deployments: deployments.slice(0, 1),
      versionItems,
    });
    const approvedMissingVersionCode =
      approvedHistoricalVersionNotFoundCodes.get(app);
    const confirmedMissingHistoricalIds =
      approvedMissingVersionCode === undefined
        ? undefined
        : await confirmMissingHistoricalVersions({
            deployments,
            versionItems,
            isVersionMissing: (id) =>
              isHistoricalVersionNotFound({
                url: `${script}/versions/${id}`,
                token: topologyToken,
                fetcher: boundedFetch,
                approvedCode: approvedMissingVersionCode,
              }),
          });
    assertActiveVersionsPresent({
      deployments,
      versionItems,
      confirmedMissingHistoricalIds,
    });
    const matches = [];
    const observedVersions = [];
    for (const item of versionItems) {
      assert.match(
        item.id ?? '',
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      );
      const version = await provider(`${script}/versions/${item.id}`);
      observedVersions.push(version);
      assert.equal(
        canonicalDeploymentId(version.id),
        canonicalDeploymentId(item.id),
        'Hosted version detail does not match the inventory ID'
      );
      if (matchesVersion(version, sha, digest))
        matches.push(canonicalDeploymentId(version.id));
    }
    assertResolvedVersionsAbsent({ app, versions: observedVersions });
    assert.ok(matches.length <= 1, 'Ambiguous matching production versions');
    if (matches.length)
      assert.deepEqual(
        deployments[0].versions.map((version) => ({
          ...version,
          version_id: canonicalDeploymentId(version.version_id),
        })),
        [{ version_id: canonicalDeploymentId(matches[0]), percentage: 100 }],
        'Matching production version must be active at 100% before upload'
      );
    const candidates = matches.length
      ? deployments.filter(
          (deployment) =>
            Array.isArray(deployment.versions) &&
            !deployment.versions.some(
              (version) =>
                canonicalDeploymentId(version.version_id) ===
                canonicalDeploymentId(matches[0])
            )
        )
      : deployments;
    assert.ok(
      candidates.length > 0,
      'No earlier rollback deployment; require the original receipt'
    );
    const rollback = requireRollback(candidates);
    if (matches.length)
      assertActiveVersionsPresent({
        deployments,
        rollback,
        versionItems,
        confirmedMissingHistoricalIds,
      });
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
    if (!matches.length) {
      const baseline = await assertNoEarlierUpload({
        env,
        sha,
        app,
        worker: p.name,
        rollback,
        fetcher: boundedFetch,
      });
      // A newer production push may already serve: an older SHA never
      // downgrades it and stops here as superseded, before any write. An
      // in-flight upload is never cancelled; the per-app upload queue runs
      // the next attempt after it.
      const { live, newer } = await supersedingSha({
        env,
        sha,
        deployment: deployments[0],
        baseline,
        fetcher: boundedFetch,
        readVersion: async (id) =>
          observedVersions.find(
            (version) =>
              canonicalDeploymentId(version.id) === canonicalDeploymentId(id)
          ) ?? (await provider(`${script}/versions/${id}`)),
      });
      if (newer) {
        record = {
          schema: 1,
          app,
          sha,
          digest,
          worker: p.name,
          state: 'superseded',
          liveSha: newer,
          runId: env.GITHUB_RUN_ID,
          runAttempt: env.GITHUB_RUN_ATTEMPT,
          preflightAt: Date.now(),
        };
        writeFileSync(path, `${JSON.stringify(record, null, 2)}\n`, {
          mode: 0o600,
        });
        return record;
      }
      // The proven serving SHA lets a later attempt identify this baseline
      // even when this attempt restores it after a failure.
      record.servingSha = live;
    }
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
    // The upload accepts a young preflight only. Its age runs from this last
    // topology confirmation, not from before the history walk.
    record.preflightAt = Date.now();
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
    assert.deepEqual(
      active.deployments?.[0]?.versions?.map((entry) => ({
        ...entry,
        version_id: canonicalDeploymentId(entry.version_id),
      })),
      [{ version_id: canonicalDeploymentId(id), percentage: 100 }]
    );
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
    let manifest;
    if (!record.reconciled) {
      // Re-confirm the live deployment id and version split immediately before
      // transitioning to pending or uploading so a deployment landed after
      // preflight fails closed with zero writes.
      await assertLiveRollbackUnchanged({
        script,
        token,
        fetchJson: (url, credential) =>
          boundedJson(url, credential, boundedFetch),
        expected: record.rollback,
      });
      record.state = 'pending';
      save();
      // One bounded upload. Exceptions remain pending, including a lost CLI receipt.
      try {
        ({ versionId: record.versionId, manifest } = await uploadArtifact({
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
          // A version without traffic; stageSmokeSwitch moves traffic.
          traffic: 'version-only',
          withManifest: true,
        }));
      } catch (error) {
        if (error instanceof NativeUploadError) {
          record.uploadFailure = error.uploadFailure;
          save();
        }
        throw error;
      }
    }
    // Only a version this attempt wrote is staged, smoked, switched and
    // health-gated, and only then can a failure roll back; a reconciled
    // version was accepted earlier and is already serving.
    if (record.reconciled) {
      record.state = 'uploaded';
      save();
    } else {
      record.state = 'uploaded-version';
      save();
      // The uploaded version must hold exactly the emitted modules before any
      // deployment names it; a dropped module graph fails here, not in traffic.
      await compareUploadedModules({
        record,
        save,
        manifest,
        accountId: p.accountId,
        worker: p.name,
        token,
        fetcher,
        timeoutMs: moduleReadTimeoutMs,
      });
      const request = (url, credential, body) =>
        boundedJson(url, credential, fetcher, body);
      await stageSmokeSwitch({
        app,
        sha,
        worker: p.name,
        record,
        save,
        script,
        token,
        request,
        cases: profiles.apps[app]?.releaseRecipe?.smokeSpec?.cases ?? [],
        smokeFetcher: healthFetcher,
        sleep: healthSleep,
        smokeOptions,
        deadlineAt: smokeOptions.deadlineAt ?? deadlineAt,
        gateReserveMs: minimumGateMs(healthOptions),
      });
      await gateOrRollBack({
        app,
        sha,
        record,
        save,
        script,
        token,
        request,
        healthFetcher,
        sleep: healthSleep,
        options: { deadlineAt, ...healthOptions },
      });
    }
    if (mode === 'upload') return record;
  }
  assert.ok(
    record.reconciled
      ? record.state === 'uploaded'
      : record.state === 'healthy',
    'Upload did not pass its staged smoke and health gate'
  );
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
