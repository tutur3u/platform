import assert from 'node:assert/strict';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import {
  assertMeasuredLimits,
  assertUploadNameParity,
  BUILD_OUTPUT_PREFIX,
  cfBundleSecondaryModuleNames,
  measureBuildOutputUpload,
  parseCfVersionId,
  runCfPrebuilt,
  stageBuildOutput,
  teardownStagedOutput,
  VERSION_ID,
} from './cf-build-output-publisher.mjs';
import { emitWave1Output, wave1CfPackagePath } from './wave1-cf-output.mjs';
import { NativeUploadError } from './wave1-native-upload-error.mjs';
import { assertUploadLimits } from './wave1-native-upload-limits.mjs';

/** @typedef {import('./cf-build-output-publisher.mjs').CfPublicationTraffic} CfPublicationTraffic */

function runWave1CfPrebuilt(options) {
  // The app owns the Build Output cwd. The emitter's toolchain owns the CLI.
  return runCfPrebuilt({
    ...options,
    cfCli: join(dirname(wave1CfPackagePath()), 'bin/cf'),
  });
}

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
        runWave1CfPrebuilt({
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
        throw new NativeUploadError(error, [], { dryRun: true });
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
  const scratch = realpathSync(
    mkdtempSync(resolve(env.RUNNER_TEMP, `wave1-cf-publish-${app}-`))
  );
  const buildRoot = join(scratch, 'prebuilt');
  const receipt = await emitWave1Output({
    appRoot,
    app,
    environment,
    sha,
    destination: buildRoot,
  });
  assertUploadNameParity(receipt, cfBundleSecondaryModuleNames(buildRoot));
  stageBuildOutput(appRoot, buildRoot);
  const config = JSON.parse(readFileSync(configPath, 'utf8'));
  try {
    runWave1CfPrebuilt({
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
    throw new NativeUploadError(error, [], { dryRun: true });
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
  withManifest = false,
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
  assertMeasuredLimits(configFile, rehearsal.buildRoot, secretNames);
  stageBuildOutput(appRoot, rehearsal.buildRoot);
  let stdout = '';
  let stderr = '';
  try {
    stdout = runWave1CfPrebuilt({
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
  // The emitted manifest names the modules the upload must contain; the
  // production publisher compares it with the uploaded version.
  return withManifest
    ? { versionId, manifest: emittedManifest(rehearsal.buildRoot, env) }
    : versionId;
}

/** The module manifest the cf Build Output emit wrote for the upload. */
export function emittedManifest(buildRoot, env = process.env) {
  const path = join(
    buildRoot,
    BUILD_OUTPUT_PREFIX,
    'workers/default/worker.config.json'
  );
  if (!existsSync(path)) {
    // Only the publication test fixture emits a single index.js and no
    // config; a real emit without one must not pass as a one-module Worker.
    assert.equal(
      env.WAVE1_PUBLICATION_TEST,
      '1',
      'Emitted worker config is missing'
    );
    return { mainModule: 'index.js', modules: { 'index.js': { type: 'esm' } } };
  }
  const { manifest } = JSON.parse(readFileSync(path, 'utf8'));
  assert.ok(
    manifest?.mainModule && manifest.modules,
    'Emitted worker config has no module manifest'
  );
  return { mainModule: manifest.mainModule, modules: manifest.modules };
}
