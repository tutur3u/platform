import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, realpathSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { emitCalendarOutput } from './calendar-cf-output.mjs';
import {
  BUILD_OUTPUT_PREFIX,
  assertMeasuredLimits,
  assertUploadNameParity,
  cfBundleSecondaryModuleNames,
  measureBuildOutputUpload,
  parseCfVersionId,
  runCfPrebuilt,
  stageBuildOutput,
  teardownStagedOutput,
  VERSION_ID,
} from './cf-build-output-publisher.mjs';
import { NativeUploadError } from './wave1-native-upload-error.mjs';
import { assertUploadLimits } from './wave1-native-upload-limits.mjs';

const prefix = BUILD_OUTPUT_PREFIX;

export { assertUploadNameParity, measureBuildOutputUpload, stageBuildOutput };

function assertControlFileParity(receipt) {
  for (const { path, present } of receipt.unqualifiedAssetControlFiles ?? []) {
    if (!present) continue;
    assert.ok(
      receipt.outputFiles?.[`${prefix}workers/default/assets/${path}`] ||
        receipt.sourceFiles?.[`dist/client/${path}`],
      `Missing control file asset bytes for ${path}`
    );
  }
}

export async function rehearseCalendarPublication({
  appRoot,
  sourceSha,
  config,
  env,
  exec = execFileSync,
}) {
  const buildRoot = realpathSync(
    mkdtempSync(resolve(env.RUNNER_TEMP, 'calendar-cf-publish-'))
  );
  const receipt = await emitCalendarOutput({
    appDirectory: appRoot,
    sourceSha,
    destination: buildRoot,
  });
  assertUploadNameParity(receipt, cfBundleSecondaryModuleNames(buildRoot));
  assertControlFileParity(receipt);
  stageBuildOutput(appRoot, buildRoot);
  const publicationConfig = JSON.parse(readFileSync(config, 'utf8'));
  try {
    runCfPrebuilt({
      env,
      appRoot,
      exec,
      traffic: 'activate',
      dryRun: true,
      sha: sourceSha,
      digest: 'dry-run',
      workerName: publicationConfig.name,
    });
  } catch (error) {
    throw new NativeUploadError(error, []);
  } finally {
    teardownStagedOutput(appRoot);
  }
  return {
    ...receipt,
    publicationQualified: true,
    uploadNameParity: 'cf-build-output-manifest',
    assetControlFilesQualified: true,
    buildRoot,
  };
}

export async function publishCalendarArtifact({
  env,
  appRoot,
  sourceSha,
  config,
  sha,
  digest,
  cfToken,
  p,
  exec = execFileSync,
  dryRun = false,
  secretNames = [],
}) {
  if (dryRun)
    assert.equal(
      cfToken,
      undefined,
      'Deploy credential forbidden in measurement'
    );
  const rehearsal = await rehearseCalendarPublication({
    appRoot,
    sourceSha: sha,
    config,
    env,
    exec,
  });
  if (dryRun) {
    const measurements = measureBuildOutputUpload(
      config,
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
      traffic: 'activate',
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
    'cf deploy returned no version id'
  );
  assertMeasuredLimits(config, rehearsal.buildRoot, secretNames);
  return versionId;
}
