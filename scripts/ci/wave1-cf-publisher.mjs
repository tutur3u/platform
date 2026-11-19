import assert from 'node:assert/strict';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import {
  assertMeasuredLimits,
  assertUploadNameParity,
  cfBundleModuleNames,
  measureBuildOutputUpload,
  parseCfVersionId,
  runCfPrebuilt,
  stageBuildOutput,
  teardownStagedOutput,
  VERSION_ID,
} from './cf-build-output-publisher.mjs';
import { emitWave1Output } from './wave1-cf-output.mjs';
import { NativeUploadError } from './wave1-native-upload-error.mjs';
import { assertUploadLimits } from './wave1-native-upload-limits.mjs';

/** @typedef {import('./cf-build-output-publisher.mjs').CfPublicationTraffic} CfPublicationTraffic */

function fixtureBuildOutput(buildRoot, moduleBytes) {
  const bundle = join(
    buildRoot,
    '.cloudflare/output/v0/workers/default/bundle'
  );
  mkdirSync(bundle, { recursive: true });
  writeFileSync(join(bundle, 'index.js'), moduleBytes);
}

export async function rehearseWave1Publication({
  appRoot,
  app,
  environment,
  sha,
  configPath,
  env,
  exec,
}) {
  if (env.WAVE1_PUBLICATION_TEST === '1') {
    const buildRoot = realpathSync(
      mkdtempSync(resolve(env.RUNNER_TEMP, `wave1-cf-fixture-${app}-`))
    );
    const moduleBytes = readFileSync(join(appRoot, 'dist/server/index.js'));
    fixtureBuildOutput(buildRoot, moduleBytes);
    stageBuildOutput(appRoot, buildRoot);
    if (!env.WAVE1_PUBLICATION_TEST_SKIP_CF_DRY_RUN) {
      try {
        runCfPrebuilt({
          env,
          appRoot,
          exec,
          traffic: 'activate',
          dryRun: true,
          sha,
          digest: 'fixture',
          workerName: JSON.parse(readFileSync(configPath, 'utf8')).name,
        });
      } catch (error) {
        throw new NativeUploadError(error, []);
      } finally {
        teardownStagedOutput(appRoot);
      }
    }
    return {
      schema: 1,
      buildRoot,
      secondaryModuleNames: [],
      publicationQualified: true,
    };
  }
  const buildRoot = realpathSync(
    mkdtempSync(resolve(env.RUNNER_TEMP, `wave1-cf-publish-${app}-`))
  );
  const receipt = await emitWave1Output({
    appRoot,
    app,
    environment,
    sha,
    destination: buildRoot,
  });
  assertUploadNameParity(receipt, cfBundleModuleNames(buildRoot));
  stageBuildOutput(appRoot, buildRoot);
  const config = JSON.parse(readFileSync(configPath, 'utf8'));
  try {
    runCfPrebuilt({
      env,
      appRoot,
      exec,
      traffic: 'activate',
      dryRun: true,
      sha,
      digest: receipt.sourceReceiptHash,
      workerName: config.name,
    });
  } catch (error) {
    throw new NativeUploadError(error, []);
  } finally {
    teardownStagedOutput(appRoot);
  }
  return { ...receipt, buildRoot, publicationQualified: true };
}

/**
 * @param {object} params
 * @param {CfPublicationTraffic} [params.traffic] defaults to activate (staging accept).
 */
export async function publishWave1Artifact({
  env,
  appRoot,
  app,
  environment,
  config,
  sha,
  digest,
  cfToken,
  p,
  exec,
  dryRun = false,
  secretNames = [],
  traffic = 'activate',
}) {
  if (dryRun)
    assert.equal(
      cfToken,
      undefined,
      'Deploy credential forbidden in measurement'
    );
  const configFile = resolve(config);
  const rehearsal = await rehearseWave1Publication({
    appRoot,
    app,
    environment,
    sha,
    configPath: configFile,
    env,
    exec,
  });
  if (dryRun) {
    const measurements = measureBuildOutputUpload(
      configFile,
      rehearsal.buildRoot,
      secretNames
    );
    assertUploadLimits(measurements);
    return measurements;
  }
  assert.ok(cfToken, 'Missing Cloudflare deploy credential');
  stageBuildOutput(appRoot, rehearsal.buildRoot);
  let stdout = '';
  let stderr = '';
  try {
    stdout = runCfPrebuilt({
      env,
      appRoot,
      exec,
      traffic,
      dryRun: false,
      sha,
      digest,
      workerName: p.name,
      cfToken,
      accountId: p.accountId,
    });
  } catch (error) {
    stdout = error.stdout ?? '';
    stderr = error.stderr ?? '';
    throw new NativeUploadError(error, [cfToken]);
  } finally {
    teardownStagedOutput(appRoot);
  }
  const versionId = parseCfVersionId(`${stdout}\n${stderr}`);
  assert.ok(
    VERSION_ID.test(versionId ?? ''),
    'cf publication returned no version id'
  );
  assertMeasuredLimits(configFile, rehearsal.buildRoot, secretNames);
  return versionId;
}
