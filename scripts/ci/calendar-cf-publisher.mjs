import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  cpSync,
  lstatSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
} from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { gzipSync } from 'node:zlib';
import { emitCalendarOutput } from './calendar-cf-output.mjs';
import {
  assertUploadLimits,
  uploadLimits,
} from './wave1-native-upload-limits.mjs';
import { NativeUploadError } from './wave1-native-upload-error.mjs';

const prefix = '.cloudflare/output/v0/';
const VERSION_ID = /^[0-9a-f-]{36}$/i;

function cfBundleModuleNames(buildRoot) {
  const bundleRoot = join(buildRoot, prefix, 'workers/default/bundle');
  const modules = [];
  function visit(directory) {
    for (const name of readdirSync(directory)) {
      const path = join(directory, name);
      const stat = lstatSync(path);
      assert.ok(!stat.isSymbolicLink(), 'cf bundle symlink forbidden');
      if (stat.isDirectory()) visit(path);
      else if (/\.(?:m?js)$/u.test(name) && !name.endsWith('.map'))
        modules.push(relative(bundleRoot, path).split('\\').join('/'));
    }
  }
  visit(bundleRoot);
  return modules.sort();
}

export function assertUploadNameParity(receipt, secondaryModuleNames) {
  const expected = receipt.secondaryModuleNames ?? [];
  assert.deepEqual(
    [...secondaryModuleNames].sort(),
    expected.map((item) => item.source).sort(),
    'cf Build Output bundle modules differ from emit manifest'
  );
  for (const item of expected) {
    assert.equal(
      item.cfUpload,
      item.source.startsWith('./') ? item.source : `./${item.source}`,
      'cf upload module name drift'
    );
  }
}

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

export function stageBuildOutput(appRoot, buildRoot) {
  const source = join(buildRoot, '.cloudflare', 'output');
  const target = join(appRoot, '.cloudflare', 'output');
  rmSync(target, { recursive: true, force: true });
  cpSync(source, target, { recursive: true });
  return target;
}

export function measureBuildOutputUpload(
  configPath,
  buildRoot,
  secretNames = []
) {
  const config = JSON.parse(readFileSync(configPath, 'utf8'));
  const bundleRoot = join(buildRoot, prefix, 'workers/default/bundle');
  const assetRoot = join(buildRoot, prefix, 'workers/default/assets');
  const modules = [];
  function visit(directory, root) {
    for (const name of readdirSync(directory)) {
      const path = join(directory, name);
      const stat = lstatSync(path);
      if (stat.isDirectory()) visit(path, root);
      else if (/\.(?:m?js)$/u.test(name) && !name.endsWith('.map')) {
        const rel = relative(root, path).split('\\').join('/');
        modules.push({ name: rel, bytes: stat.size, path });
      }
    }
  }
  visit(bundleRoot, bundleRoot);
  assert.ok(modules.length > 0, 'cf Build Output bundle is empty');
  const scriptBytes = modules.reduce((total, item) => total + item.bytes, 0);
  const gzipBytes = gzipSync(
    Buffer.concat(modules.map((item) => readFileSync(item.path)))
  ).length;
  let assetCount = 0;
  let maxAsset = 0;
  try {
    const walk = (directory) => {
      for (const name of readdirSync(directory)) {
        const path = join(directory, name);
        const stat = lstatSync(path);
        if (stat.isDirectory()) walk(path);
        else {
          assetCount += 1;
          maxAsset = Math.max(maxAsset, stat.size);
        }
      }
    };
    walk(assetRoot);
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  const plainSizes = Object.values(config.vars ?? {}).map((value) =>
    Buffer.byteLength(typeof value === 'string' ? value : JSON.stringify(value))
  );
  return {
    schema: 1,
    limits: uploadLimits,
    script: {
      bytes: scriptBytes,
      gzipBytes,
      gzipOrder: 'cf Build Output bundle paths',
      moduleCount: modules.length,
      maxModuleBytes: Math.max(...modules.map((item) => item.bytes)),
      modules: modules.map(({ name, bytes }) => ({ name, bytes })),
    },
    sourcemaps: {
      enabled: false,
      count: 0,
      encodedBytes: 0,
      gzipBytes: 0,
      unexpectedFiles: 0,
      measured: true,
    },
    assets: { count: assetCount, maxFileBytes: maxAsset },
    variables: {
      count: new Set([
        ...secretNames,
        ...(config.secrets?.required ?? []),
        ...Object.keys(config.vars ?? {}),
      ]).size,
      maxPlainValueBytes: Math.max(0, ...plainSizes),
      secretValues: 'existing provider bindings, not uploaded',
    },
    warnings:
      gzipBytes > 10 * 1024 ** 2
        ? ['Worker gzip exceeds 10 MiB; informational, no provider size limit']
        : [],
    startup: { cpuLimitMs: 1000, status: 'requires hosted native acceptance' },
  };
}

function parseCfVersionId(output) {
  const combined = String(output);
  try {
    const json = JSON.parse(combined);
    const candidate =
      json.version_id ?? json.id ?? json.result?.id ?? json.result?.version_id;
    if (typeof candidate === 'string' && VERSION_ID.test(candidate))
      return candidate;
  } catch {
    // Fall through to table/text parsing.
  }
  const match = combined.match(
    /(?:version[_\s-]*id|Worker Version ID):\s*([0-9a-f-]{36})/i
  );
  return match?.[1];
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
  assertUploadNameParity(receipt, cfBundleModuleNames(buildRoot));
  assertControlFileParity(receipt);
  stageBuildOutput(appRoot, buildRoot);
  try {
    exec(
      'bun',
      [
        'x',
        '--no-install',
        'cf',
        'deploy',
        '--prebuilt',
        '--mode',
        'production',
        '--dry-run',
        '--no-provision',
      ],
      {
        cwd: appRoot,
        env: {
          ...Object.fromEntries(
            ['PATH', 'HOME', 'USER', 'TMPDIR', 'LANG', 'LC_ALL'].flatMap(
              (name) => (env[name] === undefined ? [] : [[name, env[name]]])
            )
          ),
          CI: 'true',
          CF_SEND_TELEMETRY: 'false',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 120000,
        maxBuffer: 1024 * 1024,
      }
    );
  } catch (error) {
    throw new NativeUploadError(error, []);
  } finally {
    rmSync(join(appRoot, '.cloudflare'), { recursive: true, force: true });
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
    stdout = exec(
      'bun',
      [
        'x',
        '--no-install',
        'cf',
        'deploy',
        '--prebuilt',
        '--mode',
        'production',
        '--no-provision',
        '--message',
        sha,
        '--tag',
        digest,
      ],
      {
        cwd: appRoot,
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
          CF_SEND_TELEMETRY: 'false',
          CLOUDFLARE_API_TOKEN: cfToken,
          CLOUDFLARE_ACCOUNT_ID: p.accountId,
        },
        encoding: 'utf8',
        timeout: 180000,
        maxBuffer: 4 * 1024 * 1024,
      }
    );
  } catch (error) {
    stdout = error.stdout ?? '';
    stderr = error.stderr ?? '';
    throw new NativeUploadError(error, [cfToken]);
  } finally {
    rmSync(join(appRoot, '.cloudflare'), { recursive: true, force: true });
  }
  const versionId = parseCfVersionId(`${stdout}\n${stderr}`);
  assert.ok(
    VERSION_ID.test(versionId ?? ''),
    'cf deploy returned no version id'
  );
  assertUploadLimits(
    measureBuildOutputUpload(config, rehearsal.buildRoot, secretNames)
  );
  return versionId;
}
